/**
 * ============================================================
 * AI Message Utilities
 * ============================================================
 *
 * When you call an LLM with tools bound, it doesn't just return
 * a plain string. It returns an "AIMessage" object that can contain:
 *
 *   1. Text content (the LLM's response/reasoning)
 *   2. Tool calls (requests to execute tools)
 *   3. Both at the same time!
 *
 * EXAMPLE AIMessage (simplified):
 * {
 *   content: "Let me look up Apple's stock price.",    ← text
 *   tool_calls: [{                                     ← tool request
 *     name: "get_price_snapshot",
 *     args: { ticker: "AAPL" }
 *   }]
 * }
 *
 * The LLM is saying:
 *   "I want to think out loud AND call a tool."
 *
 * But sometimes content is not a string — it can be an array of blocks:
 * {
 *   content: [
 *     { type: "text", text: "Let me check..." },
 *     { type: "text", text: "Looking at the data..." }
 *   ]
 * }
 *
 * These utilities handle ALL these formats cleanly.
 */

import { AIMessage } from '@langchain/core/messages';

/**
 * Extract text content from an AIMessage.
 *
 * WHY IS THIS COMPLEX?
 * Different LLM providers format responses differently:
 *
 *   OpenAI/Gemini: content = "Hello world" (simple string)
 *   Anthropic:     content = [{ type: "text", text: "Hello world" }] (array of blocks)
 *
 * This function handles BOTH formats and always returns a plain string.
 *
 * @param message - The AIMessage from the LLM
 * @returns The text content as a plain string, or empty string if none
 */
export function extractTextContent(message: AIMessage): string {
  // Case 1: content is already a string (most common)
  // Example: { content: "Apple stock is $228.50" }
  if (typeof message.content === 'string') {
    return message.content;
  }

  // Case 2: content is an array of blocks (Anthropic-style)
  // Example: { content: [{ type: "text", text: "Apple..." }, { type: "text", text: "..." }] }
  if (Array.isArray(message.content)) {
    return message.content
      // Filter: only keep blocks that are objects with type === "text"
      // This skips image blocks, tool_use blocks, etc.
      .filter(block => typeof block === 'object' && 'type' in block && block.type === 'text')
      // Map: extract just the text string from each block
      .map(block => (block as { text: string }).text)
      // Join: combine all text blocks with newlines
      .join('\n');
  }

  // Case 3: unexpected format — return empty string
  return '';
}

/**
 * Check if an AIMessage contains tool calls.
 *
 * When the LLM wants to use a tool, it sets tool_calls on the message.
 * We check this to decide:
 *   - Has tool calls → execute tools, then loop again
 *   - No tool calls → LLM is done, generate final answer
 *
 * @param message - The AIMessage from the LLM
 * @returns true if the message contains one or more tool calls
 */
export function hasToolCalls(message: AIMessage): boolean {
  // tool_calls must be:
  //   1. An array (not undefined, not null)
  //   2. Non-empty (at least one tool call)
  return Array.isArray(message.tool_calls) && message.tool_calls.length > 0;
}