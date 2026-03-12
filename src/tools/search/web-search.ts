/**
 * ============================================================
 * WEB SEARCH TOOL
 * ============================================================
 *
 * This tool searches the web for current information.
 *
 * SEARCH API OPTIONS:
 * -------------------
 * There are several search APIs you can use:
 *
 * 1. TAVILY (Recommended for AI agents)
 *    - Built specifically for LLMs
 *    - Returns clean, structured results
 *    - Free tier: 1000 searches/month
 *    - Get key at: https://tavily.com
 *
 * 2. SERPER (Google Search)
 *    - Actual Google search results
 *    - Free tier: 2500 searches/month
 *    - Get key at: https://serper.dev
 *
 * 3. BRAVE SEARCH
 *    - Privacy-focused search
 *    - Free tier: 2000 searches/month
 *    - Get key at: https://brave.com/search/api
 *
 * CURRENT IMPLEMENTATION:
 * -----------------------
 * We check for TAVILY_API_KEY first, then SERPER_API_KEY.
 * If neither is set, we return a helpful message.
 *
 * This tool is OPTIONAL for a finance agent - the financial tools
 * handle most queries. Web search is for news and general info.
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { formatToolResult, parseSearchResults } from "../types";

// ============================================================================
// Search Implementations
// ============================================================================

/**
 * Search using Tavily API (recommended for AI agents)
 */
async function searchWithTavily(query: string): Promise<string> {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query,
      search_depth: "basic",
      max_results: 5,
      include_answer: true,
    }),
  });

  const data = await response.json() as Record<string, any>;

  if (data.error) {
    return formatToolResult({ error: data.error }, []);
  }

  // Tavily returns an "answer" field with a synthesized response
  // and "results" with individual search results
  const results = {
    answer: data.answer || null,
    results: data.results?.map((r: any) => ({
      title: r.title,
      content: r.content,
      url: r.url,
    })) || [],
  };

  const urls = results.results.map((r: any) => r.url);
  return formatToolResult(results, urls);
}

/**
 * Search using Serper API (Google Search)
 */
async function searchWithSerper(query: string): Promise<string> {
  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": process.env.SERPER_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: query,
      num: 5,
    }),
  });

  const data = await response.json() as Record<string, any>;

  if (data.error) {
    return formatToolResult({ error: data.error }, []);
  }

  // Serper returns organic results
  const results = data.organic?.map((r: any) => ({
    title: r.title,
    content: r.snippet,
    url: r.link,
  })) || [];

  const urls = results.map((r: any) => r.url);
  return formatToolResult({ results }, urls);
}

// ============================================================================
// Web Search Tool
// ============================================================================

export const webSearchTool = new DynamicStructuredTool({
  name: "web_search",

  description:
    "Search the web for current news, articles, and general information. " +
    "Use for: recent news, current events, general knowledge, company announcements. " +
    "DO NOT use for: stock prices or financial metrics (use financial tools instead).",

  schema: z.object({
    query: z
      .string()
      .describe("The search query. Be specific for better results."),
  }),

  func: async ({ query }) => {
    // Try Tavily first (best for AI agents)
    if (process.env.TAVILY_API_KEY) {
      try {
        return await searchWithTavily(query);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return formatToolResult({ error: `Tavily search failed: ${errorMessage}` }, []);
      }
    }

    // Try Serper (Google Search) as fallback
    if (process.env.SERPER_API_KEY) {
      try {
        return await searchWithSerper(query);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return formatToolResult({ error: `Serper search failed: ${errorMessage}` }, []);
      }
    }

    // No search API configured - return helpful message
    return formatToolResult(
      {
        message: "Web search is not configured.",
        suggestion: "Add TAVILY_API_KEY or SERPER_API_KEY to your .env file to enable web search.",
        alternatives: [
          "Use get_price_snapshot for stock prices",
          "Use get_income_statements for financial data",
          "Use get_balance_sheets for company financials",
        ],
      },
      []
    );
  },
});
