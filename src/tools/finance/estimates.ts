/**
 * ============================================================
 * ANALYST ESTIMATES TOOL (Financial Datasets API)
 * ============================================================
 *
 * Retrieves consensus analyst estimates for a company.
 * Useful for understanding market expectations and valuation analysis.
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { callApi } from "./api";
import { formatToolResult } from "../types";

export const getAnalystEstimates = new DynamicStructuredTool({
  name: "get_analyst_estimates",

  description:
    "Retrieves analyst estimates for a company, including estimated EPS, revenue, and growth. " +
    "Useful for understanding consensus expectations and performing valuation analysis.",

  schema: z.object({
    ticker: z
      .string()
      .describe("The stock ticker symbol (e.g., 'AAPL' for Apple)."),
    period: z
      .enum(["annual", "quarterly"])
      .default("annual")
      .describe("The period for estimates: 'annual' or 'quarterly'."),
  }),

  func: async (input) => {
    const params = {
      ticker: input.ticker.trim().toUpperCase(),
      period: input.period,
    };
    const { data, url } = await callApi("/analyst-estimates/", params);
    return formatToolResult(data.analyst_estimates || [], [url]);
  },
});
