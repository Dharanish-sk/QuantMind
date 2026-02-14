/**
 * ============================================================
 * Token Estimation Utilities
 * ============================================================
 *
 * WHAT ARE TOKENS?
 * ----------------
 * LLMs don't read characters — they read "tokens".
 * A token is roughly:
 *   - 1 common word (like "the", "is", "hello")
 *   - Part of a longer word ("understanding" ≈ 3 tokens)
 *   - A number or punctuation mark
 *
 * ROUGH RULE OF THUMB:
 *   - English prose: ~4 characters per token
 *   - JSON/code: ~3.5 characters per token (denser, more symbols)
 *
 * WHY ESTIMATE TOKENS?
 * --------------------
 * Every LLM has a "context window" — a maximum number of tokens
 * it can process at once:
 *
 *   - GPT-4: ~128K tokens
 *   - Gemini 2.5 Flash: ~1M tokens
 *   - Claude 3: ~200K tokens
 *
 * If we exceed this, the API call FAILS.
 *
 * Our agent accumulates tool results over time:
 *   System prompt: ~500 tokens
 *   User query: ~100 tokens
 *   Tool result 1: ~2,000 tokens
 *   Tool result 2: ~5,000 tokens
 *   ...
 *
 * We use these estimates to decide when to CLEAR old results
 * to stay within the context window.
 *
 * WHY NOT USE AN EXACT TOKEN COUNTER?
 * ------------------------------------
 * Exact counting (like tiktoken) requires:
 *   - Downloading the model's vocabulary file (~10MB)
 *   - Running the tokenizer algorithm
 *   - Different tokenizers per model
 *
 * For our purposes, a rough estimate is:
 *   - Fast (just string.length / 3.5)
 *   - Good enough (within ~10% accuracy)
 *   - Zero dependencies
 */

/**
 * Rough token estimation based on character count.
 *
 * We use ~3.5 chars per token because:
 *   - Financial data is JSON-heavy (symbols like {, }, :, " are 1 token each)
 *   - JSON is more token-dense than English prose
 *   - Being conservative (underestimating) is SAFER than overestimating
 *     (better to clear context too early than to hit the limit)
 *
 * EXAMPLES:
 *   "Apple revenue is $394B" (22 chars) ≈ 7 tokens
 *   '{"ticker":"AAPL","price":228.50}' (32 chars) ≈ 9 tokens
 *
 * @param text - The text to estimate tokens for
 * @returns Estimated token count
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/**
 * Maximum token budget for final answer generation.
 *
 * When building the final answer, we load ALL tool results
 * from the scratchpad. But we can't load more than this many tokens.
 *
 * 150K is conservative — leaves room for:
 *   - System prompt (~500 tokens)
 *   - User query (~100 tokens)
 *   - LLM response (~2,000 tokens)
 *   - Safety margin
 */
export const TOKEN_BUDGET = 150_000;

// ============================================================================
// Context Management Constants
// ============================================================================

/**
 * Token threshold at which context clearing is triggered.
 *
 * When the estimated context (system prompt + query + all tool results)
 * exceeds this number, we clear the OLDEST tool results.
 *
 * 100K tokens is a good default that works for most models.
 * Even Gemini's 1M window benefits from this — shorter context
 * means FASTER responses and CHEAPER API calls.
 *
 * WHAT HAPPENS WHEN WE HIT THIS:
 *   1. Context estimated at ~105K tokens
 *   2. 105K > 100K threshold → trigger clearing
 *   3. Remove oldest tool results, keep most recent KEEP_TOOL_USES
 *   4. Context drops to ~30K tokens
 *   5. Agent continues with recent context
 *   6. Full data is still on disk (scratchpad JSONL) for final answer
 */
export const CONTEXT_THRESHOLD = 100_000;

/**
 * Number of most recent tool results to keep when clearing.
 *
 * When we clear old context, we keep the N most recent results.
 * This ensures the LLM still has recent context to work with.
 *
 * 5 means: "clear everything except the last 5 tool results"
 */
export const KEEP_TOOL_USES = 5;