# QuantMind

QuantMind is an autonomous financial research agent that thinks, plans, and learns as it works. It performs analysis using task planning, self-reflection, and real-time market data. Think Claude Code, but built specifically for financial research.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [How to Install](#how-to-install)
- [How to Run](#how-to-run)
- [How to Evaluate](#how-to-evaluate)
- [How to Debug](#how-to-debug)
- [How to Use with WhatsApp](#how-to-use-with-whatsapp)
- [How to Contribute](#how-to-contribute)
- [License](#license)


## Overview

QuantMind takes complex financial questions and turns them into clear, step-by-step research plans. It runs those tasks using live market data, checks its own work, and refines the results until it has a confident, data-backed answer.

**Key Capabilities:**
- **Intelligent Task Planning**: Automatically decomposes complex queries into structured research steps
- **Autonomous Execution**: Selects and executes the right tools to gather financial data
- **Self-Validation**: Checks its own work and iterates until tasks are complete
- **Real-Time Financial Data**: Access to income statements, balance sheets, and cash flow statements
- **Multi-Provider LLM Support**: Works with OpenAI, Anthropic, Google, xAI, Ollama, and more
- **WhatsApp Integration**: Chat with QuantMind directly through WhatsApp
- **Browser Automation**: Navigate and extract data from JavaScript-heavy websites
- **Skills System**: Pluggable specialized workflows (e.g., DCF valuation)
- **Safety Features**: Built-in loop detection, tool approval, and step limits


## Prerequisites

- [Bun](https://bun.com) runtime (v1.0 or higher)
- At least one LLM API key (OpenAI, Anthropic, Google, xAI, or local Ollama)
- Financial Datasets API key (get [here](https://financialdatasets.ai))
- Exa API key (get [here](https://exa.ai)) - optional, for web search

#### Installing Bun

**macOS/Linux:**
```bash
curl -fsSL https://bun.com/install | bash
```

**Windows:**
```bash
powershell -c "irm bun.sh/install.ps1|iex"
```

After installation, restart your terminal and verify:
```bash
bun --version
```

## How to Install

1. Clone the repository:
```bash
git clone https://github.com/yourusername/quantmind.git
cd quantmind
```

2. Install dependencies:
```bash
bun install
```

3. Set up environment variables:
```bash
cp env.example .env
# Edit .env and add your API keys
```

## How to Run

Run QuantMind in interactive mode:
```bash
bun start
```

With watch mode for development:
```bash
bun dev
```

## How to Evaluate

QuantMind includes an evaluation suite that tests the agent against a dataset of financial questions.

**Run on all questions:**
```bash
bun run src/evals/run.ts
```

**Run on a random sample:**
```bash
bun run src/evals/run.ts --sample 10
```

## How to Debug

QuantMind logs all tool calls to a scratchpad file for debugging and history tracking. Each query creates a new JSONL file in `.quantmind/scratchpad/`.

**Scratchpad location:**
```
.quantmind/scratchpad/
  2025-01-30-111400_9a8f10723f79.jsonl
  ...
```

Each file contains newline-delimited JSON entries tracking:
- **init**: The original query
- **tool_result**: Each tool call with arguments, raw result, and LLM summary
- **thinking**: Agent reasoning steps

## How to Use with WhatsApp

Chat with QuantMind through WhatsApp by linking your phone to the gateway.

**Quick start:**
```bash
# Link your WhatsApp account (scan QR code)
bun run gateway:login

# Start the gateway
bun run gateway
```

Then open WhatsApp, go to your own chat (message yourself), and ask QuantMind a question.

For detailed setup instructions, see the [WhatsApp Gateway README](src/gateway/channels/whatsapp/README.md).

## How to Contribute

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

**Important**: Please keep your pull requests small and focused.

## License

This project is licensed under the MIT License.
