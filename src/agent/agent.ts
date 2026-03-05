/**
 * ============================================================
 * AGENT.TS — The Core Brain of QuantMind
 * ============================================================
 *
 * This is the MOST IMPORTANT file in the entire project.
 * It implements the "agent loop" — the pattern that turns a simple
 * LLM into an intelligent agent that can use tools.
 *
 * THE AGENT LOOP EXPLAINED
 * ========================
 *
 * A normal LLM chat:
 *   User: "What is Apple's stock price?"
 *   LLM: "I don't have real-time data." (it can only use training data)
 *
 * An agent with tools:
 *   User: "What is Apple's stock price?"
 *   Agent Loop:
 *     Iteration 1:
 *       → Send query to LLM (with tools bound)
 *       ← LLM says: "I'll use get_price_snapshot" + tool_call({ticker: "AAPL"})
 *       → Agent executes the tool → gets real price data
 *       → Feeds result back to LLM
 *     Iteration 2:
 *       → LLM sees the price data
 *       ← LLM says: "Apple (AAPL) is trading at $228.50, up 1.2% today."
 *       → No tool calls = we're done!
 *
 * This is the "ReAct" pattern:
 *   Re(ason) → Act → Observe → Repeat → Answer
 *
 * ASYNC GENERATORS — THE KEY PATTERN
 * ===================================
 *
 * The agent loop uses async generators (async function*) to STREAM events
 * to the UI in real-time. Without this, the UI would freeze until the
 * entire loop is done.
 *
 * Normal function: runs to completion, returns ONE value
 *   function add(a, b) { return a + b; }  →  3
 *
 * Generator function: can PAUSE and yield MULTIPLE values over time
 *   function* count() { yield 1; yield 2; yield 3; }  →  1, then 2, then 3
 *
 * Async generator: same but with await (for async operations)
 *   async function* agent() {
 *     yield { type: 'thinking', message: 'Let me search...' };
 *     const data = await searchTool();
 *     yield { type: 'tool_end', result: data };
 *     yield { type: 'done', answer: 'Apple is at $228' };
 *   }
 *
 * The UI consumes these events one at a time:
 *   for await (const event of agent.run("query")) {
 *     if (event.type === 'thinking') showSpinner(event.message);
 *     if (event.type === 'tool_end') showToolResult(event.result);
 *     if (event.type === 'done') showAnswer(event.answer);
 *   }
 *
 * This is what makes the CLI feel responsive — you see "Thinking...",
 * then "Searching AAPL...", then the final answer, all in real-time.
 *
 * CLASS ARCHITECTURE
 * ==================
 *
 * We use a CLASS (not just functions) because:
 *   1. The agent has STATE (model name, tools, system prompt)
 *   2. Multiple methods need to share that state
 *   3. The constructor validates configuration upfront
 *
 * We use a PRIVATE constructor + STATIC factory:
 *   - Private constructor: prevents `new Agent()` from outside
 *   - Static `Agent.create()`: the only way to make an Agent
 *   - This ensures tools and prompts are always set up correctly
 *
 * WHY? It prevents creating an Agent in an invalid state:
 *   BAD:  new Agent()  ← no tools, no prompt, will crash later
 *   GOOD: Agent.create({ model: "gemini-2.5-flash" })  ← everything set up
 */

import { AIMessage } from '@langchain/core/messages';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { callLlm } from '../model/llm';
import { Scratchpad } from './scratchpad';
import type { ToolContext } from './scratchpad';
import { buildSystemPrompt, buildIterationPrompt, buildFinalAnswerPrompt } from './prompts';
import { extractTextContent, hasToolCalls } from '../utils/ai-message';
import { estimateTokens, CONTEXT_THRESHOLD, KEEP_TOOL_USES } from '../utils/tokens';
import { TokenCounter } from './token-counter';
import type {
  AgentConfig,
  AgentEvent,
  ToolStartEvent,
  ToolEndEvent,
  ToolErrorEvent,
  ToolLimitEvent,
  ContextClearedEvent,
  TokenUsage,
} from './types';

// ============================================================================
// Constants
// ============================================================================

/**
 * Maximum number of iterations (LLM calls) per query.
 *
 * This is a SAFETY LIMIT to prevent infinite loops.
 * If the agent calls 10 tools and still hasn't answered,
 * something is probably wrong. Force a final answer.
 *
 * In practice, most queries complete in 2-4 iterations:
 *   1. LLM decides to call a tool
 *   2. LLM sees results, maybe calls another tool
 *   3. LLM has enough data, writes final answer
 */
const DEFAULT_MAX_ITERATIONS = 10;

// ============================================================================
// Agent Class
// ============================================================================

export class Agent {
  // ── Private fields (the agent's internal state) ──────────────────────────
  //
  // All fields are `readonly` — once set in the constructor, they never change.
  // This makes the agent IMMUTABLE (predictable, no surprise state changes).

  /** Which model to use (e.g., "gemini-2.5-flash") */
  private readonly model: string;

  /** Maximum iterations before forcing a final answer */
  private readonly maxIterations: number;

  /** The tools the agent can use (will be populated when we build tools) */
  private readonly tools: StructuredToolInterface[];

  /** Map of tool name → tool object for quick lookup */
  private readonly toolMap: Map<string, StructuredToolInterface>;

  /** The system prompt (built once, reused for every LLM call) */
  private readonly systemPrompt: string;

  /** Optional AbortSignal for cancellation (user presses Escape) */
  private readonly signal?: AbortSignal;

  // ── Private Constructor ──────────────────────────────────────────────────
  //
  // PRIVATE means: only code INSIDE this class can call `new Agent()`.
  // Everyone else MUST use `Agent.create()`.
  //
  // WHY?
  // The constructor needs tools and a system prompt to be pre-built.
  // If we made it public, someone could do:
  //   new Agent(config, [], "")  ← broken agent with no tools and empty prompt
  //
  // Agent.create() handles all the setup, THEN calls the constructor.

  private constructor(
    config: AgentConfig,
    tools: StructuredToolInterface[],
    systemPrompt: string
  ) {
    this.model = config.model ?? 'gemini-2.5-flash';
    this.maxIterations = config.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    this.tools = tools;
    this.signal = config.signal;
    this.systemPrompt = systemPrompt;

    // Build a Map for O(1) tool lookup by name
    // Before: tools.find(t => t.name === "get_price")  ← O(n) linear search
    // After:  toolMap.get("get_price")                  ← O(1) instant lookup
    this.toolMap = new Map(tools.map(t => [t.name, t]));
  }

  // ── Static Factory Method ────────────────────────────────────────────────
  //
  // This is a "factory" — a method that CREATES objects.
  // It's static, meaning you call Agent.create(), not agent.create().
  //
  // WHAT IT DOES:
  //   1. Takes a config (model name, max iterations, etc.)
  //   2. Loads all available tools (we'll add these in Steps 10-15)
  //   3. Builds the system prompt (with tool descriptions)
  //   4. Creates and returns a fully-configured Agent

  /**
   * Create a new Agent instance.
   *
   * @param config - Agent configuration (all fields optional)
   * @param tools  - Tools to give the agent (default: empty for now)
   * @returns A fully configured Agent ready to run
   *
   * Usage:
   *   const agent = Agent.create({ model: "gemini-2.5-flash" });
   *   for await (const event of agent.run("What is AAPL's price?")) {
   *     console.log(event);
   *   }
   */
  static create(config: AgentConfig = {}, tools: StructuredToolInterface[] = []): Agent {
    const model = config.model ?? 'gemini-2.5-flash';
    const systemPrompt = buildSystemPrompt(model);
    return new Agent(config, tools, systemPrompt);
  }

  // ════════════════════════════════════════════════════════════════════════
  // THE MAIN AGENT LOOP
  // ════════════════════════════════════════════════════════════════════════
  //
  // This is the heart of the agent. Read this carefully!
  //
  // FLOW:
  //   1. Create a scratchpad (lab notebook for this query)
  //   2. Send query to LLM
  //   3. Check LLM response:
  //      a. Has tool calls? → Execute tools → Go to step 2
  //      b. No tool calls? → Generate final answer → Done
  //   4. If we hit max iterations → Force final answer → Done
  //
  // EVENTS YIELDED:
  //   { type: 'thinking', message: '...' }     — LLM is reasoning
  //   { type: 'tool_start', tool: '...' }      — About to run a tool
  //   { type: 'tool_end', result: '...' }      — Tool finished
  //   { type: 'tool_error', error: '...' }     — Tool failed
  //   { type: 'tool_limit', warning: '...' }   — Tool approaching limit
  //   { type: 'context_cleared', ... }         — Old context was cleared
  //   { type: 'answer_start' }                 — About to generate answer
  //   { type: 'done', answer: '...' }          — FINAL answer ready

  /**
   * Run the agent on a query and yield events.
   *
   * @param query - The user's question
   * @yields AgentEvent objects in real-time
   */
  async *run(query: string): AsyncGenerator<AgentEvent> {
    // Track timing for performance reporting
    const startTime = Date.now();

    // Track token usage across all LLM calls
    const tokenCounter = new TokenCounter();

    // ── EARLY EXIT: No tools available ──────────────────────────────────
    // If no tools are registered, the agent can't do research.
    // Return a helpful error instead of silently failing.
    if (this.tools.length === 0) {
      // Even with no tools, we can still act as a simple chatbot
      // Call the LLM directly (no tools bound) for a direct response
      const { response, usage } = await this.callModel(query, false);
      tokenCounter.add(usage);

      const answer = typeof response === 'string'
        ? response
        : extractTextContent(response);

      yield { type: 'answer_start' };
      yield {
        type: 'done',
        answer: answer || 'No tools available and could not generate a response.',
        toolCalls: [],
        iterations: 1,
        totalTime: Date.now() - startTime,
        tokenUsage: tokenCounter.getUsage(),
        tokensPerSecond: tokenCounter.getTokensPerSecond(Date.now() - startTime),
      };
      return;
    }

    // ── CREATE SCRATCHPAD ───────────────────────────────────────────────
    // One scratchpad per query. It records everything the agent does.
    const scratchpad = new Scratchpad(query);

    // Start with the user's query as the first prompt
    let currentPrompt = query;
    let iteration = 0;

    // ── THE LOOP ────────────────────────────────────────────────────────
    // Keep going until:
    //   1. LLM responds WITHOUT tool calls (ready to answer), OR
    //   2. We hit maxIterations (safety limit)

    while (iteration < this.maxIterations) {
      iteration++;

      // ── Step 1: Call the LLM ──────────────────────────────────────────
      // Send the current prompt to the LLM with tools bound.
      // The LLM will either:
      //   a. Return text only → ready to answer
      //   b. Return text + tool_calls → needs to use tools
      //   c. Return tool_calls only → wants to use tools silently
      const { response, usage } = await this.callModel(currentPrompt);
      tokenCounter.add(usage);

      // Extract text content from the response
      const responseText = typeof response === 'string'
        ? response
        : extractTextContent(response);

      // ── Step 2: Handle thinking ───────────────────────────────────────
      // If the LLM returned BOTH text AND tool calls, the text is its
      // "reasoning" — what it's thinking before calling tools.
      //
      // Example:
      //   text: "I need to look up Apple's stock price."
      //   tool_calls: [{ name: "get_price", args: { ticker: "AAPL" } }]
      //
      // We yield this as a 'thinking' event so the UI can show it.
      if (
        responseText?.trim() &&
        typeof response !== 'string' &&
        hasToolCalls(response)
      ) {
        const trimmedText = responseText.trim();
        scratchpad.addThinking(trimmedText);
        yield { type: 'thinking', message: trimmedText };
      }

      // ── Step 3: Check for tool calls ──────────────────────────────────
      // If no tool calls → the LLM is ready to answer (or it's a simple chat)
      if (typeof response === 'string' || !hasToolCalls(response)) {

        // Case A: No tools were ever called → direct response
        // This handles greetings, simple questions, etc.
        // "Hi!" → "Hello! How can I help?"  (no tools needed)
        if (!scratchpad.hasToolResults() && responseText) {
          yield { type: 'answer_start' };
          const totalTime = Date.now() - startTime;
          yield {
            type: 'done',
            answer: responseText,
            toolCalls: [],
            iterations: iteration,
            totalTime,
            tokenUsage: tokenCounter.getUsage(),
            tokensPerSecond: tokenCounter.getTokensPerSecond(totalTime),
          };
          return;
        }

        // Case B: Tools were called → generate final answer with full context
        // Load ALL tool results from the scratchpad (full data, not summaries)
        // and ask the LLM to write a comprehensive answer.
        const fullContext = this.buildFullContextForAnswer(query, scratchpad);
        const finalPrompt = buildFinalAnswerPrompt(query, fullContext);

        yield { type: 'answer_start' };
        const { response: finalResponse, usage: finalUsage } =
          await this.callModel(finalPrompt, false);
        tokenCounter.add(finalUsage);

        const answer = typeof finalResponse === 'string'
          ? finalResponse
          : extractTextContent(finalResponse);

        const totalTime = Date.now() - startTime;
        yield {
          type: 'done',
          answer,
          toolCalls: scratchpad.getToolCallRecords(),
          iterations: iteration,
          totalTime,
          tokenUsage: tokenCounter.getUsage(),
          tokensPerSecond: tokenCounter.getTokensPerSecond(totalTime),
        };
        return;
      }

      // ── Step 4: Execute tool calls ────────────────────────────────────
      // The LLM wants to use tools! Execute each one and yield events.
      const generator = this.executeToolCalls(response, query, scratchpad);
      let result = await generator.next();

      while (!result.done) {
        yield result.value;
        result = await generator.next();
      }

      // ── Step 5: Context management ────────────────────────────────────
      // Get all tool results as a formatted string for the next iteration.
      let fullToolResults = scratchpad.getToolResults();

      // Check if context is getting too large
      // If so, clear oldest tool results to stay within limits
      const estimatedContextTokens = estimateTokens(
        this.systemPrompt + query + fullToolResults
      );

      if (estimatedContextTokens > CONTEXT_THRESHOLD) {
        const clearedCount = scratchpad.clearOldestToolResults(KEEP_TOOL_USES);
        if (clearedCount > 0) {
          yield {
            type: 'context_cleared',
            clearedCount,
            keptCount: KEEP_TOOL_USES,
          } as ContextClearedEvent;

          // Re-fetch results after clearing
          fullToolResults = scratchpad.getToolResults();
        }
      }

      // ── Step 6: Build next iteration prompt ───────────────────────────
      // Combine: original query + tool results + tool usage warnings
      // This becomes the prompt for the NEXT iteration of the loop.
      currentPrompt = buildIterationPrompt(
        query,
        fullToolResults,
        scratchpad.formatToolUsageForPrompt()
      );
    }

    // ── MAX ITERATIONS REACHED ──────────────────────────────────────────
    // Safety net: if we've looped maxIterations times and still haven't
    // answered, force a final answer with whatever data we have.
    const fullContext = this.buildFullContextForAnswer(query, scratchpad);
    const finalPrompt = buildFinalAnswerPrompt(query, fullContext);

    yield { type: 'answer_start' };
    const { response: finalResponse, usage: finalUsage } =
      await this.callModel(finalPrompt, false);
    tokenCounter.add(finalUsage);

    const answer = typeof finalResponse === 'string'
      ? finalResponse
      : extractTextContent(finalResponse);

    const totalTime = Date.now() - startTime;
    yield {
      type: 'done',
      answer: answer || `Reached maximum iterations (${this.maxIterations}).`,
      toolCalls: scratchpad.getToolCallRecords(),
      iterations: iteration,
      totalTime,
      tokenUsage: tokenCounter.getUsage(),
      tokensPerSecond: tokenCounter.getTokensPerSecond(totalTime),
    };
  }

  // ════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPER METHODS
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Call the LLM with the current prompt.
   *
   * This wraps our callLlm function with the agent's configuration.
   *
   * @param prompt   - The text to send to the LLM
   * @param useTools - Whether to bind tools (default: true).
   *                   Set to false for final answer generation
   *                   (we don't want the LLM calling more tools at that point).
   */
  private async callModel(
    prompt: string,
    useTools: boolean = true
  ): Promise<{ response: AIMessage | string; usage?: TokenUsage }> {
    const result = await callLlm(prompt, {
      model: this.model,
      systemPrompt: this.systemPrompt,
      tools: useTools ? this.tools : undefined,
      signal: this.signal,
    });
    return { response: result.response, usage: result.usage };
  }

  /**
   * Execute ALL tool calls from an LLM response.
   *
   * An LLM can request MULTIPLE tools in a single response:
   *   tool_calls: [
   *     { name: "get_price", args: { ticker: "AAPL" } },
   *     { name: "get_price", args: { ticker: "MSFT" } },
   *   ]
   *
   * We execute them one by one (sequentially, not in parallel) because:
   *   1. Simpler to implement and debug
   *   2. Rate limiting — parallel calls might hit API limits
   *   3. Each tool's result can inform the next (in theory)
   *
   * @param response   - The AIMessage containing tool_calls
   * @param query      - Original user query (for scratchpad)
   * @param scratchpad - The scratchpad to record results
   */
  private async *executeToolCalls(
    response: AIMessage,
    query: string,
    scratchpad: Scratchpad
  ): AsyncGenerator<ToolStartEvent | ToolEndEvent | ToolErrorEvent | ToolLimitEvent, void> {
    // response.tool_calls is an array of { name, args } objects
    // The ! tells TypeScript "I know this is not null" (we checked with hasToolCalls)
    for (const toolCall of response.tool_calls!) {
      const toolName = toolCall.name;
      const toolArgs = toolCall.args as Record<string, unknown>;

      // Execute this single tool call
      const generator = this.executeToolCall(toolName, toolArgs, query, scratchpad);
      let result = await generator.next();

      while (!result.done) {
        yield result.value;
        result = await generator.next();
      }
    }
  }

  /**
   * Execute a SINGLE tool call.
   *
   * FLOW:
   *   1. Check tool limits (warn if approaching)
   *   2. Yield 'tool_start' event (UI shows "Searching AAPL...")
   *   3. Find the tool by name
   *   4. Call tool.invoke(args)
   *   5. Yield 'tool_end' event (UI shows result)
   *   6. Record in scratchpad
   *
   * ERROR HANDLING:
   *   If the tool throws, we:
   *   - Yield 'tool_error' event
   *   - Record the error in scratchpad (so the LLM knows it failed)
   *   - Continue the loop (don't crash the entire agent)
   */
  private async *executeToolCall(
    toolName: string,
    toolArgs: Record<string, unknown>,
    query: string,
    scratchpad: Scratchpad
  ): AsyncGenerator<ToolStartEvent | ToolEndEvent | ToolErrorEvent | ToolLimitEvent, void> {
    // Extract the query/search text from tool args for similarity detection
    const toolQuery = this.extractQueryFromArgs(toolArgs);

    // Check limits — get warning if approaching/over
    const limitCheck = scratchpad.canCallTool(toolName, toolQuery);

    if (limitCheck.warning) {
      yield {
        type: 'tool_limit',
        tool: toolName,
        warning: limitCheck.warning,
        blocked: false, // We NEVER block, only warn
      };
    }

    // ── Yield tool_start event ──────────────────────────────────────────
    yield { type: 'tool_start', tool: toolName, args: toolArgs };

    const toolStartTime = Date.now();

    try {
      // ── Find the tool ─────────────────────────────────────────────────
      const tool = this.toolMap.get(toolName);
      if (!tool) {
        throw new Error(`Tool '${toolName}' not found`);
      }

      // ── Invoke the tool ───────────────────────────────────────────────
      // tool.invoke() runs the tool's function with the given arguments.
      // This is where the actual API call happens (e.g., fetching stock data).
      const rawResult = await tool.invoke(
        toolArgs,
        this.signal ? { signal: this.signal } : undefined
      );

      // Convert result to string (tools can return objects or strings)
      const result = typeof rawResult === 'string'
        ? rawResult
        : JSON.stringify(rawResult);

      const duration = Date.now() - toolStartTime;

      // ── Yield tool_end event ──────────────────────────────────────────
      yield { type: 'tool_end', tool: toolName, args: toolArgs, result, duration };

      // ── Record in scratchpad ──────────────────────────────────────────
      scratchpad.recordToolCall(toolName, toolQuery);
      scratchpad.addToolResult(toolName, toolArgs, result);

    } catch (error) {
      // ── Handle errors gracefully ──────────────────────────────────────
      const errorMessage = error instanceof Error ? error.message : String(error);

      yield { type: 'tool_error', tool: toolName, error: errorMessage };

      // Still record the call (counts toward limit even on failure)
      scratchpad.recordToolCall(toolName, toolQuery);

      // Record error in scratchpad so the LLM knows this tool failed
      scratchpad.addToolResult(toolName, toolArgs, `Error: ${errorMessage}`);
    }
  }

  /**
   * Extract the query/search string from tool arguments.
   *
   * Different tools use different argument names for their query:
   *   financial_search({ query: "Apple revenue" })
   *   web_search({ search: "Apple news" })
   *   lookup({ q: "AAPL" })
   *
   * We check common names and return the first match.
   * This is used for SIMILARITY DETECTION in the scratchpad
   * (prevent the agent from asking the same question twice).
   */
  private extractQueryFromArgs(args: Record<string, unknown>): string | undefined {
    const queryKeys = ['query', 'search', 'question', 'q', 'text', 'input'];

    for (const key of queryKeys) {
      if (typeof args[key] === 'string') {
        return args[key] as string;
      }
    }

    return undefined;
  }

  /**
   * Build the full context data for final answer generation.
   *
   * This loads ALL tool results from the scratchpad and formats them
   * for the LLM to write its final answer.
   *
   * IMPORTANT: This uses FULL data, not summaries.
   * During iteration we may have cleared old context (for speed),
   * but for the final answer we want ALL the data (for accuracy).
   */
  private buildFullContextForAnswer(_query: string, scratchpad: Scratchpad): string {
    //                                ^^^^^^
    // The underscore prefix means "I receive this parameter but don't use it yet".
    // TypeScript would complain about unused parameters without it.
    // We keep it in the signature for future use (e.g., query-specific filtering).

    const contexts = scratchpad.getFullContexts();

    if (contexts.length === 0) {
      return 'No data was gathered.';
    }

    // Filter out error results (they're not useful for the final answer)
    const validContexts = contexts.filter(ctx => !ctx.result.startsWith('Error:'));

    if (validContexts.length === 0) {
      return 'No data was successfully gathered.';
    }

    // Format each tool result with its name and arguments
    return validContexts
      .map(ctx => this.formatToolContext(ctx))
      .join('\n\n');
  }

  /**
   * Format a single tool context for the final answer prompt.
   *
   * Example output:
   *   ### get_price_snapshot({"ticker":"AAPL"})
   *   ```json
   *   {
   *     "price": 228.50,
   *     "change": "+1.2%"
   *   }
   *   ```
   */
  private formatToolContext(ctx: ToolContext): string {
    const argsStr = JSON.stringify(ctx.args);
    try {
      // Pretty-print JSON results (with indentation)
      const prettyResult = JSON.stringify(JSON.parse(ctx.result), null, 2);
      return `### ${ctx.toolName}(${argsStr})\n\`\`\`json\n${prettyResult}\n\`\`\``;
    } catch {
      // If result is not JSON (plain text, error messages), use as-is
      return `### ${ctx.toolName}(${argsStr})\n${ctx.result}`;
    }
  }
}
