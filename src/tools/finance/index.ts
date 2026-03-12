/**
 * ============================================================
 * FINANCE TOOLS INDEX (Barrel File)
 * ============================================================
 *
 * Re-exports all financial tools from a single import point.
 *
 * Usage:
 *   import { getPriceSnapshot, getIncomeStatements, getCompanyNews } from "./tools/finance";
 */

// Price data
export { getPriceSnapshot, getStockPrices } from "./prices";

// Financial statements
export {
  getIncomeStatements,
  getBalanceSheets,
  getCashFlowStatements,
  getAllFinancialStatements,
} from "./fundamentals";

// Key ratios and metrics
export { getKeyRatios } from "./key-ratios";

// Analyst estimates
export { getAnalystEstimates } from "./estimates";

// Company news
export { getCompanyNews } from "./news";

// Insider trading
export { getInsiderTrades } from "./insider-trades";

// Revenue segments
export { getSegmentedRevenues } from "./segments";

// Cryptocurrency
export { getCryptoPriceSnapshot, getCryptoPrices } from "./crypto";
