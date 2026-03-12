/**
 * ============================================================
 * STOCK PRICE TOOLS (Financial Datasets API)
 * ============================================================
 *
 * Fetches stock price data using the Financial Datasets API.
 * Replaces the old Alpha Vantage implementation.
 *
 * Two tools:
 *   1. get_price_snapshot — current price data
 *   2. get_stock_prices — historical OHLCV data
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { callApi } from "./api";
import { formatToolResult } from "../types";

// ============================================================================
// Current Price Snapshot
// ============================================================================

export const getPriceSnapshot = new DynamicStructuredTool({
  name: "get_price_snapshot",

  description:
    "Get current stock price snapshot including price, change, volume, and market data. " +
    "Use this for real-time price checks.",

  schema: z.object({
    ticker: z
      .string()
      .describe("Stock ticker symbol in uppercase (e.g., AAPL, MSFT, GOOGL)"),
  }),

  func: async ({ ticker }) => {
    const params = { ticker: ticker.trim().toUpperCase() };
    const { data, url } = await callApi("/prices/snapshot/", params);
    return formatToolResult(data.snapshot || {}, [url]);
  },
});

// ============================================================================
// Historical Stock Prices
// ============================================================================

export const getStockPrices = new DynamicStructuredTool({
  name: "get_stock_prices",

  description:
    "Retrieves historical stock price data (OHLCV) over a date range. " +
    "Use for price trends, historical analysis, and comparisons.",

  schema: z.object({
    ticker: z.string().describe("Stock ticker symbol (e.g., AAPL)"),
    interval: z
      .enum(["minute", "day", "week", "month", "year"])
      .default("day")
      .describe("Time interval for price data (default: day)."),
    interval_multiplier: z
      .number()
      .default(1)
      .describe("Multiplier for the interval (default: 1)."),
    start_date: z.string().describe("Start date in YYYY-MM-DD format."),
    end_date: z.string().describe("End date in YYYY-MM-DD format."),
  }),

  func: async (input) => {
    const params = {
      ticker: input.ticker.trim().toUpperCase(),
      interval: input.interval,
      interval_multiplier: input.interval_multiplier,
      start_date: input.start_date,
      end_date: input.end_date,
    };
    const { data, url } = await callApi("/prices/", params);
    return formatToolResult(data.prices || [], [url]);
  },
});
