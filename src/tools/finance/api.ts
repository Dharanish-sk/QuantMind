/**
 * ============================================================
 * Financial Datasets API Client
 * ============================================================
 *
 * This module handles all communication with the Financial Datasets API
 * (https://api.financialdatasets.ai), an institutional-grade financial
 * data provider.
 *
 * WHY SWITCH FROM ALPHA VANTAGE?
 * ------------------------------
 * Alpha Vantage has severe limitations:
 *   - 25 requests/day on free tier
 *   - Delayed data
 *   - Limited endpoints
 *
 * Financial Datasets API provides:
 *   - Institutional-grade data
 *   - Income statements, balance sheets, cash flows
 *   - Key ratios, analyst estimates, insider trades
 *   - News, SEC filings, segmented revenues
 *   - Free tier includes AAPL, NVDA, MSFT
 *
 * ARCHITECTURE:
 * -------------
 * All financial tools call this ONE api.ts module.
 * This gives us a single place to:
 *   - Add authentication headers
 *   - Handle errors consistently
 *   - Add caching later
 *   - Log API calls for debugging
 */

const BASE_URL = 'https://api.financialdatasets.ai';

export interface ApiResponse {
  data: Record<string, unknown>;
  url: string;
}

/**
 * Remove redundant fields from API payloads before they are returned to the LLM.
 * This reduces token usage while preserving the financial metrics needed for analysis.
 *
 * WHY STRIP FIELDS?
 * Financial API responses include fields like:
 *   - accession_number (SEC filing ID — not useful for analysis)
 *   - currency (always "USD" for US stocks)
 *   - period (redundant — we already know from the query)
 *
 * Every field costs tokens. Stripping these saves ~15-20% on token usage.
 */
export function stripFieldsDeep(value: unknown, fields: readonly string[]): unknown {
  const fieldsToStrip = new Set(fields);

  function walk(node: unknown): unknown {
    if (Array.isArray(node)) {
      return node.map(walk);
    }

    if (!node || typeof node !== 'object') {
      return node;
    }

    const record = node as Record<string, unknown>;
    const cleaned: Record<string, unknown> = {};

    for (const [key, child] of Object.entries(record)) {
      if (fieldsToStrip.has(key)) {
        continue;
      }
      cleaned[key] = walk(child);
    }

    return cleaned;
  }

  return walk(value);
}

/**
 * Call the Financial Datasets API.
 *
 * @param endpoint - API endpoint (e.g., '/financials/income-statements/')
 * @param params   - Query parameters (ticker, period, limit, etc.)
 * @returns { data, url } — parsed JSON data and the URL that was called
 *
 * FLOW:
 *   1. Read API key at call time (after dotenv loads)
 *   2. Build URL with query parameters
 *   3. Make authenticated request
 *   4. Validate response
 *   5. Return parsed data
 */
export async function callApi(
  endpoint: string,
  params: Record<string, string | number | string[] | undefined>,
): Promise<ApiResponse> {
  // Read API key lazily at call time (after dotenv has loaded)
  const FINANCIAL_DATASETS_API_KEY = process.env.FINANCIAL_DATASETS_API_KEY;

  if (!FINANCIAL_DATASETS_API_KEY) {
    throw new Error('FINANCIAL_DATASETS_API_KEY not configured in .env');
  }

  // Build the URL with query parameters
  const url = new URL(`${BASE_URL}${endpoint}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      if (Array.isArray(value)) {
        value.forEach((v) => url.searchParams.append(key, v));
      } else {
        url.searchParams.append(key, String(value));
      }
    }
  }

  // Make the API call with authentication
  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: {
        'x-api-key': FINANCIAL_DATASETS_API_KEY,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[Financial Datasets API] network error: ${message}`);
  }

  if (!response.ok) {
    const detail = `${response.status} ${response.statusText}`;
    throw new Error(`[Financial Datasets API] request failed: ${detail}`);
  }

  const data = (await response.json().catch(() => {
    throw new Error(`[Financial Datasets API] invalid JSON response`);
  })) as Record<string, unknown>;

  return { data, url: url.toString() };
}
