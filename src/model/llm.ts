/**
 * ============================================================
 * LLM Module — Talking to the AI
 * ============================================================
 *
 * This module handles ALL communication with the LLM (Google Gemini).
 *
 * WHAT CHANGED FROM THE SIMPLE VERSION?
 * --------------------------------------
 * Before: callLlm(prompt, systemPrompt) → returns a string
 * After:  callLlm(prompt, options) → returns AIMessage OR string
 *
 * WHY THE CHANGE?
 * When the agent needs to call tools, the LLM doesn't just return text.
 * It returns an AIMessage object that can contain BOTH text AND tool requests:
 *
 *   { content: "Let me look that up...", tool_calls: [{ name: "get_price", args: {...} }] }
 *
 * So we need two modes:
 *   1. NO TOOLS: prompt → model → extract text → return string (simple chat)
 *   2. WITH TOOLS: prompt → model.bindTools(tools) → return full AIMessage
 *
 * WHAT IS TOOL BINDING?
 * ---------------------
 * "Binding" tools means telling the LLM: "Hey, you have these functions available.
 * If you want to use one, include a tool_call in your response."
 *
 * The LLM DOESN'T execute tools itself. It just REQUESTS them:
 *   LLM: "I'd like to call get_price_snapshot with ticker AAPL"
 *   Agent: *executes the tool* *sends result back to LLM*
 *   LLM: "Apple stock is $228.50"
 *
 * HOW bindTools WORKS:
 *   const model = new ChatGoogleGenerativeAI({...});
 *   const modelWithTools = model.bindTools(tools);
 *   //                          ^^^^^^^^^^^^^^^^^^
 *   // This tells the LLM about available tools.
 *   // The LLM can now include tool_calls in its responses.
 *   // It's like giving an employee a list of phone numbers they can call.
 *
 * RETRY WITH EXPONENTIAL BACKOFF
 * ------------------------------
 * API calls can fail due to:
 *   - Rate limiting (too many requests)
 *   - Network timeouts
 *   - Server errors (500)
 *
 * Instead of failing immediately, we RETRY up to 3 times with increasing waits:
 *   Attempt 1: fails → wait 500ms
 *   Attempt 2: fails → wait 1000ms
 *   Attempt 3: fails → throw error (give up)
 *
 * The doubling wait time (500 → 1000 → 2000) is called "exponential backoff".
 * It gives the server time to recover between attempts.
 */

import { AIMessage } from '@langchain/core/messages';
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import type { StructuredToolInterface } from '@langchain/core/tools';
import type { Runnable } from '@langchain/core/runnables';
import { DEFAULT_SYSTEM_PROMPT } from '../agent/prompts';
import type { TokenUsage } from '../agent/types';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for callLlm.
 *
 * WHY AN OPTIONS OBJECT?
 * Before: callLlm(prompt, systemPrompt)
 * After:  callLlm(prompt, { systemPrompt, tools, signal })
 *
 * When a function needs many optional parameters, it's better to use
 * an options object than positional arguments:
 *   BAD:  callLlm(prompt, systemPrompt, undefined, tools, undefined, signal)
 *   GOOD: callLlm(prompt, { systemPrompt, tools, signal })
 */
interface CallLlmOptions {
  /** The model name (e.g., "gemini-2.5-flash"). Default: "gemini-2.5-flash" */
  model?: string;

  /** System instructions for the LLM. Default: DEFAULT_SYSTEM_PROMPT */
  systemPrompt?: string;

  /** Tools to bind to the LLM. If provided, returns AIMessage (not string) */
  tools?: StructuredToolInterface[];

  /** AbortSignal for cancellation (when user presses Escape) */
  signal?: AbortSignal;
}

/**
 * Result from callLlm.
 *
 * response is AIMessage when tools are bound (so we can read tool_calls).
 * response is string when no tools (simple chat mode).
 */
export interface LlmResult {
  response: AIMessage | string;
  usage?: TokenUsage;
}

// ============================================================================
// Retry Helper
// ============================================================================

/**
 * Retry a function with exponential backoff.
 *
 * EXPONENTIAL BACKOFF EXPLAINED:
 *   Attempt 1 fails → wait 500ms  (500 * 2^0 = 500)
 *   Attempt 2 fails → wait 1000ms (500 * 2^1 = 1000)
 *   Attempt 3 fails → THROW ERROR (give up)
 *
 * WHY EXPONENTIAL?
 * If the server is overloaded:
 *   - Fixed wait (500ms each time) → everyone retries at once → server stays overloaded
 *   - Exponential wait → retries spread out over time → server recovers
 *
 * This is a GENERIC helper — works with any async function.
 * The <T> is a "generic type" — it means "whatever type the function returns".
 */
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      // If this was the last attempt, re-throw the error
      if (attempt === maxAttempts - 1) throw e;
      // Otherwise wait and try again
      // 500 * 2^0 = 500ms, 500 * 2^1 = 1000ms, 500 * 2^2 = 2000ms
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
  throw new Error('Unreachable'); // TypeScript needs this for type safety
}

// ============================================================================
// Token Usage Extraction
// ============================================================================

/**
 * Extract token usage from an LLM response.
 *
 * Different providers report usage differently:
 *   - LangChain standard: result.usage_metadata.input_tokens
 *   - Some providers:     result.response_metadata.usage.prompt_tokens
 *
 * This function checks both formats.
 *
 * WHY IS THIS SO DEFENSIVE?
 * LLM APIs are "best effort" — sometimes usage data is missing,
 * sometimes the format changes between versions.
 * Every `typeof` check prevents crashes from unexpected data shapes.
 */
function extractUsage(result: unknown): TokenUsage | undefined {
  if (!result || typeof result !== 'object') return undefined;
  const msg = result as Record<string, unknown>;

  // Try LangChain's standard format first
  const usageMetadata = msg.usage_metadata;
  if (usageMetadata && typeof usageMetadata === 'object') {
    const u = usageMetadata as Record<string, unknown>;
    const input = typeof u.input_tokens === 'number' ? u.input_tokens : 0;
    const output = typeof u.output_tokens === 'number' ? u.output_tokens : 0;
    const total = typeof u.total_tokens === 'number' ? u.total_tokens : input + output;
    return { inputTokens: input, outputTokens: output, totalTokens: total };
  }

  // Fallback: check response_metadata.usage (OpenAI-style)
  const responseMetadata = msg.response_metadata;
  if (responseMetadata && typeof responseMetadata === 'object') {
    const rm = responseMetadata as Record<string, unknown>;
    if (rm.usage && typeof rm.usage === 'object') {
      const u = rm.usage as Record<string, unknown>;
      const input = typeof u.prompt_tokens === 'number' ? u.prompt_tokens : 0;
      const output = typeof u.completion_tokens === 'number' ? u.completion_tokens : 0;
      const total = typeof u.total_tokens === 'number' ? u.total_tokens : input + output;
      return { inputTokens: input, outputTokens: output, totalTokens: total };
    }
  }

  return undefined; // Usage data not available
}

// ============================================================================
// Main LLM Call Function
// ============================================================================

/**
 * Call the LLM with a prompt and optional tools.
 *
 * TWO MODES:
 *
 * Mode 1 - Simple chat (no tools):
 *   callLlm("What is a P/E ratio?", { systemPrompt: "..." })
 *   → Returns: { response: "A P/E ratio is..." } (string)
 *
 * Mode 2 - Agent with tools:
 *   callLlm("What is AAPL's price?", { systemPrompt: "...", tools: [...] })
 *   → Returns: { response: AIMessage { content: "Let me check...", tool_calls: [...] } }
 *
 * The KEY difference: when tools are provided, we return the FULL AIMessage
 * so the agent can read tool_calls. When no tools, we extract just the text.
 *
 * @param prompt  - The user's message (or iteration prompt)
 * @param options - Configuration: model, systemPrompt, tools, signal
 * @returns LlmResult with response and optional token usage
 */
export async function callLlm(
  prompt: string,
  options: CallLlmOptions = {}
): Promise<LlmResult> {
  const {
    model = 'gemini-2.5-flash',
    systemPrompt,
    tools,
    signal,
  } = options;

  // Use provided system prompt, or fall back to the default
  const finalSystemPrompt = systemPrompt || DEFAULT_SYSTEM_PROMPT;

  // 1. Create the LLM instance
  const llm = new ChatGoogleGenerativeAI({
    model,
    apiKey: process.env.GOOGLE_API_KEY,
  });

  // 2. Optionally bind tools
  //    If tools are provided, create a new version of the LLM that "knows" about them.
  //    Runnable is LangChain's base type for anything that can process input → output.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let runnable: Runnable<any, any> = llm;

  if (tools && tools.length > 0 && llm.bindTools) {
    runnable = llm.bindTools(tools);
    //         ^^^^^^^^^^^^^^^^^^^^^^^^^
    // This tells the LLM: "You have these tools available."
    // The LLM can now include tool_calls in its responses.
    // It does NOT change the model — it wraps it with tool awareness.
  }

  // 3. Build the prompt template (system + user messages)
  const promptTemplate = ChatPromptTemplate.fromMessages([
    ['system', finalSystemPrompt],
    ['user', '{prompt}'],
  ]);

  // 4. Chain: template → model (with optional tools)
  const chain = promptTemplate.pipe(runnable);

  // 5. Invoke with retry
  const invokeOpts = signal ? { signal } : undefined;
  const result = await withRetry(() => chain.invoke({ prompt }, invokeOpts));

  // 6. Extract token usage (may be undefined if provider doesn't report it)
  const usage = extractUsage(result);

  // 7. Return based on mode:
  //    - WITH tools → return full AIMessage (agent needs to read tool_calls)
  //    - WITHOUT tools → extract content string (simple chat mode)
  if (!tools && result && typeof result === 'object' && 'content' in result) {
    // No tools mode: extract just the text content
    const content = (result as { content: string }).content;
    return {
      response: typeof content === 'string' ? content : String(content),
      usage,
    };
  }

  // Tools mode: return full AIMessage
  return { response: result as AIMessage, usage };
}