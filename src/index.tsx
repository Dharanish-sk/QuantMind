/**
 * ============================================================
 * INDEX.TSX — QuantMind CLI Entry Point (Dexter-Inspired)
 * ============================================================
 *
 * Main entry point for the QuantMind CLI application.
 * React/Ink terminal UI that:
 *   1. Shows a welcome screen with SOUL identity
 *   2. Accepts user queries in a persistent chat loop
 *   3. Runs the Agent with financial tools
 *   4. Displays real-time progress and final answers
 *   5. Supports multiple queries in one session
 *
 * IMPROVEMENTS OVER ORIGINAL:
 * - Multi-query chat loop (keep asking questions)
 * - Chat history display (see past Q&A)
 * - Smart tool name and result summarization (Dexter pattern)
 * - Better statistics reporting
 * - Model passed through to meta-tools for routing
 */

import { useState } from "react";
import { render, Box, Text } from "ink";
import { config } from "dotenv";
import { Input } from "./components/input";
import { Intro } from "./components/intro";
import { Agent } from "./agent/agent";
import { getTools, getToolSummary } from "./tools/registry";
import type { AgentEvent } from "./agent/types";
import { colors } from "./theme";

// Load environment variables from .env file
config({ quiet: true });

// ============================================================================
// Types
// ============================================================================

interface ToolDisplay {
  id: string;
  name: string;
  args: string;
  status: "running" | "done" | "error";
  result?: string;
  duration?: number;
}

interface ChatEntry {
  query: string;
  answer: string;
  toolCount: number;
  iterations: number;
  totalTime: number;
  tokensPerSecond?: number;
}

// ============================================================================
// Constants
// ============================================================================

const MODEL = "gemini-2.5-flash";

// ============================================================================
// Main App
// ============================================================================

function App() {
  const [chatHistory, setChatHistory] = useState<ChatEntry[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [toolDisplays, setToolDisplays] = useState<ToolDisplay[]>([]);
  const [stats, setStats] = useState<{
    iterations: number;
    totalTime: number;
    tokensPerSecond?: number;
  } | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  // ─────────────────────────────────────────────────────────────────────────
  // HANDLE QUERY SUBMISSION
  // ─────────────────────────────────────────────────────────────────────────

  async function handleSubmit(userQuery: string) {
    if (!userQuery.trim()) return;

    // Save previous answer to chat history
    if (answer && query) {
      setChatHistory((prev) => [
        ...prev,
        {
          query,
          answer,
          toolCount: toolDisplays.filter((t) => t.status === "done").length,
          iterations: stats?.iterations || 0,
          totalTime: stats?.totalTime || 0,
          tokensPerSecond: stats?.tokensPerSecond,
        },
      ]);
    }

    // Reset state
    setQuery(userQuery);
    setAnswer("");
    setError("");
    setToolDisplays([]);
    setStats(null);
    setStatus("Thinking...");
    setIsRunning(true);

    try {
      const tools = getTools(MODEL);
      const agent = Agent.create({ model: MODEL }, tools);

      for await (const event of agent.run(userQuery)) {
        handleAgentEvent(event);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      setStatus("");
    } finally {
      setIsRunning(false);
    }
  }

  function handleAgentEvent(event: AgentEvent) {
    switch (event.type) {
      case "thinking":
        setStatus(event.message);
        break;

      case "tool_start":
        setToolDisplays((prev) => [
          ...prev,
          {
            id: `${event.tool}-${Date.now()}`,
            name: event.tool,
            args: formatArgs(event.args),
            status: "running",
          },
        ]);
        setStatus(`Calling ${summarizeToolName(event.tool)}...`);
        break;

      case "tool_end":
        setToolDisplays((prev) =>
          prev.map((t) =>
            t.status === "running" && t.name === event.tool
              ? {
                  ...t,
                  status: "done" as const,
                  duration: event.duration,
                  result: summarizeToolResult(event.tool, event.result),
                }
              : t
          )
        );
        setStatus("");
        break;

      case "tool_error":
        setToolDisplays((prev) =>
          prev.map((t) =>
            t.status === "running" && t.name === event.tool
              ? { ...t, status: "error" as const, result: event.error }
              : t
          )
        );
        setStatus("");
        break;

      case "tool_limit":
        if (event.warning) setStatus(`Warning: ${event.warning}`);
        break;

      case "context_cleared":
        setStatus(`Cleared ${event.clearedCount} old results from context`);
        break;

      case "answer_start":
        setStatus("Writing answer...");
        break;

      case "done":
        setAnswer(event.answer);
        setStatus("");
        setStats({
          iterations: event.iterations,
          totalTime: event.totalTime,
          tokensPerSecond: event.tokensPerSecond,
        });
        break;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HELPERS (Dexter-inspired tool summarization)
  // ─────────────────────────────────────────────────────────────────────────

  function formatArgs(args: Record<string, unknown>): string {
    return Object.entries(args)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
  }

  function summarizeToolName(name: string): string {
    const names: Record<string, string> = {
      financial_search: "financial data",
      get_price_snapshot: "price snapshot",
      get_stock_prices: "price history",
      get_income_statements: "income statements",
      get_balance_sheets: "balance sheets",
      get_cash_flow_statements: "cash flows",
      get_all_financial_statements: "all financials",
      get_key_ratios: "key ratios",
      get_analyst_estimates: "analyst estimates",
      get_company_news: "company news",
      get_insider_trades: "insider trades",
      get_segmented_revenues: "revenue segments",
      get_crypto_price_snapshot: "crypto price",
      get_crypto_prices: "crypto history",
      web_search: "web search",
    };
    return names[name] || name;
  }

  function summarizeToolResult(tool: string, result: string): string {
    try {
      const parsed = JSON.parse(result);
      const data = parsed.data;

      if (tool === "financial_search") {
        const keys = Object.keys(data || {}).filter((k) => k !== "_errors");
        return `Called ${keys.length} data source${keys.length !== 1 ? "s" : ""}`;
      }

      if (Array.isArray(data)) {
        return `${data.length} item${data.length !== 1 ? "s" : ""}`;
      }

      if (data && typeof data === "object") {
        const keys = Object.keys(data);
        return `${keys.length} field${keys.length !== 1 ? "s" : ""}`;
      }

      return result.slice(0, 60);
    } catch {
      return result.slice(0, 60);
    }
  }

  function formatTime(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <Box flexDirection="column" padding={1}>
      <Intro />

      {/* Chat history */}
      {chatHistory.map((entry, i) => (
        <Box key={i} flexDirection="column" marginTop={1}>
          <Box>
            <Text color={colors.muted}>You: </Text>
            <Text color={colors.white}>{entry.query}</Text>
          </Box>
          <Box
            flexDirection="column"
            borderStyle="round"
            borderColor={colors.muted}
            paddingX={1}
          >
            <Text color={colors.primaryLight}>{entry.answer}</Text>
          </Box>
          <Text color={colors.muted}>
            {entry.toolCount} tool{entry.toolCount !== 1 ? "s" : ""} | {entry.iterations} iter | {formatTime(entry.totalTime)}
            {entry.tokensPerSecond ? ` | ${entry.tokensPerSecond.toFixed(0)} tok/s` : ""}
          </Text>
        </Box>
      ))}

      {/* Current query */}
      {query && (
        <Box marginTop={1}>
          <Text color={colors.muted}>You: </Text>
          <Text color={colors.white}>{query}</Text>
        </Box>
      )}

      {/* Tool calls */}
      {toolDisplays.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {toolDisplays.map((tool) => (
            <Box key={tool.id}>
              <Text>
                {tool.status === "running" && <Text color={colors.warning}>● </Text>}
                {tool.status === "done" && <Text color={colors.success}>✓ </Text>}
                {tool.status === "error" && <Text color={colors.error}>✗ </Text>}
                <Text color={colors.accent}>{summarizeToolName(tool.name)}</Text>
                <Text color={colors.muted}> ({tool.args})</Text>
                {tool.duration && (
                  <Text color={colors.muted}> [{formatTime(tool.duration)}]</Text>
                )}
                {tool.result && tool.status === "done" && (
                  <Text color={colors.muted}> → {tool.result}</Text>
                )}
              </Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Status */}
      {status && (
        <Box marginTop={1}>
          <Text color={colors.warning}>{status}</Text>
        </Box>
      )}

      {/* Error */}
      {error && (
        <Box marginTop={1}>
          <Text color={colors.error}>Error: {error}</Text>
        </Box>
      )}

      {/* Answer */}
      {answer && (
        <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor={colors.primary} paddingX={1}>
          <Text color={colors.success}>{answer}</Text>
        </Box>
      )}

      {/* Stats */}
      {stats && (
        <Box marginTop={1}>
          <Text color={colors.muted}>
            {toolDisplays.filter((t) => t.status === "done").length} tool{toolDisplays.filter((t) => t.status === "done").length !== 1 ? "s" : ""} | {stats.iterations} iter | {formatTime(stats.totalTime)}
            {stats.tokensPerSecond ? ` | ${stats.tokensPerSecond.toFixed(0)} tok/s` : ""}
          </Text>
        </Box>
      )}

      {/* Input */}
      <Box marginTop={1}>
        {isRunning ? (
          <Text color={colors.warning}>Working...</Text>
        ) : (
          <Input onSubmit={handleSubmit} />
        )}
      </Box>
    </Box>
  );
}

// ============================================================================
// Start the app
// ============================================================================

console.log("\n" + getToolSummary(MODEL) + "\n");

const { waitUntilExit } = render(<App />);
await waitUntilExit();
