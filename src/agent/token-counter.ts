/**
 * ============================================================
 * Token Counter — Tracks LLM costs across multiple calls
 * ============================================================
 *
 * During a single query, the agent calls the LLM MULTIPLE times:
 *
 *   Call 1: "Here's the query" → LLM says "let me search" (50 in, 20 out)
 *   Call 2: "Here's tool results" → LLM says "let me search more" (200 in, 30 out)
 *   Call 3: "Generate final answer" → LLM writes answer (500 in, 200 out)
 *   ─────────────────────────────────────────────────────────
 *   TOTAL: 750 input tokens, 250 output tokens = 1000 total
 *
 * This class keeps a RUNNING TOTAL across all those calls.
 *
 * WHY TRACK TOKENS?
 * -----------------
 * 1. Cost awareness — LLM APIs charge per token
 *    - Gemini 2.5 Flash: ~$0.15 per 1M input tokens
 *    - GPT-4: ~$30 per 1M input tokens
 *    - Knowing your token usage helps estimate costs
 *
 * 2. Performance monitoring — tokens/second tells you how fast the LLM is
 *
 * 3. Debugging — if a query uses 500K tokens, something is probably wrong
 *
 * WHAT ARE INPUT vs OUTPUT TOKENS?
 * --------------------------------
 * Input tokens: What YOU send to the LLM (system prompt + user query + tool results)
 * Output tokens: What the LLM sends BACK (its response, tool calls)
 *
 * Input tokens are cheaper because the LLM just reads them.
 * Output tokens are more expensive because the LLM has to generate them.
 */

import type { TokenUsage } from './types';

/**
 * Tracks token usage across multiple LLM calls.
 *
 * Usage:
 *   const counter = new TokenCounter();
 *   counter.add(usageFromCall1);  // { inputTokens: 50, outputTokens: 20, totalTokens: 70 }
 *   counter.add(usageFromCall2);  // { inputTokens: 200, outputTokens: 30, totalTokens: 230 }
 *   counter.getUsage();           // { inputTokens: 250, outputTokens: 50, totalTokens: 300 }
 */
export class TokenCounter {
  // Running totals — start at zero
  private usage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };

  /**
   * Add usage from one LLM call to the running total.
   *
   * @param usage - Token usage from a single LLM call.
   *                Can be undefined (some LLM providers don't report usage).
   *                If undefined, we just skip — no crash.
   */
  add(usage?: TokenUsage): void {
    if (!usage) return; // Some providers don't report usage
    this.usage.inputTokens += usage.inputTokens;
    this.usage.outputTokens += usage.outputTokens;
    this.usage.totalTokens += usage.totalTokens;
  }

  /**
   * Get the accumulated token usage.
   *
   * Returns undefined if no tokens were tracked at all
   * (meaning the LLM provider never reported usage).
   * This way the UI can show "N/A" instead of "0 tokens".
   */
  getUsage(): TokenUsage | undefined {
    return this.usage.totalTokens > 0 ? { ...this.usage } : undefined;
    //                                    ^^^^^^^^^^^^^^^^
    //                                    Spread operator creates a COPY
    //                                    so the caller can't accidentally
    //                                    modify our internal state
  }

  /**
   * Calculate tokens per second given elapsed time.
   *
   * This is a performance metric:
   *   - Fast: 100+ tokens/second
   *   - Normal: 30-100 tokens/second
   *   - Slow: <30 tokens/second (may indicate network issues)
   *
   * @param elapsedMs - Total time in milliseconds
   * @returns Tokens per second, or undefined if no data
   */
  getTokensPerSecond(elapsedMs: number): number | undefined {
    if (this.usage.totalTokens === 0 || elapsedMs <= 0) return undefined;
    // Convert ms to seconds: divide by 1000
    return this.usage.totalTokens / (elapsedMs / 1000);
  }
}