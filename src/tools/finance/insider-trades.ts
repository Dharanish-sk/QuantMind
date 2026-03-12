/**
 * ============================================================
 * INSIDER TRADES TOOL (Financial Datasets API)
 * ============================================================
 *
 * Retrieves insider trading transactions (SEC Form 4 filings).
 * Shows purchases and sales by executives, directors, and insiders.
 *
 * WHY INSIDER TRADES MATTER:
 * Insiders buy for ONE reason: they think the stock will go up.
 * But they sell for many reasons (diversification, taxes, etc.)
 * Buffett: "Insiders might sell for many reasons, but they buy for only one."
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { callApi, stripFieldsDeep } from "./api";
import { formatToolResult } from "../types";

const REDUNDANT_INSIDER_FIELDS = ['issuer'] as const;

export const getInsiderTrades = new DynamicStructuredTool({
  name: "get_insider_trades",

  description:
    "Retrieves insider trading transactions (SEC Form 4 filings) for a company. " +
    "Shows purchases and sales by executives, directors, and other insiders. " +
    "Use filing_date filters to narrow results by date range.",

  schema: z.object({
    ticker: z
      .string()
      .describe("The stock ticker symbol (e.g., 'AAPL' for Apple)."),
    limit: z
      .number()
      .default(10)
      .describe("Maximum number of insider trades to return (default: 10)."),
    filing_date_gte: z
      .string()
      .optional()
      .describe("Filter: filing date on or after this date (YYYY-MM-DD)."),
    filing_date_lte: z
      .string()
      .optional()
      .describe("Filter: filing date on or before this date (YYYY-MM-DD)."),
  }),

  func: async (input) => {
    const params: Record<string, string | number | undefined> = {
      ticker: input.ticker.trim().toUpperCase(),
      limit: input.limit,
      filing_date_gte: input.filing_date_gte,
      filing_date_lte: input.filing_date_lte,
    };
    const { data, url } = await callApi("/insider-trades/", params);
    return formatToolResult(
      stripFieldsDeep(data.insider_trades || [], REDUNDANT_INSIDER_FIELDS),
      [url]
    );
  },
});
