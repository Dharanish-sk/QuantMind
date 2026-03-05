/**
 * ============================================================
 * TOOL REGISTRY — Central Hub for All Agent Tools
 * ============================================================
 *
 * The registry is like a "menu" of tools available to the agent.
 * It handles:
 *   1. Registering all tools in one place
 *   2. Conditionally loading tools based on API keys
 *   3. Building tool descriptions for the system prompt
 *
 * WHY A REGISTRY?
 * ----------------
 * Without a registry, you'd have to:
 *   - Import tools in multiple places
 *   - Check API keys everywhere
 *   - Manually keep descriptions in sync
 *
 * With a registry:
 *   - One import: getTools(model)
 *   - API key checks in one place
 *   - Descriptions automatically generated
 *
 * HOW IT WORKS
 * ------------
 *
 * 1. Each tool is registered with:
 *    - name: What the LLM calls it ("web_search")
 *    - tool: The actual DynamicStructuredTool instance
 *    - description: Rich description for the system prompt
 *
 * 2. getTools(model) returns just the tool instances
 *    → Used by agent.ts to bind tools to the LLM
 *
 * 3. buildToolDescriptions(model) returns formatted descriptions
 *    → Used by prompts.ts to build the system prompt
 */

import type { StructuredToolInterface } from "@langchain/core/tools";

// Import tools (we'll create these next)
// For now, we'll have placeholder imports that we'll fill in
import { webSearchTool } from "./search/tavily";
import {
  getIncomeStatements,
  getBalanceSheets,
  getCashFlowStatements,
} from "./finance/fundamentals";
import { getPriceSnapshot } from "./finance/prices";

// ============================================================================
// Types
// ============================================================================

/**
 * A registered tool with its rich description.
 *
 * The description is SEPARATE from the tool's built-in description because:
 * - Tool descriptions are short (one line, for the LLM's function call UI)
 * - Rich descriptions are long (when to use, when NOT to use, examples)
 *
 * The rich description goes in the SYSTEM PROMPT where the LLM has more
 * context to make good decisions about which tool to use.
 */
export interface RegisteredTool {
  /** Tool name (must match tool.name exactly) */
  name: string;

  /** The actual tool instance */
  tool: StructuredToolInterface;

  /** Rich description for the system prompt */
  description: string;
}

// ============================================================================
// Tool Descriptions (Rich descriptions for system prompt)
// ============================================================================

/**
 * Rich description for web_search tool.
 *
 * Notice the structure:
 * - What it does
 * - When to use it
 * - When NOT to use it (very important!)
 * - Example queries
 */
const WEB_SEARCH_DESCRIPTION = `Search the web for current information.

**When to use:**
- Current events, news, recent announcements
- Information that changes frequently
- Topics not covered by financial tools

**When NOT to use:**
- Financial data (use financial tools instead - they're more accurate)
- Historical facts that don't change

**Example queries:**
- "Apple Q4 2025 earnings call highlights"
- "Latest Fed interest rate decision"
- "Tesla Cybertruck reviews"`;

/**
 * Rich description for get_income_statements tool.
 */
const INCOME_STATEMENTS_DESCRIPTION = `Fetch a company's income statements.

**What it returns:**
- Revenue, cost of goods sold, gross profit
- Operating expenses, operating income
- Net income, earnings per share

**When to use:**
- Analyzing profitability
- Comparing revenue growth year-over-year
- Understanding cost structure

**Parameters:**
- ticker: Stock symbol (e.g., "AAPL")
- period: "annual", "quarterly", or "ttm"
- limit: Number of periods to fetch (default: 5)`;

const BALANCE_SHEETS_DESCRIPTION = `Fetch a company's balance sheets.

**What it returns:**
- Assets (cash, inventory, property)
- Liabilities (debt, accounts payable)
- Shareholders' equity

**When to use:**
- Analyzing financial health
- Understanding capital structure
- Evaluating liquidity`;

const CASH_FLOW_DESCRIPTION = `Fetch a company's cash flow statements.

**What it returns:**
- Operating cash flow
- Investing cash flow
- Financing cash flow
- Free cash flow

**When to use:**
- Understanding how cash is generated and used
- Evaluating sustainability of operations`;

const PRICE_SNAPSHOT_DESCRIPTION = `Get current stock price and basic market data.

**What it returns:**
- Current price
- Day's high/low
- Volume
- Change ($ and %)

**When to use:**
- Checking current stock price
- Basic market data lookup`;

// ============================================================================
// Registry Functions
// ============================================================================

/**
 * Get all registered tools with their descriptions.
 *
 * Conditionally includes tools based on environment variables.
 * If an API key isn't set, the tool isn't included.
 *
 * @param _model - Model name (for future model-specific tools)
 * @returns Array of registered tools
 */
export function getToolRegistry(_model: string): RegisteredTool[] {
  const tools: RegisteredTool[] = [];

  // ── Financial Tools (always available with FINANCIAL_DATASETS_API_KEY) ──
  if (process.env.FINANCIAL_DATASETS_API_KEY) {
    tools.push(
      {
        name: "get_income_statements",
        tool: getIncomeStatements,
        description: INCOME_STATEMENTS_DESCRIPTION,
      },
      {
        name: "get_balance_sheets",
        tool: getBalanceSheets,
        description: BALANCE_SHEETS_DESCRIPTION,
      },
      {
        name: "get_cash_flow_statements",
        tool: getCashFlowStatements,
        description: CASH_FLOW_DESCRIPTION,
      },
      {
        name: "get_price_snapshot",
        tool: getPriceSnapshot,
        description: PRICE_SNAPSHOT_DESCRIPTION,
      }
    );
  }

  // ── Web Search (Tavily) ──
  if (process.env.TAVILY_API_KEY) {
    tools.push({
      name: "web_search",
      tool: webSearchTool,
      description: WEB_SEARCH_DESCRIPTION,
    });
  }

  return tools;
}

/**
 * Get just the tool instances for binding to the LLM.
 *
 * This is what the agent uses:
 *   const tools = getTools(model);
 *   const llmWithTools = llm.bindTools(tools);
 *
 * @param model - Model name
 * @returns Array of tool instances
 */
export function getTools(model: string): StructuredToolInterface[] {
  return getToolRegistry(model).map((t) => t.tool);
}

/**
 * Build the tool descriptions section for the system prompt.
 *
 * Formats each tool's rich description with a header.
 * This is injected into the system prompt so the LLM knows:
 * - What tools are available
 * - When to use each tool
 * - When NOT to use each tool
 *
 * @param model - Model name
 * @returns Formatted string with all tool descriptions
 *
 * @example Output:
 * ### web_search
 *
 * Search the web for current information...
 *
 * ### get_income_statements
 *
 * Fetch a company's income statements...
 */
export function buildToolDescriptions(model: string): string {
  const registry = getToolRegistry(model);

  if (registry.length === 0) {
    return "No tools are currently available. Check your API key configuration.";
  }

  return registry.map((t) => `### ${t.name}\n\n${t.description}`).join("\n\n");
}
