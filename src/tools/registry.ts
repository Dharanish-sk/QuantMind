/**
 * ============================================================
 * TOOL REGISTRY — QuantMind's Tool Management System
 * ============================================================
 *
 * The registry is the "menu" of tools available to the agent.
 * It handles:
 *   1. Registering all tools in one place
 *   2. Conditionally enabling tools based on API keys
 *   3. Building rich descriptions for the system prompt
 *   4. Categorizing tools for better organization
 *
 * INSPIRED BY DEXTER:
 * -------------------
 * Following Dexter's pattern of:
 *   - Category-based organization (MARKET_DATA, FUNDAMENTALS, etc.)
 *   - Rich metadata for system prompt injection
 *   - Conditional tool loading based on env vars
 *   - Meta-tool (financial_search) as primary entry point
 */

import type { StructuredToolInterface } from "@langchain/core/tools";

// Import all tools
import {
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
} from "./finance";
import { createFinancialSearch } from "./finance/financial-search";
import { webSearchTool } from "./search";

// ============================================================================
// Types
// ============================================================================

export type ToolCategory =
  | "META"
  | "MARKET_DATA"
  | "FUNDAMENTALS"
  | "METRICS"
  | "INTELLIGENCE"
  | "CRYPTO"
  | "RESEARCH";

export interface RegisteredTool {
  name: string;
  tool: StructuredToolInterface;
  category: ToolCategory;
  shortDescription: string;
  whenToUse: string[];
  whenNotToUse?: string[];
  requiresApiKey?: string;
}

// ============================================================================
// Tool Definitions
// ============================================================================

/**
 * Build tool definitions for a given model.
 * The model is needed for the financial_search meta-tool (it calls the LLM internally).
 */
function buildToolDefinitions(model: string): RegisteredTool[] {
  return [
    // ─────────────────────────────────────────────────────────────────────
    // META TOOLS (intelligent routing — Dexter's pattern)
    // ─────────────────────────────────────────────────────────────────────
    {
      name: "financial_search",
      tool: createFinancialSearch(model),
      category: "META",
      shortDescription:
        "Intelligent meta-tool — routes natural language queries to the best financial tools",
      whenToUse: [
        "ANY financial data query (prices, statements, ratios, news)",
        "Multi-company comparisons",
        "Complex queries needing multiple data sources",
      ],
      whenNotToUse: [
        "General knowledge questions (use web_search)",
        "Non-financial queries",
      ],
      requiresApiKey: "FINANCIAL_DATASETS_API_KEY",
    },

    // ─────────────────────────────────────────────────────────────────────
    // MARKET DATA TOOLS
    // ─────────────────────────────────────────────────────────────────────
    {
      name: "get_price_snapshot",
      tool: getPriceSnapshot,
      category: "MARKET_DATA",
      shortDescription: "Get current stock price, change, volume, market data",
      whenToUse: [
        "Current/latest stock price",
        "Today's price movement",
        "Quick price check",
      ],
      requiresApiKey: "FINANCIAL_DATASETS_API_KEY",
    },
    {
      name: "get_stock_prices",
      tool: getStockPrices,
      category: "MARKET_DATA",
      shortDescription: "Historical OHLCV price data over a date range",
      whenToUse: [
        "Price trends over time",
        "Historical price analysis",
        "Price comparisons between dates",
      ],
      requiresApiKey: "FINANCIAL_DATASETS_API_KEY",
    },

    // ─────────────────────────────────────────────────────────────────────
    // FUNDAMENTALS TOOLS
    // ─────────────────────────────────────────────────────────────────────
    {
      name: "get_income_statements",
      tool: getIncomeStatements,
      category: "FUNDAMENTALS",
      shortDescription: "Revenue, profit, EPS, margins",
      whenToUse: [
        "Revenue or sales analysis",
        "Profitability assessment",
        "Earnings or EPS lookup",
      ],
      requiresApiKey: "FINANCIAL_DATASETS_API_KEY",
    },
    {
      name: "get_balance_sheets",
      tool: getBalanceSheets,
      category: "FUNDAMENTALS",
      shortDescription: "Assets, liabilities, debt, equity, cash",
      whenToUse: [
        "Debt levels and leverage",
        "Cash position",
        "Financial health assessment",
      ],
      requiresApiKey: "FINANCIAL_DATASETS_API_KEY",
    },
    {
      name: "get_cash_flow_statements",
      tool: getCashFlowStatements,
      category: "FUNDAMENTALS",
      shortDescription: "Operating/investing/financing cash flows, FCF",
      whenToUse: [
        "Cash flow analysis",
        "Free cash flow lookup",
        "Dividend sustainability check",
      ],
      requiresApiKey: "FINANCIAL_DATASETS_API_KEY",
    },
    {
      name: "get_all_financial_statements",
      tool: getAllFinancialStatements,
      category: "FUNDAMENTALS",
      shortDescription: "All three statements in one call",
      whenToUse: ["Comprehensive financial analysis needing all statements"],
      requiresApiKey: "FINANCIAL_DATASETS_API_KEY",
    },

    // ─────────────────────────────────────────────────────────────────────
    // METRICS & INTELLIGENCE TOOLS
    // ─────────────────────────────────────────────────────────────────────
    {
      name: "get_key_ratios",
      tool: getKeyRatios,
      category: "METRICS",
      shortDescription: "P/E, EV/EBITDA, ROE, ROA, margins, dividend yield",
      whenToUse: [
        "Valuation ratios",
        "Profitability metrics",
        "Historical ratio trends",
      ],
      requiresApiKey: "FINANCIAL_DATASETS_API_KEY",
    },
    {
      name: "get_analyst_estimates",
      tool: getAnalystEstimates,
      category: "METRICS",
      shortDescription: "Consensus EPS and revenue estimates",
      whenToUse: [
        "Market expectations",
        "Forward-looking analysis",
        "Earnings estimate comparisons",
      ],
      requiresApiKey: "FINANCIAL_DATASETS_API_KEY",
    },
    {
      name: "get_company_news",
      tool: getCompanyNews,
      category: "INTELLIGENCE",
      shortDescription: "Recent news headlines for a ticker",
      whenToUse: [
        "Price move catalysts",
        "Recent announcements",
        "Company event tracking",
      ],
      requiresApiKey: "FINANCIAL_DATASETS_API_KEY",
    },
    {
      name: "get_insider_trades",
      tool: getInsiderTrades,
      category: "INTELLIGENCE",
      shortDescription: "SEC Form 4 insider buy/sell transactions",
      whenToUse: [
        "Insider buying/selling activity",
        "Executive stock transactions",
        "Insider sentiment analysis",
      ],
      requiresApiKey: "FINANCIAL_DATASETS_API_KEY",
    },
    {
      name: "get_segmented_revenues",
      tool: getSegmentedRevenues,
      category: "INTELLIGENCE",
      shortDescription: "Revenue breakdown by segment/region",
      whenToUse: [
        "Revenue composition analysis",
        "Segment growth trends",
        "Geographic revenue breakdown",
      ],
      requiresApiKey: "FINANCIAL_DATASETS_API_KEY",
    },

    // ─────────────────────────────────────────────────────────────────────
    // CRYPTO TOOLS
    // ─────────────────────────────────────────────────────────────────────
    {
      name: "get_crypto_price_snapshot",
      tool: getCryptoPriceSnapshot,
      category: "CRYPTO",
      shortDescription: "Current cryptocurrency price",
      whenToUse: ["Current crypto price check", "Bitcoin/Ethereum prices"],
      requiresApiKey: "FINANCIAL_DATASETS_API_KEY",
    },
    {
      name: "get_crypto_prices",
      tool: getCryptoPrices,
      category: "CRYPTO",
      shortDescription: "Historical crypto OHLCV data",
      whenToUse: [
        "Crypto price trends",
        "Historical crypto analysis",
      ],
      requiresApiKey: "FINANCIAL_DATASETS_API_KEY",
    },

    // ─────────────────────────────────────────────────────────────────────
    // RESEARCH TOOLS
    // ─────────────────────────────────────────────────────────────────────
    {
      name: "web_search",
      tool: webSearchTool,
      category: "RESEARCH",
      shortDescription: "Search the web for news and general information",
      whenToUse: [
        "General knowledge questions",
        "Recent news not in financial tools",
        "Non-financial queries",
      ],
      whenNotToUse: [
        "Stock prices (use get_price_snapshot)",
        "Financial data (use financial_search)",
      ],
    },
  ];
}

// ============================================================================
// Registry Functions
// ============================================================================

function isToolAvailable(tool: RegisteredTool): boolean {
  if (!tool.requiresApiKey) return true;
  return !!process.env[tool.requiresApiKey];
}

/**
 * Get all available tools for a given model.
 * The model is needed for meta-tools that call the LLM internally.
 */
export function getToolRegistry(model = "gemini-2.5-flash"): RegisteredTool[] {
  return buildToolDefinitions(model).filter(isToolAvailable);
}

/**
 * Get just the tool instances for binding to the LLM.
 */
export function getTools(model = "gemini-2.5-flash"): StructuredToolInterface[] {
  return getToolRegistry(model).map((t) => t.tool);
}

/**
 * Build the tool descriptions section for the system prompt.
 */
export function buildToolDescriptions(model = "gemini-2.5-flash"): string {
  const registry = getToolRegistry(model);

  if (registry.length === 0) {
    return "No tools are currently available. Check your API key configuration in .env";
  }

  // Group tools by category
  const byCategory = new Map<ToolCategory, RegisteredTool[]>();
  for (const tool of registry) {
    const existing = byCategory.get(tool.category) || [];
    existing.push(tool);
    byCategory.set(tool.category, existing);
  }

  const categoryMeta: Record<ToolCategory, string> = {
    META: "Intelligent routing — use these first",
    MARKET_DATA: "Real-time and historical price data",
    FUNDAMENTALS: "Company financial statements",
    METRICS: "Financial ratios and analyst estimates",
    INTELLIGENCE: "News, insider trades, revenue segments",
    CRYPTO: "Cryptocurrency price data",
    RESEARCH: "Web search and external information",
  };

  const categoryOrder: ToolCategory[] = [
    "META",
    "MARKET_DATA",
    "FUNDAMENTALS",
    "METRICS",
    "INTELLIGENCE",
    "CRYPTO",
    "RESEARCH",
  ];

  const sections: string[] = [];

  for (const category of categoryOrder) {
    const tools = byCategory.get(category);
    if (!tools || tools.length === 0) continue;

    let section = `## ${category}\n_${categoryMeta[category]}_\n`;

    for (const tool of tools) {
      section += `\n### ${tool.name}\n`;
      section += `${tool.shortDescription}\n`;
      section += `**Use when:** ${tool.whenToUse.join("; ")}\n`;
      if (tool.whenNotToUse && tool.whenNotToUse.length > 0) {
        section += `**Don't use when:** ${tool.whenNotToUse.join("; ")}\n`;
      }
    }

    sections.push(section);
  }

  return sections.join("\n");
}

/**
 * Get a summary of available tools for logging/debugging.
 */
export function getToolSummary(model = "gemini-2.5-flash"): string {
  const registry = getToolRegistry(model);
  const definitions = buildToolDefinitions(model);
  const available = registry.map((t) => t.name).join(", ");
  const missing = definitions
    .filter((t) => !isToolAvailable(t))
    .map((t) => `${t.name} (needs ${t.requiresApiKey})`)
    .join(", ");

  let summary = `Available tools (${registry.length}): ${available || "none"}`;
  if (missing) {
    summary += `\nMissing tools: ${missing}`;
  }
  return summary;
}
