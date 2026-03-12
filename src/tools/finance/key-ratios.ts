/**
 * ============================================================
 * KEY RATIOS TOOL (Financial Datasets API)
 * ============================================================
 *
 * Retrieves historical key financial ratios: P/E, EV/EBITDA,
 * ROE, ROA, margins, dividend yield, and more.
 * Useful for trend analysis and historical performance evaluation.
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { callApi, stripFieldsDeep } from "./api";
import { formatToolResult } from "../types";

const REDUNDANT_FIELDS = ['accession_number', 'currency', 'period'] as const;

export const getKeyRatios = new DynamicStructuredTool({
  name: "get_key_ratios",

  description:
    "Retrieves historical key ratios (P/E, EV/EBITDA, ROE, ROA, margins, dividend yield, " +
    "revenue per share, enterprise value) over a specified period. " +
    "Useful for trend analysis, peer comparison, and valuation.",

  schema: z.object({
    ticker: z
      .string()
      .describe("The stock ticker symbol (e.g., 'AAPL' for Apple)."),
    period: z
      .enum(["annual", "quarterly", "ttm"])
      .default("ttm")
      .describe("'annual', 'quarterly', or 'ttm' (trailing twelve months)."),
    limit: z
      .number()
      .default(4)
      .describe("Number of past periods to retrieve (default: 4)."),
    report_period_gte: z
      .string()
      .optional()
      .describe("Filter: report periods on or after this date (YYYY-MM-DD)."),
    report_period_lte: z
      .string()
      .optional()
      .describe("Filter: report periods on or before this date (YYYY-MM-DD)."),
  }),

  func: async (input) => {
    const params: Record<string, string | number | undefined> = {
      ticker: input.ticker.trim().toUpperCase(),
      period: input.period,
      limit: input.limit,
      report_period_gte: input.report_period_gte,
      report_period_lte: input.report_period_lte,
    };
    const { data, url } = await callApi("/financial-metrics/", params);
    return formatToolResult(
      stripFieldsDeep(data.financial_metrics || [], REDUNDANT_FIELDS),
      [url]
    );
  },
});
