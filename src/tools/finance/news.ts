/**
 * ============================================================
 * COMPANY NEWS TOOL (Financial Datasets API)
 * ============================================================
 *
 * Retrieves recent news headlines for a stock ticker.
 * Useful for understanding catalysts, price moves, and announcements.
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { callApi } from "./api";
import { formatToolResult } from "../types";

export const getCompanyNews = new DynamicStructuredTool({
  name: "get_company_news",

  description:
    "Retrieves recent company news headlines for a stock ticker, including title, source, " +
    "publication date, and URL. Use for company catalysts, price move explanations, and announcements.",

  schema: z.object({
    ticker: z
      .string()
      .describe("The stock ticker symbol (e.g., 'AAPL' for Apple)."),
    limit: z
      .number()
      .default(5)
      .describe("Maximum number of news articles to return (default: 5, max: 10)."),
  }),

  func: async (input) => {
    const params: Record<string, string | number | undefined> = {
      ticker: input.ticker.trim().toUpperCase(),
      limit: Math.min(input.limit, 10),
    };
    const { data, url } = await callApi("/news", params);
    return formatToolResult((data.news as unknown[]) || [], [url]);
  },
});
