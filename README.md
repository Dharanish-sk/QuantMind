# QuantMind

A CLI-based AI financial research agent built with TypeScript.

## Quick Start

```bash
# Install dependencies
bun install

# Configure API keys in .env
GOOGLE_API_KEY=your_gemini_api_key
FINANCIAL_DATASETS_API_KEY=your_alpha_vantage_key

# Run
bun run start
```

## Example Queries

```
What is Apple's stock price?
Show me Microsoft's revenue for the last 5 years
What is Tesla's debt-to-equity ratio?
Compare Apple and Google's profit margins
```

## Architecture

```
User Query → Agent → LLM (Gemini) → Tool Calls → APIs → Results → Answer
```

## Available Tools

| Tool | Description |
|------|-------------|
| `get_price_snapshot` | Current stock price and daily change |
| `get_income_statements` | Revenue, profit, EPS |
| `get_balance_sheets` | Assets, debt, equity |
| `get_cash_flow_statements` | Cash flows, FCF |
| `web_search` | Web search for news |

## Documentation

See [DOCUMENTATION.md](./DOCUMENTATION.md) for complete technical documentation including:
- Architecture deep dive
- File-by-file code explanation
- Data flow diagrams
- API reference

## Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript
- **UI**: React + Ink (terminal)
- **LLM**: Google Gemini
- **Framework**: LangChain
- **Financial Data**: Alpha Vantage

## Project Structure

```
src/
├── index.tsx          # Entry point
├── agent/             # Agent loop and logic
├── model/             # LLM communication
├── tools/             # Financial and search tools
├── components/        # UI components
└── utils/             # Utilities
```
