/**
 * ============================================================
 * PROMPTS.TS — The brain instructions for our AI agent
 * ============================================================
 *
 * This file contains ALL the text prompts (instructions)
 * that we send to the LLM (Large Language Model).
 *
 * WHY A SEPARATE FILE?
 * --------------------
 * Imagine you're training a new employee. You'd give them:
 *   1. A handbook (system prompt) — read once, follow always
 *   2. Task updates (iteration prompt) — "here's what you found so far"
 *   3. Final briefing (final answer prompt) — "now write your report"
 *
 * By keeping all instructions in one file:
 *   - Easy to tweak behavior without changing logic
 *   - Easy to A/B test different prompts
 *   - Clean separation of concerns
 *
 * PROMPT ENGINEERING BASICS
 * -------------------------
 * The quality of an LLM's output depends HEAVILY on the prompt.
 * Key principles used here:
 *
 *   1. Be specific — "use 2-3 columns max" is better than "keep tables small"
 *   2. Give examples — show the format you want, don't just describe it
 *   3. Set boundaries — tell it what NOT to do (prevents hallucination)
 *   4. Role assignment — "You are X" gives the LLM a persona to follow
 *   5. Context injection — dynamically insert data (date, tool results, etc.)
 */

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Returns today's date formatted nicely for prompts.
 *
 * WHY INCLUDE THE DATE?
 * The LLM was trained on data up to a certain cutoff date.
 * It doesn't inherently "know" what today's date is.
 * By injecting the current date, we:
 *   - Help it understand what "latest" or "recent" means
 *   - Prevent it from giving outdated information
 *   - Allow it to reason about time-sensitive financial data
 *
 * EXAMPLE OUTPUT:
 *   "Wednesday, February 11, 2026"
 *
 * HOW Intl.DateTimeFormat WORKS:
 *   - It's a built-in JavaScript API for formatting dates
 *   - We pass options to control which parts to include
 *   - 'en-US' gives us English formatting (month names, etc.)
 */
export function getCurrentDate(): string {
  // These options control the format
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',   // "Wednesday" (not "Wed")
    year: 'numeric',   // "2026" (not "26")
    month: 'long',     // "February" (not "Feb" or "02")
    day: 'numeric',    // "11" (not "011")
  };

  // new Date() = current date/time
  // .toLocaleDateString() = format it as a readable string
  return new Date().toLocaleDateString('en-US', options);
}


// ============================================================================
// Default System Prompt (simple version)
// ============================================================================

/**
 * DEFAULT_SYSTEM_PROMPT
 *
 * This is a SIMPLE system prompt used when:
 *   - No tools are registered yet
 *   - The agent is running in basic "chat" mode
 *   - As a fallback if something goes wrong
 *
 * WHAT'S A SYSTEM PROMPT?
 * -----------------------
 * In LLM conversations, there are 3 roles:
 *   - system: Instructions from the developer (us) — the LLM treats these
 *             as its "programming". The user never sees this.
 *   - user: The human's message
 *   - assistant: The LLM's response
 *
 * The system prompt is like whispering instructions to the AI
 * before the user starts talking to it.
 *
 * TEMPLATE LITERALS (backtick strings)
 * ------------------------------------
 * We use backticks (`) instead of quotes (' or ") because:
 *   - They support multi-line strings (no \n needed)
 *   - They support ${expression} interpolation (embed variables)
 *   - Much more readable for long prompts
 *
 * NOTICE: ${getCurrentDate()} is called at IMPORT TIME.
 * This means the date is set when the module first loads.
 * For a long-running process, this is fine — it's the date
 * the session started, which is what we want.
 */
export const DEFAULT_SYSTEM_PROMPT = `You are QuantMind, a helpful AI assistant.

Current date: ${getCurrentDate()}

Your output is displayed on a command line interface. Keep responses short and concise.

## Behavior

- Prioritize accuracy over validation
- Use professional, objective tone
- Be thorough but efficient

## Response Format

- Keep responses brief and direct
- For non-comparative information, prefer plain text or simple lists over tables
- Do not use markdown headers or *italics* - use **bold** sparingly for emphasis

## Tables (for comparative/tabular data)

Use markdown tables. They will be rendered as formatted box tables.

STRICT FORMAT - each row must:
- Start with | and end with |
- Have no trailing spaces after the final |
- Use |---| separator (with optional : for alignment)

| Ticker | Rev    | OM  |
|--------|--------|-----|
| AAPL   | 416.2B | 31% |

Keep tables compact:
- Max 2-3 columns; prefer multiple small tables over one wide table
- Headers: 1-3 words max. "FY Rev" not "Most recent fiscal year revenue"
- Tickers not names: "AAPL" not "Apple Inc."
- Abbreviate: Rev, Op Inc, Net Inc, OCF, FCF, GM, OM, EPS
- Numbers compact: 102.5B not $102,466,000,000
- Omit units in cells if header has them`;


// ============================================================================
// Full System Prompt (with tools)
// ============================================================================

/**
 * buildSystemPrompt()
 *
 * This is the MAIN system prompt used when the agent has tools.
 * It's a FUNCTION (not a constant) because it needs to:
 *   1. Accept the model name (different models may need different instructions)
 *   2. Dynamically build tool descriptions (tools may change at runtime)
 *   3. Be called fresh each time (ensures current date)
 *
 * WHY IS IT SO DETAILED?
 * ----------------------
 * LLMs follow instructions literally. If you don't say:
 *   "Don't guess at URLs" → it WILL make up URLs
 *   "Don't ask users for data" → it WILL say "can you paste the JSON?"
 *   "Use financial_search first" → it might use web_search for stock prices
 *
 * Every line in this prompt exists because of a real failure mode
 * observed during testing. Prompt engineering is iterative:
 *   1. Run the agent
 *   2. Notice bad behavior
 *   3. Add a rule to prevent it
 *   4. Repeat
 *
 * @param model - The model name (e.g., "gemini-2.5-flash")
 *                Currently unused, but kept for future multi-model support
 *                where different models might need different prompting styles
 */
export function buildSystemPrompt(model: string): string {
  /**
   * TOOL DESCRIPTIONS
   * -----------------
   * Right now we don't have tools built yet (that's Steps 10-15).
   * When we build the tool registry, this will dynamically list
   * all available tools and their descriptions.
   *
   * For now, we use a placeholder. Once we build the tool registry,
   * we'll import buildToolDescriptions and call it here.
   *
   * Example of what this will look like eventually:
   *   "financial_search: Search financial data (prices, metrics, filings)
   *    web_search: Search the web for general information"
   */
  const toolDescriptions = '(Tools will be listed here once the tool registry is built)';

  return `You are QuantMind, a CLI assistant with access to research tools.

Current date: ${getCurrentDate()}

Your output is displayed on a command line interface. Keep responses short and concise.

## Available Tools

${toolDescriptions}

## Tool Usage Policy

- Only use tools when the query actually requires external data
- ALWAYS prefer financial_search over web_search for any financial data (prices, metrics, filings, etc.)
- Call financial_search ONCE with the full natural language query - it handles multi-company/multi-metric requests internally
- Do NOT break up queries into multiple tool calls when one call can handle the request
- For factual questions about entities (companies, people, organizations), use tools to verify current state
- Only respond directly for: conceptual definitions, stable historical facts, or conversational queries

## Behavior

- Prioritize accuracy over validation - don't cheerfully agree with flawed assumptions
- Use professional, objective tone without excessive praise or emotional validation
- For research tasks, be thorough but efficient
- Avoid over-engineering responses - match the scope of your answer to the question
- Never ask users to provide raw data, paste values, or reference JSON/API internals - users ask questions, they don't have access to financial APIs
- If data is incomplete, answer with what you have without exposing implementation details

## Response Format

- Keep casual responses brief and direct
- For research: lead with the key finding and include specific data points
- For non-comparative information, prefer plain text or simple lists over tables
- Don't narrate your actions or ask leading questions about what the user wants
- Do not use markdown headers or *italics* - use **bold** sparingly for emphasis

## Tables (for comparative/tabular data)

Use markdown tables. They will be rendered as formatted box tables.

STRICT FORMAT - each row must:
- Start with | and end with |
- Have no trailing spaces after the final |
- Use |---| separator (with optional : for alignment)

| Ticker | Rev    | OM  |
|--------|--------|-----|
| AAPL   | 416.2B | 31% |

Keep tables compact:
- Max 2-3 columns; prefer multiple small tables over one wide table
- Headers: 1-3 words max. "FY Rev" not "Most recent fiscal year revenue"
- Tickers not names: "AAPL" not "Apple Inc."
- Abbreviate: Rev, Op Inc, Net Inc, OCF, FCF, GM, OM, EPS
- Numbers compact: 102.5B not $102,466,000,000
- Omit units in cells if header has them`;
}


// ============================================================================
// Iteration Prompt (runs every agent loop)
// ============================================================================

/**
 * buildIterationPrompt()
 *
 * This prompt is sent to the LLM on EVERY iteration of the agent loop.
 *
 * WHAT IS AN ITERATION?
 * ---------------------
 * The agent loop works like this:
 *
 *   Iteration 1: LLM thinks → calls financial_search tool
 *   Iteration 2: LLM sees tool results → calls web_search tool
 *   Iteration 3: LLM sees all results → generates final answer
 *
 * On each iteration, we need to remind the LLM:
 *   1. What the user originally asked (it can "forget" in long conversations)
 *   2. What data has been gathered so far
 *   3. Whether it's running low on allowed tool calls
 *
 * WHY INCLUDE TOOL USAGE STATUS?
 * ------------------------------
 * Remember in scratchpad.ts, we track how many times each tool is used?
 * If a tool is approaching its limit, we tell the LLM here.
 * This is the "graceful exit mechanism" — instead of hard-blocking,
 * we WARN the LLM so it can wrap up naturally.
 *
 * Example toolUsageStatus:
 *   "⚠ financial_search: 8/10 calls used. Consider wrapping up."
 *
 * CONTEXT COMPACTION NOTE
 * -----------------------
 * During iterations, we keep FULL tool results in memory.
 * We don't summarize them inline because:
 *   - Summaries lose important details
 *   - The LLM needs exact numbers for financial analysis
 *   - We handle memory limits by CLEARING old context (see scratchpad)
 *     not by summarizing it
 *
 * @param originalQuery    - The user's original question (unchanged)
 * @param fullToolResults  - All tool results formatted as text
 * @param toolUsageStatus  - Optional warning about tool usage limits
 */
export function buildIterationPrompt(
  originalQuery: string,
  fullToolResults: string,
  toolUsageStatus?: string | null
): string {
  // Start with the original query
  // We always include this so the LLM doesn't lose track
  // of what it's trying to answer
  let prompt = `Query: ${originalQuery}`;

  // Add tool results if any exist
  // .trim() removes whitespace — if results are empty/blank, skip them
  if (fullToolResults.trim()) {
    prompt += `

Data retrieved from tool calls:
${fullToolResults}`;
  }

  // Add tool usage warnings if approaching limits
  // This is the "graceful exit" — we warn, never block
  if (toolUsageStatus) {
    prompt += `\n\n${toolUsageStatus}`;
  }

  // Add the instruction to continue or finish
  // This is crucial — it tells the LLM what to do next
  prompt += `

Continue working toward answering the query. If you have gathered enough data, you may respond with your final answer. Do not guess or hallucinate data — only use information returned by your tools.`;

  return prompt;
}


// ============================================================================
// Final Answer Prompt
// ============================================================================

/**
 * buildFinalAnswerPrompt()
 *
 * This prompt is used ONLY in one specific scenario:
 *   When context compaction has happened.
 *
 * WHAT IS CONTEXT COMPACTION?
 * ---------------------------
 * LLMs have a limited "context window" (how much text they can see at once).
 * For example, Gemini 2.5 Flash has a ~1M token context window.
 *
 * During a long research session, the conversation history grows:
 *   - System prompt: ~500 tokens
 *   - User query: ~100 tokens
 *   - Tool result 1: ~2000 tokens
 *   - Tool result 2: ~3000 tokens
 *   - Tool result 3: ~5000 tokens
 *   ... and so on
 *
 * Eventually, we might approach the limit. When that happens:
 *   1. The scratchpad has been saving all tool results to disk (JSONL)
 *   2. We CLEAR the conversation history (remove old messages)
 *   3. When it's time for the final answer, we RELOAD all results from disk
 *   4. We send them all at once in THIS prompt
 *
 * WHY NOT JUST SUMMARIZE?
 * -----------------------
 * For financial data, precision matters:
 *   - "Revenue was around $400B" ← bad summary, loses precision
 *   - "Revenue was $416.2B" ← exact number from the tool
 *
 * So instead of summarizing during iteration (losing precision),
 * we save everything to disk and reload it for the final answer.
 * This is the "compact during iteration, full data for final answer" pattern.
 *
 * @param originalQuery   - The user's original question
 * @param fullContextData - ALL tool results loaded from the scratchpad disk
 */
export function buildFinalAnswerPrompt(
  originalQuery: string,
  fullContextData: string
): string {
  return `Query: ${originalQuery}

Data retrieved from your tool calls:
${fullContextData}

Answer the user's query using this data. Do not ask the user to provide additional data, paste values, or reference JSON/API internals. If data is incomplete, answer with what you have.`;
}