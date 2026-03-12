/**
 * ============================================================
 * CRYPTOCURRENCY TOOLS (Financial Datasets API)
 * ============================================================
 *
 * Tools for cryptocurrency price data:
 *   1. get_crypto_price_snapshot — current crypto price
 *   2. get_crypto_prices — historical crypto OHLCV data
 *
 * TICKER FORMAT:
 *   - 'BTC-USD' for Bitcoin in USD
 *   - 'ETH-USD' for Ethereum in USD
 *   - 'BTC-ETH' for Bitcoin priced in Ethereum
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { callApi } from "./api";
import { formatToolResult } from "../types";

// ============================================================================
// Crypto Price Snapshot
// ============================================================================

export const getCryptoPriceSnapshot = new DynamicStructuredTool({
  name: "get_crypto_price_snapshot",

  description:
    "Fetches the most recent price snapshot for a cryptocurrency. " +
    "Ticker format: 'BTC-USD' for Bitcoin, 'ETH-USD' for Ethereum.",

  schema: z.object({
    ticker: z
      .string()
      .describe("Crypto ticker (e.g., 'BTC-USD' for Bitcoin, 'ETH-USD' for Ethereum)."),
  }),

  func: async (input) => {
    const params = { ticker: input.ticker.trim().toUpperCase() };
    const { data, url } = await callApi("/crypto/prices/snapshot/", params);
    return formatToolResult(data.snapshot || {}, [url]);
  },
});

// ============================================================================
// Historical Crypto Prices
// ============================================================================

export const getCryptoPrices = new DynamicStructuredTool({
  name: "get_crypto_prices",

  description:
    "Retrieves historical crypto price data (OHLCV) over a date range. " +
    "Ticker format: 'BTC-USD', 'ETH-USD', etc.",

  schema: z.object({
    ticker: z
      .string()
      .describe("Crypto ticker (e.g., 'BTC-USD')."),
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
    const { data, url } = await callApi("/crypto/prices/", params);
    return formatToolResult(data.prices || [], [url]);
  },
});
