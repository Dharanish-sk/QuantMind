/**
 * ============================================================
 * TOOLS TYPES — Shared Types and Helpers for All Tools
 * ============================================================
 *
 * This file contains types and utility functions used by all tools.
 *
 * WHY A SEPARATE FILE?
 * - Avoids circular dependencies (tools importing from each other)
 * - Single place to change shared logic
 * - Keeps individual tool files clean
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Standard format for tool results.
 *
 * Every tool should return data in this structure:
 * - data: The actual result (any JSON-serializable object)
 * - sources: URLs where the data came from (for citations)
 *
 * WHY STANDARDIZE?
 * When the LLM sees tool results, having a consistent format helps it:
 * 1. Know where to find the actual data (always in "data")
 * 2. Cite sources if needed (always in "sources")
 * 3. Understand the result structure predictably
 */
export interface ToolResult {
  data: unknown;
  sources?: string[];
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format a tool result for return to the agent.
 *
 * All tools should use this instead of JSON.stringify directly.
 * It ensures consistent formatting and includes source URLs.
 *
 * @param data    - The result data (object, array, or primitive)
 * @param sources - Optional array of source URLs
 * @returns JSON string ready to return from the tool
 *
 * @example
 * // In a tool's func:
 * const stockData = await fetchPrice("AAPL");
 * return formatToolResult(stockData, ["https://api.example.com/AAPL"]);
 *
 * // Output:
 * // {"data":{"price":228.50},"sources":["https://api.example.com/AAPL"]}
 */
export function formatToolResult(data: unknown, sources?: string[]): string {
  const result: ToolResult = { data };

  if (sources && sources.length > 0) {
    result.sources = sources;
  }

  return JSON.stringify(result);
}

/**
 * Parse search results from various search APIs.
 *
 * Different search APIs (Tavily, Exa, Google) return results in different formats.
 * This normalizes them into a consistent structure.
 *
 * @param results - Raw results from a search API
 * @returns Object with parsed results and extracted URLs
 *
 * @example
 * const tavilyResults = await tavily.search("Apple earnings");
 * const { parsed, urls } = parseSearchResults(tavilyResults);
 * return formatToolResult(parsed, urls);
 */
export function parseSearchResults(results: unknown): {
  parsed: Array<{ title: string; content: string; url: string }>;
  urls: string[];
} {
  // Handle string input (already stringified)
  if (typeof results === "string") {
    try {
      results = JSON.parse(results);
    } catch {
      return { parsed: [], urls: [] };
    }
  }

  // Handle array of results
  if (Array.isArray(results)) {
    const parsed = results.map((r) => ({
      title: r.title || r.name || "Untitled",
      content: r.content || r.snippet || r.text || "",
      url: r.url || r.link || "",
    }));

    const urls = parsed.map((r) => r.url).filter((u) => u);

    return { parsed, urls };
  }

  // Handle object with results array (common API response format)
  if (results && typeof results === "object") {
    const obj = results as Record<string, unknown>;

    // Try common field names for results array
    const resultsArray =
      obj.results || obj.items || obj.hits || obj.data || (obj.webPages as Record<string, unknown> | undefined)?.value;

    if (Array.isArray(resultsArray)) {
      return parseSearchResults(resultsArray);
    }
  }

  return { parsed: [], urls: [] };
}

/**
 * Truncate a string to a maximum length, adding ellipsis if truncated.
 *
 * Useful for keeping tool descriptions and results within token limits.
 *
 * @param str       - The string to truncate
 * @param maxLength - Maximum length (default: 500)
 * @returns Truncated string with "..." if it was shortened
 */
export function truncate(str: string, maxLength = 500): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + "...";
}
