/**
 * ============================================================
 * FINANCIAL SEARCH — Intelligent Meta-Tool (Dexter Pattern)
 * ============================================================
 *
 * This is the CROWN JEWEL of the tool system, directly inspired by Dexter.
 *
 * WHAT IS A META-TOOL?
 * --------------------
 * A meta-tool is a tool that uses OTHER tools. Instead of the agent
 * deciding which specific tool to call, the agent calls financial_search
 * with a natural language query, and an internal LLM router decides
 * which sub-tools to invoke.
 *
 * WHY A META-TOOL?
 * ----------------
 *   1. Simplicity for the agent — one tool instead of 12
 *   2. Better routing — the router LLM is specialized for finance
 *   3. Parallel execution — can call multiple sub-tools at once
 *   4. Ticker resolution — "Apple" → AAPL automatically
 *   5. Date inference — "last 5 years" → report_period_gte
 *
 * HOW IT WORKS:
 * -------------
 *   User: "Compare Apple and Microsoft revenue over 3 years"
 *   → Agent calls: financial_search({ query: "Compare Apple and Microsoft revenue over 3 years" })
 *   → Router LLM decides: call get_income_statements(AAPL) AND get_income_statements(MSFT)
 *   → Both tools execute in parallel
 *   → Results combined and returned to the agent
 *   → Agent writes the final comparative analysis
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { AIMessage } from "@langchain/core/messages";
import { z } from "zod";
import { callLlm } from "../../model/llm";
import { formatToolResult } from "../types";
import { getCurrentDate } from "../../agent/prompts";

// Import all financial tools for routing
import { getPriceSnapshot, getStockPrices } from "./prices";
import {
  getIncomeStatements,
  getBalanceSheets,
  getCashFlowStatements,
  getAllFinancialStatements,
} from "./fundamentals";
import { getKeyRatios } from "./key-ratios";
import { getAnalystEstimates } from "./estimates";
import { getCompanyNews } from "./news";
import { getInsiderTrades } from "./insider-trades";
import { getSegmentedRevenues } from "./segments";
import { getCryptoPriceSnapshot, getCryptoPrices } from "./crypto";

// ============================================================================
// Sub-tools available for routing
// ============================================================================

const FINANCE_TOOLS: StructuredToolInterface[] = [
  getPriceSnapshot,
  getStockPrices,
  getIncomeStatements,
  getBalanceSheets,
  getCashFlowStatements,
  getAllFinancialStatements,
  getKeyRatios,
  getAnalystEstimates,
  getCompanyNews,
  getInsiderTrades,
  getSegmentedRevenues,
  getCryptoPriceSnapshot,
  getCryptoPrices,
];

const TOOL_MAP = new Map(FINANCE_TOOLS.map((t) => [t.name, t]));

// ============================================================================
// Router System Prompt
// ============================================================================

function buildRouterPrompt(): string {
  return `You are a financial data routing assistant.
Current date: ${getCurrentDate()}

Given a user's natural language query about financial data, call the appropriate tool(s).

## Guidelines

1. **Ticker Resolution**: Convert company names to ticker symbols:
   - Apple → AAPL, Tesla → TSLA, Microsoft → MSFT, Amazon → AMZN
   - Google/Alphabet → GOOGL, Meta/Facebook → META, Nvidia → NVDA
   - Bitcoin → BTC-USD, Ethereum → ETH-USD

2. **Date Inference**: Convert relative dates to YYYY-MM-DD format:
   - "last year" → report_period_gte 1 year ago
   - "last quarter" → report_period_gte 3 months ago
   - "past 5 years" → report_period_gte 5 years ago, limit 5 (annual) or 20 (quarterly)

3. **Tool Selection**:
   - Stock prices → get_price_snapshot (current) or get_stock_prices (historical)
   - Revenue, earnings, profitability → get_income_statements
   - Debt, assets, equity → get_balance_sheets
   - Cash flow, FCF → get_cash_flow_statements
   - Comprehensive analysis → get_all_financial_statements
   - P/E, EV/EBITDA, ROE, margins → get_key_ratios
   - Market expectations → get_analyst_estimates
   - News, catalysts → get_company_news
   - Insider activity → get_insider_trades
   - Revenue breakdown → get_segmented_revenues
   - Crypto prices → get_crypto_price_snapshot or get_crypto_prices

4. **Period Selection**:
   - Multi-year trends → "annual"
   - Recent/seasonal → "quarterly"
   - Current metrics → "ttm" (trailing twelve months)

5. **Efficiency**:
   - Use the smallest limit that answers the question
   - Point-in-time → limit 1
   - Short trend → limit 3
   - Medium trend → limit 5
   - For comparisons, call the same tool for each ticker
   - Prefer specific tools over get_all_financial_statements when possible

Call the appropriate tool(s) now.`;
}

// ============================================================================
// Financial Search Meta-Tool
// ============================================================================

/**
 * Create a financial_search tool configured with the specified model.
 *
 * WHY A FACTORY FUNCTION?
 * The meta-tool needs to call the LLM internally for routing.
 * It needs to know which model to use. By using a factory,
 * we can configure the model at creation time.
 */
export function createFinancialSearch(model: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: "financial_search",

    description:
      "Intelligent meta-tool for financial data. Takes a natural language query and automatically " +
      "routes to the best financial tools. Handles ticker resolution (Apple → AAPL), " +
      "date inference, and parallel data fetching. Use this for ANY financial data query.\n\n" +
      "Covers: stock prices, income statements, balance sheets, cash flows, key ratios, " +
      "analyst estimates, company news, insider trades, revenue segments, crypto prices.",

    schema: z.object({
      query: z
        .string()
        .describe(
          "Natural language query about financial data (e.g., 'Compare Apple and Tesla revenue')"
        ),
    }),

    func: async (input) => {
      // 1. Call LLM with all finance tools bound — it decides which to invoke
      const { response } = await callLlm(input.query, {
        model,
        systemPrompt: buildRouterPrompt(),
        tools: FINANCE_TOOLS,
      });

      const aiMessage = response as AIMessage;

      // 2. Check for tool calls
      const toolCalls = aiMessage.tool_calls;
      if (!toolCalls || toolCalls.length === 0) {
        return formatToolResult(
          { error: "No financial tools selected for this query" },
          []
        );
      }

      // 3. Execute tool calls in parallel (Dexter pattern)
      const results = await Promise.all(
        toolCalls.map(async (tc) => {
          try {
            const tool = TOOL_MAP.get(tc.name);
            if (!tool) {
              throw new Error(`Tool '${tc.name}' not found`);
            }
            const rawResult = await tool.invoke(tc.args);
            const result =
              typeof rawResult === "string"
                ? rawResult
                : JSON.stringify(rawResult);
            const parsed = JSON.parse(result);
            return {
              tool: tc.name,
              args: tc.args,
              data: parsed.data,
              sourceUrls: parsed.sources || [],
              error: null,
            };
          } catch (error) {
            return {
              tool: tc.name,
              args: tc.args,
              data: null,
              sourceUrls: [],
              error: error instanceof Error ? error.message : String(error),
            };
          }
        })
      );

      // 4. Combine results into a single response
      const successfulResults = results.filter((r) => r.error === null);
      const failedResults = results.filter((r) => r.error !== null);
      const allUrls = results.flatMap((r) => r.sourceUrls);

      const combinedData: Record<string, unknown> = {};

      for (const result of successfulResults) {
        // Key by tool_ticker for multiple calls to same tool
        const ticker = (result.args as Record<string, unknown>)
          .ticker as string | undefined;
        const key = ticker ? `${result.tool}_${ticker}` : result.tool;
        combinedData[key] = result.data;
      }

      if (failedResults.length > 0) {
        combinedData._errors = failedResults.map((r) => ({
          tool: r.tool,
          args: r.args,
          error: r.error,
        }));
      }

      return formatToolResult(combinedData, allUrls);
    },
  });
}
