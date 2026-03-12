/**
 * ============================================================
 * SEGMENTED REVENUES TOOL (Financial Datasets API)
 * ============================================================
 *
 * Provides a breakdown of revenue by operating segments
 * (products, services, geographic regions).
 *
 * EXAMPLE:
 * Apple's revenue segments:
 *   - iPhone: $200B
 *   - Services: $85B
 *   - Mac: $30B
 *   - iPad: $28B
 *   - Wearables: $37B
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { callApi, stripFieldsDeep } from "./api";
import { formatToolResult } from "../types";

const REDUNDANT_FIELDS = ['accession_number', 'currency', 'period'] as const;

export const getSegmentedRevenues = new DynamicStructuredTool({
  name: "get_segmented_revenues",

  description:
    "Provides a detailed breakdown of revenue by operating segments " +
    "(products, services, geographic regions). " +
    "Useful for analyzing revenue composition and segment growth.",

  schema: z.object({
    ticker: z
      .string()
      .describe("The stock ticker symbol (e.g., 'AAPL' for Apple)."),
    period: z
      .enum(["annual", "quarterly"])
      .default("annual")
      .describe("'annual' for yearly, 'quarterly' for quarterly."),
    limit: z
      .number()
      .default(4)
      .describe("Number of past periods to retrieve (default: 4)."),
  }),

  func: async (input) => {
    const params = {
      ticker: input.ticker.trim().toUpperCase(),
      period: input.period,
      limit: input.limit,
    };
    const { data, url } = await callApi("/financials/segmented-revenues/", params);
    return formatToolResult(
      stripFieldsDeep(data.segmented_revenues || {}, REDUNDANT_FIELDS),
      [url]
    );
  },
});
