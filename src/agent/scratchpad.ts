/**
 * =========================
 * Scratchpad - The Agent's Lab Notebook
 * =========================
 *
 * Every time a user asks a question, the agent creates a Scratchpad.
 * It records EVERYTHING the agent does:
 *   - The original query
 *   - Every tool call (name, args, result, summary)
 *   - Every thinking step
 *
 * WHY:
 *   1. Debugging - you can open the JSONL file and see exactly what happened
 *   2. Final answer - the agent reads back its work to write a comprehensive answer
 *   3. Tool limits - tracks how many times each tool was called to prevent loops
 *
 * HOW:
 *   - Append-only JSONL (newline-delimited JSON)
 *   - Each line is a valid JSON object
 *   - If the app crashes mid-write, all previous lines are safe
 *   - Files stored in .quantmind/scratchpad/
 */

import { existsSync, mkdirSync, appendFileSync, readFileSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";

// ============================================================================
// Interfaces
// ============================================================================

/**
 * Simplified record of a tool call.
 * Used in DoneEvent to tell the UI what tools were called.
 * Doesn't include the LLM summary - just the raw data.
 */
export interface ToolCallRecord {
  tool: string;
  args: Record<string, unknown>;
  result: string;
}

/**
 * Full context for final answer generation.
 * When the agent is ready to answer, it loads ALL tool results
 * with full data (not just summaries) to give the LLM maximum context.
 */
export interface ToolContext {
  toolName: string;
  args: Record<string, unknown>;
  result: string;
}

/**
 * ToolContext + LLM summary + index.
 * Used when context exceeds token budget.
 * The LLM picks which results need full data vs just summaries.
 * The index lets the LLM reference specific results: "I need [0] and [3]"
 */
export interface ToolContextWithSummary extends ToolContext {
  llmSummary: string;
  index: number;
}

/**
 * One line in the JSONL file.
 * Each entry has a type that tells you what happened:
 *   - "init": the query that started this scratchpad
 *   - "tool_result": a tool was called and returned data
 *   - "thinking": the agent reasoned about something
 */
export interface ScratchpadEntry {
  type: "init" | "tool_result" | "thinking";
  timestamp: string;

  // For init and thinking entries:
  content?: string;

  // For tool_result entries:
  toolName?: string;
  args?: Record<string, unknown>;
  result?: unknown; // Stored as parsed JSON object when possible, string otherwise
  llmSummary?: string;
}

/**
 * Configuration for tool call limits.
 * These are SOFT limits - we warn but never block.
 *
 * maxCallsPerTool: How many times can one tool be called per query?
 *   - Default 3. After 3 calls to the same tool, the agent gets a warning.
 *
 * similarityThreshold: How similar must two queries be to trigger a warning?
 *   - Default 0.7 (70% word overlap). Prevents the agent from retrying
 *     the same query with slightly different wording.
 */
export interface ToolLimitConfig {
  maxCallsPerTool: number;
  similarityThreshold: number;
}

/**
 * Status of how much a tool has been used.
 * Injected into prompts so the LLM knows its limits.
 */
export interface ToolUsageStatus {
  toolName: string;
  callCount: number;
  maxCalls: number;
  remainingCalls: number;
  recentQueries: string[];
  isBlocked: boolean; // Always false - we warn, never block
  blockReason?: string;
}

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_LIMIT_CONFIG: ToolLimitConfig = {
  maxCallsPerTool: 3,
  similarityThreshold: 0.7,
};

// ============================================================================
// Scratchpad Class
// ============================================================================

export class Scratchpad {
  private readonly scratchpadDir = ".quantmind/scratchpad";
  private readonly filepath: string;
  private readonly limitConfig: ToolLimitConfig;

  // In-memory tracking (also persisted in JSONL, but faster to check in memory)
  //
  // toolCallCounts: "financial_search" → 2 (called twice so far)
  // toolQueries: "financial_search" → ["Apple revenue", "Tesla revenue"]
  private toolCallCounts: Map<string, number> = new Map();
  private toolQueries: Map<string, string[]> = new Map();

  /**
   * Create a new scratchpad for a query.
   *
   * What happens:
   * 1. Creates .quantmind/scratchpad/ directory if it doesn't exist
   * 2. Generates a unique filename from timestamp + MD5 hash of the query
   *    Example: "2026-02-11-153045_a1b2c3d4e5f6.jsonl"
   * 3. Writes the first line: { type: "init", content: "user's query" }
   */
  constructor(query: string, limitConfig?: Partial<ToolLimitConfig>) {
    // Merge user config with defaults (user values override defaults)
    this.limitConfig = { ...DEFAULT_LIMIT_CONFIG, ...limitConfig };

    // Create directory if it doesn't exist
    // { recursive: true } means it creates parent dirs too (.quantmind/ and scratchpad/)
    if (!existsSync(this.scratchpadDir)) {
      mkdirSync(this.scratchpadDir, { recursive: true });
    }

    // Generate unique filename:
    // 1. Hash the query with MD5 → take first 12 chars
    //    "What is Apple's revenue?" → "a1b2c3d4e5f6"
    const hash = createHash("md5").update(query).digest("hex").slice(0, 12);

    // 2. Format timestamp: "2026-02-11-153045"
    const now = new Date();
    const timestamp = now
      .toISOString()
      .slice(0, 19) // "2026-02-11T15:30:45"
      .replace("T", "-") // "2026-02-11-15:30:45"
      .replace(/:/g, ""); // "2026-02-11-153045"

    // 3. Combine: "2026-02-11-153045_a1b2c3d4e5f6.jsonl"
    this.filepath = join(this.scratchpadDir, `${timestamp}_${hash}.jsonl`);

    // Write the first entry
    this.append({
      type: "init",
      content: query,
      timestamp: new Date().toISOString(),
    });
  }

  // ============================================================================
  // Writing Methods (append data to the JSONL file)
  // ============================================================================

  /**
   * Record a tool result.
   * Called after a tool executes successfully.
   *
   * Stores both the full raw result AND the LLM summary.
   * - Full result: used for final answer generation (maximum accuracy)
   * - LLM summary: used during iterations (saves tokens)
   */
  addToolResult(
    toolName: string,
    args: Record<string, unknown>,
    result: string,
    llmSummary: string
  ): void {
    this.append({
      type: "tool_result",
      timestamp: new Date().toISOString(),
      toolName,
      args,
      result: this.parseResultSafely(result),
      llmSummary,
    });
  }

  /**
   * Record a thinking step.
   * When the LLM outputs text alongside tool calls,
   * that text is the agent's reasoning.
   */
  addThinking(thought: string): void {
    this.append({
      type: "thinking",
      content: thought,
      timestamp: new Date().toISOString(),
    });
  }

  // ============================================================================
  // Reading Methods (read data back from the JSONL file)
  // ============================================================================

  /**
   * Get all LLM summaries for building the iteration prompt.
   *
   * During the agent loop, we don't send full tool results to the LLM
   * (too many tokens). Instead we send these short summaries.
   *
   * Example return:
   * [
   *   "get_income_statements(AAPL) -> Apple revenue was $394B in FY2025",
   *   "get_price_snapshot(AAPL) -> Apple stock is $228.50"
   * ]
   */
  getToolSummaries(): string[] {
    return this.readEntries()
      .filter((e) => e.type === "tool_result" && e.llmSummary)
      .map((e) => e.llmSummary!);
  }

  /**
   * Get simplified tool call records for DoneEvent.
   * The UI uses this to show what tools were called.
   */
  getToolCallRecords(): ToolCallRecord[] {
    return this.readEntries()
      .filter((e) => e.type === "tool_result" && e.toolName)
      .map((e) => ({
        tool: e.toolName!,
        args: e.args!,
        result: this.stringifyResult(e.result),
      }));
  }

  /**
   * Get full contexts for final answer generation.
   * This is the FULL data - not summaries.
   * Used when the agent is ready to write its final answer.
   */
  getFullContexts(): ToolContext[] {
    return this.readEntries()
      .filter((e) => e.type === "tool_result" && e.toolName && e.result)
      .map((e) => ({
        toolName: e.toolName!,
        args: e.args!,
        result: this.stringifyResult(e.result),
      }));
  }

  /**
   * Get full contexts WITH summaries AND indices.
   * Used when context exceeds token budget.
   * The LLM selects which results need full data by index.
   */
  getFullContextsWithSummaries(): ToolContextWithSummary[] {
    return this.readEntries()
      .filter((e) => e.type === "tool_result" && e.toolName && e.result)
      .map((e, index) => ({
        toolName: e.toolName!,
        args: e.args!,
        result: this.stringifyResult(e.result),
        llmSummary: e.llmSummary || "",
        index,
      }));
  }

  /**
   * Check if any tool results have been recorded.
   * Used to decide: should we generate a final answer with context,
   * or just return the LLM's direct response?
   */
  hasToolResults(): boolean {
    return this.readEntries().some((e) => e.type === "tool_result");
  }

  /**
   * Check if a skill has already been executed.
   * Each skill should only run once per query (deduplication).
   */
  hasExecutedSkill(skillName: string): boolean {
    return this.readEntries().some(
      (e) =>
        e.type === "tool_result" &&
        e.toolName === "skill" &&
        e.args?.skill === skillName
    );
  }

  // ============================================================================
  // Tool Limit Methods (prevent infinite loops)
  // ============================================================================

  /**
   * Check if a tool call should proceed.
   * Returns { allowed: true } always (we never block).
   * But includes a WARNING message if:
   *   1. Tool has been called too many times
   *   2. Query is too similar to a previous call
   *   3. Approaching the limit (1 call remaining)
   *
   * The warning is injected into the prompt so the LLM sees it
   * and hopefully changes its approach.
   */
  canCallTool(
    toolName: string,
    query?: string
  ): { allowed: boolean; warning?: string } {
    const currentCount = this.toolCallCounts.get(toolName) ?? 0;
    const maxCalls = this.limitConfig.maxCallsPerTool;

    // Over the limit - warn with suggestions
    if (currentCount >= maxCalls) {
      return {
        allowed: true,
        warning:
          `Tool '${toolName}' has been called ${currentCount} times (suggested limit: ${maxCalls}). ` +
          `Consider: (1) trying a different tool, (2) using different search terms, or ` +
          `(3) proceeding with what you have.`,
      };
    }

    // Check if this query is too similar to a previous one
    if (query) {
      const previousQueries = this.toolQueries.get(toolName) ?? [];
      const similarQuery = this.findSimilarQuery(query, previousQueries);

      if (similarQuery) {
        const remaining = maxCalls - currentCount;
        return {
          allowed: true,
          warning:
            `This query is very similar to a previous '${toolName}' call. ` +
            `You have ${remaining} attempt(s) remaining. ` +
            `Consider trying a different approach.`,
        };
      }
    }

    // Approaching limit (1 call remaining)
    if (currentCount === maxCalls - 1) {
      return {
        allowed: true,
        warning:
          `Approaching limit for '${toolName}' (${currentCount + 1}/${maxCalls}). ` +
          `Make this call count.`,
      };
    }

    // All good, no warning
    return { allowed: true };
  }

  /**
   * Record that a tool was called.
   * Call this AFTER the tool executes (success or failure).
   * Increments the counter and stores the query for similarity checking.
   */
  recordToolCall(toolName: string, query?: string): void {
    // Increment call count
    const currentCount = this.toolCallCounts.get(toolName) ?? 0;
    this.toolCallCounts.set(toolName, currentCount + 1);

    // Track the query text
    if (query) {
      const queries = this.toolQueries.get(toolName) ?? [];
      queries.push(query);
      this.toolQueries.set(toolName, queries);
    }
  }

  /**
   * Get usage status for all tools.
   * Formatted for injection into prompts.
   */
  getToolUsageStatus(): ToolUsageStatus[] {
    const statuses: ToolUsageStatus[] = [];

    for (const [toolName, callCount] of this.toolCallCounts) {
      const maxCalls = this.limitConfig.maxCallsPerTool;
      const remainingCalls = Math.max(0, maxCalls - callCount);
      const recentQueries = this.toolQueries.get(toolName) ?? [];

      statuses.push({
        toolName,
        callCount,
        maxCalls,
        remainingCalls,
        recentQueries: recentQueries.slice(-3), // Last 3 queries only
        isBlocked: false, // Never block
        blockReason:
          callCount >= maxCalls
            ? `Over suggested limit of ${maxCalls} calls`
            : undefined,
      });
    }

    return statuses;
  }

  /**
   * Format tool usage as a string for prompt injection.
   * Returns null if no tools have been called yet.
   *
   * Example output:
   *   ## Tool Usage This Query
   *   - financial_search: 2/3 calls
   *   - web_search: 1/3 calls
   */
  formatToolUsageForPrompt(): string | null {
    const statuses = this.getToolUsageStatus();
    if (statuses.length === 0) return null;

    const lines = statuses.map((s) => {
      const status =
        s.callCount >= s.maxCalls
          ? `${s.callCount} calls (over suggested limit of ${s.maxCalls})`
          : `${s.callCount}/${s.maxCalls} calls`;
      return `- ${s.toolName}: ${status}`;
    });

    return (
      `## Tool Usage This Query\n\n${lines.join("\n")}\n\n` +
      `Note: If a tool isn't returning useful results, try a different approach.`
    );
  }

  // ============================================================================
  // Similarity Detection (prevents retry loops)
  // ============================================================================

  /**
   * Find a previous query that is too similar to the new one.
   *
   * Uses Jaccard similarity: intersection / union of word sets.
   *
   * Example:
   *   "Apple revenue 2024" vs "Apple revenue 2025"
   *   Words: {apple, revenue, 2024} vs {apple, revenue, 2025}
   *   Intersection: {apple, revenue} = 2
   *   Union: {apple, revenue, 2024, 2025} = 4
   *   Similarity: 2/4 = 0.5 → below 0.7 threshold → OK, not similar
   *
   *   "Apple revenue" vs "Apple revenue data"
   *   Words: {apple, revenue} vs {apple, revenue, data}
   *   Intersection: {apple, revenue} = 2
   *   Union: {apple, revenue, data} = 3
   *   Similarity: 2/3 = 0.67 → below 0.7 → OK
   *
   *   "Apple revenue" vs "Apple revenue"
   *   Similarity: 1.0 → above 0.7 → WARNING!
   */
  private findSimilarQuery(
    newQuery: string,
    previousQueries: string[]
  ): string | null {
    const newWords = this.tokenize(newQuery);

    for (const prevQuery of previousQueries) {
      const prevWords = this.tokenize(prevQuery);
      const similarity = this.calculateSimilarity(newWords, prevWords);

      if (similarity >= this.limitConfig.similarityThreshold) {
        return prevQuery; // Found a match!
      }
    }

    return null; // No similar queries found
  }

  /**
   * Tokenize a query into normalized words.
   *
   * "What is Apple's revenue?" → Set { "what", "apple", "revenue" }
   *
   * Steps:
   * 1. Lowercase everything
   * 2. Replace punctuation with spaces
   * 3. Split on whitespace
   * 4. Filter out tiny words (length ≤ 2) like "is", "a", "in"
   * 5. Put into a Set (removes duplicates)
   */
  private tokenize(query: string): Set<string> {
    return new Set(
      query
        .toLowerCase()
        .replace(/[^\w\s]/g, " ") // "apple's" → "apple s"
        .split(/\s+/) // Split on spaces
        .filter((w) => w.length > 2) // Remove "is", "a", "in", etc.
    );
  }

  /**
   * Calculate Jaccard similarity between two word sets.
   *
   * Jaccard = |intersection| / |union|
   *
   * Returns 0 to 1:
   *   0 = completely different
   *   1 = identical
   */
  private calculateSimilarity(set1: Set<string>, set2: Set<string>): number {
    if (set1.size === 0 || set2.size === 0) return 0;

    // Count words that appear in BOTH sets
    const intersection = [...set1].filter((w) => set2.has(w)).length;

    // Count ALL unique words across both sets
    const union = new Set([...set1, ...set2]).size;

    return intersection / union;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Try to parse a string as JSON.
   * If it's valid JSON, store as an object (cleaner in JSONL output).
   * If not (error messages, plain text), store as-is.
   */
  private parseResultSafely(result: string): unknown {
    try {
      return JSON.parse(result);
    } catch {
      return result;
    }
  }

  /**
   * Convert a stored result back to a string.
   * If it was stored as an object, JSON.stringify it.
   * If it was stored as a string, return as-is.
   */
  private stringifyResult(result: unknown): string {
    if (typeof result === "string") return result;
    return JSON.stringify(result);
  }

  /**
   * Append one entry to the JSONL file.
   * Each call writes exactly one line.
   *
   * appendFileSync is used because:
   * 1. It's synchronous (simple, no race conditions)
   * 2. It APPENDS (doesn't overwrite previous lines)
   * 3. If the app crashes, all previous lines are safe
   */
  private append(entry: ScratchpadEntry): void {
    appendFileSync(this.filepath, JSON.stringify(entry) + "\n");
  }

  /**
   * Read all entries from the JSONL file.
   * Parses each line as JSON.
   *
   * This is called frequently during a query to read back results.
   * For a production app, you'd cache this. For learning, this is fine.
   */
  private readEntries(): ScratchpadEntry[] {
    if (!existsSync(this.filepath)) return [];

    return readFileSync(this.filepath, "utf-8")
      .split("\n") // Split into lines
      .filter((line) => line.trim()) // Remove empty lines
      .map((line) => JSON.parse(line) as ScratchpadEntry); // Parse each line
  }
}