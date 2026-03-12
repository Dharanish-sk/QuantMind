/**
 * ============================================================
 * FINANCIAL STATEMENTS TOOLS (Financial Datasets API)
 * ============================================================
 *
 * These tools fetch fundamental financial data from the Financial
 * Datasets API (https://api.financialdatasets.ai):
 *   - Income Statements (revenue, profit, EPS)
 *   - Balance Sheets (assets, liabilities, equity)
 *   - Cash Flow Statements (operating, investing, financing flows)
 *   - All Financial Statements (combined, single API call)
 *
 * INSPIRED BY DEXTER:
 * -------------------
 * These tools follow Dexter's pattern of:
 *   1. Shared schema for common parameters
 *   2. createParams() helper to DRY up parameter construction
 *   3. stripFieldsDeep() to reduce token usage
 *   4. Date filtering with report_period_gte/lte operators
 *   5. TTM (trailing twelve months) period support
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { callApi, stripFieldsDeep } from "./api";
import { formatToolResult } from "../types";

const REDUNDANT_FINANCIAL_FIELDS = ['accession_number', 'currency', 'period'] as const;

/**
 * Shared schema for all financial statement tools.
 * All tools accept the same parameters — the LLM learns ONE pattern.
 */
const FinancialStatementsInputSchema = z.object({
  ticker: z
    .string()
    .describe("The stock ticker symbol (e.g., 'AAPL' for Apple)."),
  period: z
    .enum(["annual", "quarterly", "ttm"])
    .default("annual")
    .describe("'annual' for yearly, 'quarterly' for quarterly, 'ttm' for trailing twelve months."),
  limit: z
    .number()
    .default(4)
    .describe("Maximum number of report periods to return (default: 4)."),
  report_period_gte: z
    .string()
    .optional()
    .describe("Filter: report periods on or after this date (YYYY-MM-DD)."),
  report_period_lte: z
    .string()
    .optional()
    .describe("Filter: report periods on or before this date (YYYY-MM-DD)."),
});

function createParams(
  input: z.infer<typeof FinancialStatementsInputSchema>
): Record<string, string | number | undefined> {
  return {
    ticker: input.ticker.trim().toUpperCase(),
    period: input.period,
    limit: input.limit,
    report_period_gte: input.report_period_gte,
    report_period_lte: input.report_period_lte,
  };
}

// ============================================================================
// Income Statements
// ============================================================================

export const getIncomeStatements = new DynamicStructuredTool({
  name: "get_income_statements",
  description:
    "Fetches a company's income statements: revenues, expenses, net income, EPS. " +
    "Useful for evaluating profitability and operational efficiency.",
  schema: FinancialStatementsInputSchema,
  func: async (input) => {
    const params = createParams(input);
    const { data, url } = await callApi("/financials/income-statements/", params);
    return formatToolResult(
      stripFieldsDeep(data.income_statements || [], REDUNDANT_FINANCIAL_FIELDS),
      [url]
    );
  },
});

// ============================================================================
// Balance Sheets
// ============================================================================

export const getBalanceSheets = new DynamicStructuredTool({
  name: "get_balance_sheets",
  description:
    "Retrieves a company's balance sheets: assets, liabilities, equity, debt, cash. " +
    "Useful for assessing financial health and leverage.",
  schema: FinancialStatementsInputSchema,
  func: async (input) => {
    const params = createParams(input);
    const { data, url } = await callApi("/financials/balance-sheets/", params);
    return formatToolResult(
      stripFieldsDeep(data.balance_sheets || [], REDUNDANT_FINANCIAL_FIELDS),
      [url]
    );
  },
});

// ============================================================================
// Cash Flow Statements
// ============================================================================

export const getCashFlowStatements = new DynamicStructuredTool({
  name: "get_cash_flow_statements",
  description:
    "Retrieves cash flow statements: operating, investing, financing activities, free cash flow. " +
    "Useful for understanding liquidity and cash generation.",
  schema: FinancialStatementsInputSchema,
  func: async (input) => {
    const params = createParams(input);
    const { data, url } = await callApi("/financials/cash-flow-statements/", params);
    return formatToolResult(
      stripFieldsDeep(data.cash_flow_statements || [], REDUNDANT_FINANCIAL_FIELDS),
      [url]
    );
  },
});

// ============================================================================
// All Financial Statements (combined — Dexter pattern)
// ============================================================================

export const getAllFinancialStatements = new DynamicStructuredTool({
  name: "get_all_financial_statements",
  description:
    "Retrieves all three financial statements (income, balance sheet, cash flow) in one API call. " +
    "More efficient when you need comprehensive financial analysis.",
  schema: FinancialStatementsInputSchema,
  func: async (input) => {
    const params = createParams(input);
    const { data, url } = await callApi("/financials/", params);
    return formatToolResult(
      stripFieldsDeep(data.financials || {}, REDUNDANT_FINANCIAL_FIELDS),
      [url]
    );
  },
});
