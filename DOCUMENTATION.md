# QuantMind - Complete Technical Documentation

> A CLI-based AI financial research agent built with TypeScript, React/Ink, and LangChain.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Core Concepts](#2-core-concepts)
3. [Architecture](#3-architecture)
4. [File-by-File Deep Dive](#4-file-by-file-deep-dive)
5. [Data Flow](#5-data-flow)
6. [API Reference](#6-api-reference)
7. [Glossary](#7-glossary)

---

# 1. Project Overview

## What is QuantMind?

QuantMind is a **CLI-based AI agent** that can answer financial questions by:
1. Understanding your question using an LLM (Gemini)
2. Deciding which tools to use (stock prices, financial statements, web search)
3. Executing those tools to get real data
4. Synthesizing the data into a human-readable answer

## The Problem It Solves

**Regular ChatGPT/Gemini:**
```
User: "What is Apple's current stock price?"
AI: "I don't have access to real-time data. As of my training cutoff..."
```

**QuantMind:**
```
User: "What is Apple's current stock price?"
QuantMind: [calls get_price_snapshot tool]
QuantMind: "Apple (AAPL) is trading at $228.50, up 1.2% ($2.70) today."
```

## Technology Stack

| Technology | Purpose |
|------------|---------|
| **TypeScript** | Type-safe JavaScript |
| **Bun** | Fast JavaScript runtime |
| **React + Ink** | Terminal UI framework |
| **LangChain** | LLM framework (tools, prompts) |
| **Gemini** | Google's LLM (the "brain") |
| **Alpha Vantage** | Financial data API |
| **Zod** | Schema validation |

---

# 2. Core Concepts

## 2.1 What is an "Agent"?

An **agent** is an AI system that can:
1. **Reason** about a problem
2. **Decide** what actions to take
3. **Execute** those actions (using tools)
4. **Observe** the results
5. **Repeat** until the task is complete

This is called the **ReAct pattern** (Reason + Act).

```
┌─────────────────────────────────────────────────────────────┐
│                    THE ReAct LOOP                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌──────────┐     ┌──────────┐     ┌──────────┐           │
│   │  REASON  │ ──▶ │   ACT    │ ──▶ │ OBSERVE  │ ──┐       │
│   │          │     │          │     │          │   │       │
│   │ "I need  │     │ Call     │     │ Got      │   │       │
│   │  Apple's │     │ get_     │     │ price    │   │       │
│   │  price"  │     │ price()  │     │ data     │   │       │
│   └──────────┘     └──────────┘     └──────────┘   │       │
│        ▲                                           │       │
│        │                                           │       │
│        └───────────────────────────────────────────┘       │
│                                                             │
│   Loop continues until LLM has enough data to answer       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 2.2 What is a "Tool"?

A **tool** is a function that the LLM can request to call. The LLM doesn't execute it directly - it outputs a "tool call" request, and our code executes it.

```typescript
// The LLM outputs this (conceptual):
{
  text: "I'll look up Apple's stock price.",
  tool_calls: [
    {
      name: "get_price_snapshot",
      arguments: { ticker: "AAPL" }
    }
  ]
}

// Our agent sees tool_calls, executes the function, sends result back to LLM
```

**Why tools are powerful:**
- LLMs have training cutoff dates (can't know today's stock price)
- LLMs can't access external systems (APIs, databases)
- Tools give LLMs "superpowers" to interact with the real world

## 2.3 What is a "Prompt"?

A **prompt** is the text we send to the LLM. There are different types:

| Prompt Type | Purpose | When Sent |
|-------------|---------|-----------|
| **System Prompt** | Instructions, personality, rules | Once at start |
| **User Prompt** | The user's question | Each query |
| **Iteration Prompt** | Query + tool results so far | Each loop iteration |
| **Final Answer Prompt** | Full context for final answer | When generating answer |

## 2.4 What is a "Scratchpad"?

The **scratchpad** is the agent's "lab notebook" - it records everything:
- The original query
- Every tool call (name, arguments, result)
- Every "thinking" step

**Why we need it:**
1. **Debugging**: Open the JSONL file to see exactly what happened
2. **Final answer**: Load all data for comprehensive answer
3. **Loop prevention**: Track tool call counts to prevent infinite loops

## 2.5 What are "Events"?

The agent emits **events** as it works, allowing the UI to update in real-time:

```typescript
// Events emitted during a typical query:
{ type: "thinking", message: "I need to look up Apple's revenue" }
{ type: "tool_start", tool: "get_income_statements", args: {...} }
{ type: "tool_end", tool: "get_income_statements", result: "...", duration: 423 }
{ type: "answer_start" }
{ type: "done", answer: "Apple's revenue was $383B...", iterations: 2 }
```

## 2.6 What is "Context Window"?

LLMs can only process a limited amount of text at once - this is the **context window**:

| Model | Context Window |
|-------|---------------|
| Gemini 2.5 Flash | ~1 million tokens |
| GPT-4 | ~128K tokens |
| Claude 3 | ~200K tokens |

**1 token ≈ 4 characters** (in English)

When tool results accumulate and approach the limit, we **clear old results** to make room for new ones. This is called "context management."

---

# 3. Architecture

## 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                              │
│                         (index.tsx)                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │   Intro     │  │   Input     │  │  Answer     │                 │
│  │  Component  │  │  Component  │  │  Display    │                 │
│  └─────────────┘  └─────────────┘  └─────────────┘                 │
└────────────────────────────┬────────────────────────────────────────┘
                             │ user query
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          AGENT LAYER                                │
│                         (agent.ts)                                  │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                     AGENT LOOP                               │   │
│  │  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐   │   │
│  │  │  Call   │───▶│ Check   │───▶│Execute  │───▶│  Build  │   │   │
│  │  │   LLM   │    │  Tools  │    │  Tools  │    │  Next   │   │   │
│  │  │         │    │         │    │         │    │ Prompt  │   │   │
│  │  └─────────┘    └─────────┘    └─────────┘    └─────────┘   │   │
│  │       ▲                                            │         │   │
│  │       └────────────────────────────────────────────┘         │   │
│  └─────────────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   LLM LAYER     │ │   TOOL LAYER    │ │ PERSISTENCE     │
│   (llm.ts)      │ │  (registry.ts)  │ │ (scratchpad.ts) │
│                 │ │                 │ │                 │
│ - Call Gemini   │ │ - Price tool    │ │ - Save results  │
│ - Handle tools  │ │ - Income tool   │ │ - Track limits  │
│ - Retry logic   │ │ - Balance tool  │ │ - JSONL files   │
│                 │ │ - Cash flow     │ │                 │
│                 │ │ - Web search    │ │                 │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

## 3.2 Directory Structure

```
financeResearchAgent/
│
├── src/
│   │
│   ├── index.tsx              # Entry point, main UI
│   ├── theme.ts               # Color definitions
│   │
│   ├── agent/                 # The "brain"
│   │   ├── agent.ts           # Main agent loop
│   │   ├── prompts.ts         # System/iteration prompts
│   │   ├── scratchpad.ts      # Tool result tracking
│   │   ├── token-counter.ts   # Token usage tracking
│   │   └── types.ts           # TypeScript interfaces
│   │
│   ├── model/                 # LLM communication
│   │   └── llm.ts             # Gemini API wrapper
│   │
│   ├── tools/                 # Agent capabilities
│   │   ├── registry.ts        # Tool registration
│   │   ├── types.ts           # Shared tool utilities
│   │   ├── finance/           # Financial data tools
│   │   │   ├── index.ts
│   │   │   ├── prices.ts
│   │   │   └── fundamentals.ts
│   │   └── search/            # Web search tools
│   │       ├── index.ts
│   │       └── web-search.ts
│   │
│   ├── components/            # UI components
│   │   ├── input.tsx
│   │   └── intro.tsx
│   │
│   └── utils/                 # Utilities
│       ├── ai-message.ts
│       └── tokens.ts
│
├── .env                       # API keys (never commit!)
├── package.json               # Dependencies
└── tsconfig.json              # TypeScript config
```

## 3.3 Dependency Graph

```
index.tsx
    │
    ├── Agent (agent.ts)
    │       │
    │       ├── callLlm (llm.ts)
    │       │       │
    │       │       └── ChatGoogleGenerativeAI (LangChain)
    │       │
    │       ├── Scratchpad (scratchpad.ts)
    │       │
    │       ├── TokenCounter (token-counter.ts)
    │       │
    │       └── buildSystemPrompt (prompts.ts)
    │               │
    │               └── buildToolDescriptions (registry.ts)
    │
    ├── getTools (registry.ts)
    │       │
    │       ├── getPriceSnapshot (prices.ts)
    │       ├── getIncomeStatements (fundamentals.ts)
    │       ├── getBalanceSheets (fundamentals.ts)
    │       ├── getCashFlowStatements (fundamentals.ts)
    │       └── webSearchTool (web-search.ts)
    │
    └── Components
            ├── Input (input.tsx)
            └── Intro (intro.tsx)
```

---

# 4. File-by-File Deep Dive

## 4.1 Entry Point: `src/index.tsx`

This is the main file that runs when you start the app.

### Imports Explained

```typescript
import { useState } from "react";
// useState is React's way to create "state variables"
// State variables trigger UI re-renders when they change

import { render, Box, Text } from "ink";
// Ink is React for the terminal
// - render(): starts the Ink app
// - Box: like <div>, a container for layout
// - Text: like <span>, displays text

import { config } from "dotenv";
// Loads environment variables from .env file
// This is how we get API keys without hardcoding them

import { Input } from "./components/input";
// Our custom input component

import { Intro } from "./components/intro";
// Our welcome screen component

import { Agent } from "./agent/agent";
// The main agent class that runs the ReAct loop

import { getTools, getToolSummary } from "./tools/registry";
// getTools(): returns array of tool instances
// getToolSummary(): returns human-readable list of available tools

import type { AgentEvent } from "./agent/types";
// TypeScript type for events the agent emits

import { colors } from "./theme";
// Color definitions for consistent styling
```

### State Variables Explained

```typescript
const [query, setQuery] = useState("");
// query: the current user query being processed
// setQuery: function to update query (triggers re-render)

const [status, setStatus] = useState("");
// status: current status message ("Thinking...", "Calling tool...")

const [answer, setAnswer] = useState("");
// answer: the final answer from the agent

const [error, setError] = useState("");
// error: any error message to display

const [toolDisplays, setToolDisplays] = useState<ToolDisplay[]>([]);
// toolDisplays: array of tool calls to show in the UI
// Each entry tracks: name, args, status (running/done/error), result

const [stats, setStats] = useState<{...} | null>(null);
// stats: performance statistics after completion
// iterations, totalTime, tokensPerSecond

const [isRunning, setIsRunning] = useState(false);
// isRunning: whether the agent is currently processing
// Used to disable input while running
```

### The handleSubmit Function

```typescript
async function handleSubmit(userQuery: string) {
  // Step 1: Validate input
  if (!userQuery.trim()) return;
  // .trim() removes whitespace
  // If query is empty/whitespace-only, do nothing

  // Step 2: Reset state for new query
  setQuery(userQuery);      // Store the query for display
  setAnswer("");            // Clear previous answer
  setError("");             // Clear previous error
  setToolDisplays([]);      // Clear previous tool calls
  setStats(null);           // Clear previous stats
  setStatus("Thinking..."); // Show initial status
  setIsRunning(true);       // Disable input

  try {
    // Step 3: Get available tools
    const tools = getTools();
    // Returns array of DynamicStructuredTool instances
    // Only includes tools whose API keys are configured

    // Step 4: Log tool availability (for debugging)
    console.log("\n" + getToolSummary() + "\n");
    // Output: "Available tools: get_price_snapshot, get_income_statements, ..."

    // Step 5: Create the agent
    const agent = Agent.create(
      { model: "gemini-2.5-flash" },  // Config object
      tools                           // Array of tools
    );
    // Agent.create() is a static factory method
    // It builds the system prompt and initializes internal state

    // Step 6: Run the agent and process events
    for await (const event of agent.run(userQuery)) {
      handleAgentEvent(event);
    }
    // agent.run() is an async generator
    // "for await...of" iterates over yielded values one at a time
    // Each iteration gives us one event

  } catch (err) {
    // Handle unexpected errors (network issues, etc.)
    const errorMessage = err instanceof Error ? err.message : String(err);
    setError(errorMessage);
    setStatus("");
  } finally {
    // Always run this, whether success or error
    setIsRunning(false);  // Re-enable input
  }
}
```

### The handleAgentEvent Function

```typescript
function handleAgentEvent(event: AgentEvent) {
  // AgentEvent is a union type - it can be many different shapes
  // We use switch on event.type to handle each case

  switch (event.type) {
    case "thinking":
      // LLM is reasoning about what to do
      // event.message contains the reasoning text
      setStatus(event.message);
      break;

    case "tool_start":
      // Agent is about to call a tool
      // event.tool: tool name (e.g., "get_price_snapshot")
      // event.args: arguments (e.g., { ticker: "AAPL" })

      // Add to display list with "running" status
      setToolDisplays((prev) => [
        ...prev,  // Keep existing entries
        {
          id: `${event.tool}-${Date.now()}`,  // Unique ID
          name: event.tool,
          args: formatArgs(event.args),        // "ticker=AAPL"
          status: "running",
        },
      ]);
      setStatus(`Calling ${event.tool}...`);
      break;

    case "tool_end":
      // Tool finished successfully
      // event.duration: how long it took in ms
      // event.result: the tool's return value (JSON string)

      // Update the matching tool's status to "done"
      setToolDisplays((prev) =>
        prev.map((t) =>
          t.status === "running" && t.name === event.tool
            ? {
                ...t,                          // Keep other fields
                status: "done" as const,       // Update status
                duration: event.duration,
                result: truncateResult(event.result),
              }
            : t  // Leave other entries unchanged
        )
      );
      setStatus("");
      break;

    case "tool_error":
      // Tool failed
      // event.error: error message

      // Update matching tool's status to "error"
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
      // Tool approaching/exceeding call limit
      // This is a WARNING, not an error - we don't stop
      if (event.warning) {
        setStatus(`Warning: ${event.warning}`);
      }
      break;

    case "context_cleared":
      // Old tool results were removed to save context space
      // event.clearedCount: how many were removed
      // event.keptCount: how many were kept
      setStatus(`Cleared ${event.clearedCount} old results from context`);
      break;

    case "answer_start":
      // Agent is about to generate the final answer
      setStatus("Writing answer...");
      break;

    case "done":
      // Agent finished!
      // event.answer: the final answer text
      // event.iterations: how many loops it took
      // event.totalTime: total time in milliseconds
      // event.tokensPerSecond: throughput metric

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
```

### The JSX Render

```tsx
return (
  <Box flexDirection="column" padding={1}>
    {/*
      Box is like a <div> with flexbox
      flexDirection="column" stacks children vertically
      padding={1} adds 1 character of padding
    */}

    <Intro />
    {/* Welcome screen with ASCII art */}

    {query && (
      <Box marginTop={1}>
        <Text color={colors.muted}>Query: </Text>
        <Text color={colors.white}>{query}</Text>
      </Box>
    )}
    {/*
      Conditional rendering: only show if query is truthy
      {condition && <Component />} renders Component if condition is true
    */}

    {toolDisplays.length > 0 && (
      <Box flexDirection="column" marginTop={1}>
        {toolDisplays.map((tool) => (
          <Box key={tool.id}>
            {/* key is required for React lists - must be unique */}
            <Text>
              {tool.status === "running" && (
                <Text color={colors.warning}>● </Text>
              )}
              {tool.status === "done" && (
                <Text color={colors.success}>✓ </Text>
              )}
              {tool.status === "error" && (
                <Text color={colors.error}>✗ </Text>
              )}
              {/* Show different icons based on status */}

              <Text color={colors.accent}>{tool.name}</Text>
              <Text color={colors.muted}>({tool.args})</Text>
              {tool.duration && (
                <Text color={colors.muted}> [{tool.duration}ms]</Text>
              )}
            </Text>
          </Box>
        ))}
      </Box>
    )}
    {/* Map over toolDisplays array to render each tool call */}

    {status && (
      <Box marginTop={1}>
        <Text color={colors.warning}>{status}</Text>
      </Box>
    )}
    {/* Show current status if not empty */}

    {error && (
      <Box marginTop={1}>
        <Text color={colors.error}>Error: {error}</Text>
      </Box>
    )}
    {/* Show error if any */}

    {answer && (
      <Box
        flexDirection="column"
        marginTop={1}
        borderStyle="round"
        borderColor={colors.primary}
        paddingX={1}
      >
        <Text color={colors.success}>{answer}</Text>
      </Box>
    )}
    {/* Show answer in a bordered box */}

    {stats && (
      <Box marginTop={1}>
        <Text color={colors.muted}>
          Completed in {stats.iterations} iteration(s), {stats.totalTime}ms
          {stats.tokensPerSecond && ` (${stats.tokensPerSecond.toFixed(1)} tok/s)`}
        </Text>
      </Box>
    )}
    {/* Show performance stats */}

    <Box marginTop={1}>
      {isRunning ? (
        <Text color={colors.muted}>Working...</Text>
      ) : (
        <Input onSubmit={handleSubmit} />
      )}
    </Box>
    {/* Show "Working..." while running, otherwise show input */}
  </Box>
);
```

---

## 4.2 The Agent: `src/agent/agent.ts`

This is the "brain" of the application - the main agent loop.

### Class Structure

```typescript
export class Agent {
  // Private fields - internal state
  private readonly model: string;
  private readonly maxIterations: number;
  private readonly tools: StructuredToolInterface[];
  private readonly toolMap: Map<string, StructuredToolInterface>;
  private readonly systemPrompt: string;
  private readonly signal?: AbortSignal;

  // Private constructor - can only be called from inside this class
  private constructor(
    config: AgentConfig,
    tools: StructuredToolInterface[],
    systemPrompt: string
  ) {
    // Initialize fields...
  }

  // Static factory method - the public way to create an Agent
  static create(config: AgentConfig = {}, tools: StructuredToolInterface[] = []): Agent {
    // Build system prompt and create instance...
  }

  // Main method - runs the agent loop
  async *run(query: string): AsyncGenerator<AgentEvent> {
    // The ReAct loop...
  }

  // Private helper methods...
}
```

### Why Private Constructor + Static Factory?

```typescript
// BAD: Public constructor allows invalid states
const agent = new Agent();  // No tools! No prompt! Will crash later!

// GOOD: Factory method ensures valid initialization
const agent = Agent.create({ model: "gemini-2.5-flash" }, tools);
// ^ Tools and prompt are built inside create()
```

### The Main Agent Loop (run method)

```typescript
async *run(query: string): AsyncGenerator<AgentEvent> {
  // async * = async generator function
  // Can use both "await" and "yield"
  // Returns an AsyncGenerator that yields AgentEvent objects

  const startTime = Date.now();
  const tokenCounter = new TokenCounter();
  const scratchpad = new Scratchpad(query);

  // Handle no-tools case (simple chat mode)
  if (this.tools.length === 0) {
    // Call LLM directly, no tools
    const { response, usage } = await this.callModel(query, false);
    tokenCounter.add(usage);
    const answer = extractTextContent(response);

    yield { type: 'answer_start' };
    yield {
      type: 'done',
      answer: answer || 'No tools available.',
      toolCalls: [],
      iterations: 1,
      totalTime: Date.now() - startTime,
      tokenUsage: tokenCounter.getUsage(),
      tokensPerSecond: tokenCounter.getTokensPerSecond(Date.now() - startTime),
    };
    return;  // Exit the generator
  }

  // Start with the user's query as the first prompt
  let currentPrompt = query;
  let iteration = 0;

  // THE MAIN LOOP
  while (iteration < this.maxIterations) {
    iteration++;

    // Step 1: Call the LLM
    const { response, usage } = await this.callModel(currentPrompt);
    tokenCounter.add(usage);

    // Step 2: Extract text content
    const responseText = extractTextContent(response);

    // Step 3: Handle "thinking" (text + tool calls)
    if (responseText?.trim() && hasToolCalls(response)) {
      scratchpad.addThinking(responseText.trim());
      yield { type: 'thinking', message: responseText.trim() };
    }

    // Step 4: Check for tool calls
    if (typeof response === 'string' || !hasToolCalls(response)) {
      // No tool calls = LLM is ready to answer

      if (!scratchpad.hasToolResults() && responseText) {
        // Case A: No tools were ever called (simple question)
        yield { type: 'answer_start' };
        yield {
          type: 'done',
          answer: responseText,
          toolCalls: [],
          iterations: iteration,
          totalTime: Date.now() - startTime,
          tokenUsage: tokenCounter.getUsage(),
          tokensPerSecond: tokenCounter.getTokensPerSecond(Date.now() - startTime),
        };
        return;
      }

      // Case B: Tools were called, generate final answer
      const fullContext = this.buildFullContextForAnswer(query, scratchpad);
      const finalPrompt = buildFinalAnswerPrompt(query, fullContext);

      yield { type: 'answer_start' };
      const { response: finalResponse, usage: finalUsage } =
        await this.callModel(finalPrompt, false);  // No tools for final answer
      tokenCounter.add(finalUsage);

      const answer = extractTextContent(finalResponse);
      yield {
        type: 'done',
        answer,
        toolCalls: scratchpad.getToolCallRecords(),
        iterations: iteration,
        totalTime: Date.now() - startTime,
        tokenUsage: tokenCounter.getUsage(),
        tokensPerSecond: tokenCounter.getTokensPerSecond(Date.now() - startTime),
      };
      return;
    }

    // Step 5: Execute tool calls
    const generator = this.executeToolCalls(response, query, scratchpad);
    let result = await generator.next();
    while (!result.done) {
      yield result.value;  // Forward events to caller
      result = await generator.next();
    }

    // Step 6: Context management
    let fullToolResults = scratchpad.getToolResults();
    const estimatedTokens = estimateTokens(this.systemPrompt + query + fullToolResults);

    if (estimatedTokens > CONTEXT_THRESHOLD) {
      const clearedCount = scratchpad.clearOldestToolResults(KEEP_TOOL_USES);
      if (clearedCount > 0) {
        yield { type: 'context_cleared', clearedCount, keptCount: KEEP_TOOL_USES };
        fullToolResults = scratchpad.getToolResults();
      }
    }

    // Step 7: Build next iteration prompt
    currentPrompt = buildIterationPrompt(
      query,
      fullToolResults,
      scratchpad.formatToolUsageForPrompt()
    );
  }

  // Max iterations reached
  yield {
    type: 'done',
    answer: `Reached maximum iterations (${this.maxIterations}).`,
    // ... other fields
  };
}
```

### Tool Execution

```typescript
private async *executeToolCalls(
  response: AIMessage,
  query: string,
  scratchpad: Scratchpad
): AsyncGenerator<ToolStartEvent | ToolEndEvent | ToolErrorEvent | ToolLimitEvent> {

  // response.tool_calls is an array of { name, args }
  for (const toolCall of response.tool_calls!) {
    const toolName = toolCall.name;
    const toolArgs = toolCall.args;

    // Execute this single tool
    yield* this.executeToolCall(toolName, toolArgs, query, scratchpad);
    // yield* forwards all events from the inner generator
  }
}

private async *executeToolCall(
  toolName: string,
  toolArgs: Record<string, unknown>,
  query: string,
  scratchpad: Scratchpad
): AsyncGenerator<...> {

  // Check limits (soft warning)
  const toolQuery = this.extractQueryFromArgs(toolArgs);
  const limitCheck = scratchpad.canCallTool(toolName, toolQuery);
  if (limitCheck.warning) {
    yield { type: 'tool_limit', tool: toolName, warning: limitCheck.warning, blocked: false };
  }

  // Emit start event
  yield { type: 'tool_start', tool: toolName, args: toolArgs };
  const startTime = Date.now();

  try {
    // Find and invoke the tool
    const tool = this.toolMap.get(toolName);
    if (!tool) throw new Error(`Tool '${toolName}' not found`);

    const rawResult = await tool.invoke(
      toolArgs,
      this.signal ? { signal: this.signal } : undefined
    );

    const result = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult);
    const duration = Date.now() - startTime;

    // Emit end event
    yield { type: 'tool_end', tool: toolName, args: toolArgs, result, duration };

    // Record in scratchpad
    scratchpad.recordToolCall(toolName, toolQuery);
    scratchpad.addToolResult(toolName, toolArgs, result);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    yield { type: 'tool_error', tool: toolName, error: errorMessage };
    scratchpad.recordToolCall(toolName, toolQuery);
    scratchpad.addToolResult(toolName, toolArgs, `Error: ${errorMessage}`);
  }
}
```

---

## 4.3 LLM Communication: `src/model/llm.ts`

This file handles all communication with the Gemini LLM.

### The callLlm Function

```typescript
export async function callLlm(
  prompt: string,
  options: CallLlmOptions = {}
): Promise<LlmResult> {

  // Destructure options with defaults
  const {
    model = 'gemini-2.5-flash',
    systemPrompt,
    tools,
    signal,
  } = options;

  const finalSystemPrompt = systemPrompt || DEFAULT_SYSTEM_PROMPT;

  // 1. Create the LLM instance
  const llm = new ChatGoogleGenerativeAI({
    model,
    apiKey: process.env.GOOGLE_API_KEY,
  });

  // 2. Optionally bind tools
  let runnable: Runnable = llm;
  if (tools && tools.length > 0 && llm.bindTools) {
    runnable = llm.bindTools(tools);
    // bindTools() wraps the LLM to understand tool calls
    // The LLM can now output tool_calls in its response
  }

  // 3. Build prompt template
  const promptTemplate = ChatPromptTemplate.fromMessages([
    ['system', finalSystemPrompt],  // System instructions
    ['user', '{prompt}'],           // User message (placeholder)
  ]);

  // 4. Chain: template → model
  const chain = promptTemplate.pipe(runnable);
  // .pipe() creates a pipeline: input → template → model → output

  // 5. Invoke with retry
  const invokeOpts = signal ? { signal } : undefined;
  const result = await withRetry(() => chain.invoke({ prompt }, invokeOpts));
  // withRetry wraps the call with exponential backoff

  // 6. Extract token usage
  const usage = extractUsage(result);

  // 7. Return appropriate type
  if (!tools && result && typeof result === 'object' && 'content' in result) {
    // No tools mode: extract just the text
    return { response: result.content, usage };
  }
  // Tools mode: return full AIMessage (preserves tool_calls)
  return { response: result as AIMessage, usage };
}
```

### Retry with Exponential Backoff

```typescript
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();  // Try the function
    } catch (e) {
      if (attempt === maxAttempts - 1) throw e;  // Last attempt, give up

      // Wait before retrying
      // 500 * 2^0 = 500ms, 500 * 2^1 = 1000ms, 500 * 2^2 = 2000ms
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
  throw new Error('Unreachable');
}
```

**Why exponential backoff?**
- If the server is overloaded, fixed waits cause everyone to retry at once
- Exponential waits spread out retries, letting the server recover

---

## 4.4 The Scratchpad: `src/agent/scratchpad.ts`

The scratchpad tracks everything the agent does during a query.

### File Format (JSONL)

```jsonl
{"type":"init","content":"What is Apple's revenue?","timestamp":"2026-03-05T12:00:00.000Z"}
{"type":"tool_result","toolName":"get_income_statements","args":{"ticker":"AAPL"},"result":{...},"timestamp":"..."}
{"type":"thinking","content":"I found the revenue data.","timestamp":"..."}
```

**Why JSONL?**
- Each line is valid JSON
- Append-only: if the app crashes, previous lines are safe
- Easy to read back line by line

### Tool Call Tracking

```typescript
canCallTool(toolName: string, query?: string): { allowed: boolean; warning?: string } {
  const currentCount = this.toolCallCounts.get(toolName) ?? 0;
  const maxCalls = this.limitConfig.maxCallsPerTool;  // Default: 3

  // Over the limit - warn but allow
  if (currentCount >= maxCalls) {
    return {
      allowed: true,  // We NEVER block, only warn
      warning: `Tool '${toolName}' has been called ${currentCount} times...`,
    };
  }

  // Check query similarity
  if (query) {
    const previousQueries = this.toolQueries.get(toolName) ?? [];
    const similarQuery = this.findSimilarQuery(query, previousQueries);
    if (similarQuery) {
      return {
        allowed: true,
        warning: `This query is very similar to a previous call...`,
      };
    }
  }

  // Approaching limit
  if (currentCount === maxCalls - 1) {
    return {
      allowed: true,
      warning: `Approaching limit for '${toolName}'...`,
    };
  }

  return { allowed: true };
}
```

### Similarity Detection

```typescript
private findSimilarQuery(newQuery: string, previousQueries: string[]): string | null {
  const newWords = this.tokenize(newQuery);
  // "What is Apple's revenue?" → Set { "what", "apple", "revenue" }

  for (const prevQuery of previousQueries) {
    const prevWords = this.tokenize(prevQuery);
    const similarity = this.calculateSimilarity(newWords, prevWords);

    if (similarity >= this.limitConfig.similarityThreshold) {  // Default: 0.7
      return prevQuery;  // Found a match!
    }
  }
  return null;
}

private calculateSimilarity(set1: Set<string>, set2: Set<string>): number {
  // Jaccard similarity: intersection / union
  const intersection = [...set1].filter((w) => set2.has(w)).length;
  const union = new Set([...set1, ...set2]).size;
  return intersection / union;
}
```

---

## 4.5 Tools: `src/tools/finance/prices.ts`

### Anatomy of a Tool

```typescript
export const getPriceSnapshot = new DynamicStructuredTool({
  // NAME: What the LLM calls to invoke this tool
  name: "get_price_snapshot",

  // DESCRIPTION: Helps the LLM decide when to use this tool
  description:
    "Get current stock price, daily change, and trading volume for a ticker symbol. " +
    "Use this for real-time price checks. " +
    "Returns: price, change, change%, volume, day high/low.",

  // SCHEMA: Defines the arguments using Zod
  schema: z.object({
    ticker: z
      .string()  // Type: string
      .describe("Stock ticker symbol in uppercase (e.g., AAPL, MSFT, GOOGL)")
      // .describe() helps the LLM understand what value to provide
  }),

  // FUNC: The actual implementation
  func: async ({ ticker }) => {
    // The function receives validated arguments
    // { ticker } is destructured from the args object

    if (!API_KEY) {
      return formatToolResult({ error: "API key not configured" }, []);
    }

    try {
      // Build API URL
      const url = `${BASE_URL}?function=GLOBAL_QUOTE&symbol=${ticker.toUpperCase()}&apikey=${API_KEY}`;

      // Make HTTP request
      const response = await fetch(url);
      const data = await response.json();

      // Handle errors
      if (data["Error Message"]) {
        return formatToolResult({ error: `Invalid ticker: ${ticker}` }, [url]);
      }

      // Extract and format data
      const quote = data["Global Quote"];
      const result = {
        ticker: quote["01. symbol"],
        price: parseFloat(quote["05. price"]),
        change: parseFloat(quote["09. change"]),
        changePercent: quote["10. change percent"],
        volume: parseInt(quote["06. volume"], 10),
        // ... more fields
      };

      // Return formatted result
      return formatToolResult(result, [url]);
      // formatToolResult wraps in { data, sources } structure

    } catch (error) {
      // Handle network errors, etc.
      return formatToolResult({ error: `Failed: ${error.message}` }, []);
    }
  },
});
```

### How Tools Get to the LLM

1. **Registration**: `registry.ts` collects all tools
2. **Binding**: `llm.bindTools(tools)` tells the LLM about available tools
3. **System Prompt**: Tool descriptions are injected into the system prompt
4. **LLM Decision**: LLM reads descriptions and decides which tool to use
5. **Tool Call**: LLM outputs `tool_calls: [{ name: "...", args: {...} }]`
6. **Execution**: Agent finds the tool by name and calls `tool.invoke(args)`
7. **Result**: Tool returns a string, agent sends it back to the LLM

---

## 4.6 Tool Registry: `src/tools/registry.ts`

### Tool Categories

```typescript
export type ToolCategory = "MARKET_DATA" | "FUNDAMENTALS" | "RESEARCH";
```

Categories help organize tools in the system prompt:
- **MARKET_DATA**: Real-time prices and quotes
- **FUNDAMENTALS**: Financial statements (income, balance, cash flow)
- **RESEARCH**: Web search and external information

### Conditional Tool Loading

```typescript
function isToolAvailable(tool: RegisteredTool): boolean {
  if (!tool.requiresApiKey) return true;  // Tool doesn't need an API key
  return !!process.env[tool.requiresApiKey];  // Check if API key is set
}

export function getToolRegistry(): RegisteredTool[] {
  return TOOL_DEFINITIONS.filter(isToolAvailable);
  // Only returns tools whose API keys are configured
}
```

This allows graceful degradation:
- If `FINANCIAL_DATASETS_API_KEY` is missing → financial tools are excluded
- If `TAVILY_API_KEY` is missing → web search shows a helpful message
- The agent still works with whatever tools ARE available

---

## 4.7 Prompts: `src/agent/prompts.ts`

### System Prompt Structure

```typescript
export function buildSystemPrompt(model: string): string {
  const toolDescriptions = buildToolDescriptions();

  return `You are QuantMind, a CLI assistant with access to financial research tools.

Current date: ${getCurrentDate()}
// ^ Injected dynamically so LLM knows today's date

## Available Tools

${toolDescriptions}
// ^ Dynamically generated from registry

## Tool Usage Policy
// ^ Rules for when to use which tool

## Behavior
// ^ Personality and approach

## Response Format
// ^ How to format answers

## Tables
// ^ Specific formatting instructions
`;
}
```

### Iteration Prompt

```typescript
export function buildIterationPrompt(
  originalQuery: string,
  fullToolResults: string,
  toolUsageStatus?: string | null
): string {
  let prompt = `Query: ${originalQuery}`;
  // Always include original query so LLM doesn't lose track

  if (fullToolResults.trim()) {
    prompt += `

Data retrieved from tool calls:
${fullToolResults}`;
  }
  // Add tool results if any

  if (toolUsageStatus) {
    prompt += `\n\n${toolUsageStatus}`;
  }
  // Add warnings about tool usage limits

  prompt += `

Continue working toward answering the query...`;
  // Instructions for what to do next

  return prompt;
}
```

---

# 5. Data Flow

## 5.1 Complete Request Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│ USER: "What is Apple's revenue for the last 3 years?"                    │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ index.tsx: handleSubmit()                                                │
│   1. Reset state                                                         │
│   2. Get tools from registry                                             │
│   3. Create Agent                                                        │
│   4. Call agent.run(query)                                               │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ agent.ts: run() - ITERATION 1                                            │
│   1. Build system prompt with tool descriptions                          │
│   2. Call Gemini with query and tools                                    │
│                                                                          │
│   Gemini Input:                                                          │
│   ┌────────────────────────────────────────────────────────────────────┐ │
│   │ System: You are QuantMind... [tool descriptions]                   │ │
│   │ User: What is Apple's revenue for the last 3 years?                │ │
│   └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│   Gemini Output:                                                         │
│   ┌────────────────────────────────────────────────────────────────────┐ │
│   │ content: "I'll look up Apple's income statements."                 │ │
│   │ tool_calls: [{                                                     │ │
│   │   name: "get_income_statements",                                   │ │
│   │   args: { ticker: "AAPL", period: "annual", limit: 3 }             │ │
│   │ }]                                                                 │ │
│   └────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ agent.ts: executeToolCall()                                              │
│   1. Yield: { type: "thinking", message: "I'll look up..." }             │
│   2. Yield: { type: "tool_start", tool: "get_income_statements", ... }   │
│   3. Call: get_income_statements.invoke({ ticker: "AAPL", ... })         │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ fundamentals.ts: get_income_statements.func()                            │
│   1. Build URL: https://alphavantage.co/query?function=INCOME_STATEMENT  │
│   2. Fetch data from Alpha Vantage                                       │
│   3. Parse JSON response                                                 │
│   4. Extract relevant fields (revenue, net income, etc.)                 │
│   5. Return: formatToolResult(data, [url])                               │
│                                                                          │
│   Result:                                                                │
│   ┌────────────────────────────────────────────────────────────────────┐ │
│   │ {                                                                  │ │
│   │   "data": {                                                        │ │
│   │     "ticker": "AAPL",                                              │ │
│   │     "statements": [                                                │ │
│   │       { "fiscalDate": "2024-09-28", "revenue": 391035000000, ... },│ │
│   │       { "fiscalDate": "2023-09-30", "revenue": 383285000000, ... },│ │
│   │       { "fiscalDate": "2022-09-24", "revenue": 394328000000, ... } │ │
│   │     ]                                                              │ │
│   │   },                                                               │ │
│   │   "sources": ["https://alphavantage.co/..."]                       │ │
│   │ }                                                                  │ │
│   └────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ agent.ts: run() continues                                                │
│   1. Yield: { type: "tool_end", result: "...", duration: 423 }           │
│   2. Save result to scratchpad                                           │
│   3. Build iteration prompt with tool results                            │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ agent.ts: run() - ITERATION 2                                            │
│   1. Call Gemini with updated prompt                                     │
│                                                                          │
│   Gemini Input:                                                          │
│   ┌────────────────────────────────────────────────────────────────────┐ │
│   │ Query: What is Apple's revenue for the last 3 years?               │ │
│   │                                                                    │ │
│   │ Data retrieved from tool calls:                                    │ │
│   │ ## get_income_statements({"ticker":"AAPL",...})                    │ │
│   │ Result: {"data":{"statements":[...]}}                              │ │
│   │                                                                    │ │
│   │ Continue working toward answering...                               │ │
│   └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│   Gemini Output:                                                         │
│   ┌────────────────────────────────────────────────────────────────────┐ │
│   │ content: "Apple's revenue for the last 3 years:                    │ │
│   │   - FY2024: $391B                                                  │ │
│   │   - FY2023: $383B                                                  │ │
│   │   - FY2022: $394B                                                  │ │
│   │   Revenue has been relatively stable around $390B."                │ │
│   │ tool_calls: []  (empty = no more tools needed)                     │ │
│   └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│   2. No tool_calls = ready to finish                                     │
│   3. Yield: { type: "answer_start" }                                     │
│   4. Yield: { type: "done", answer: "Apple's revenue...", ... }          │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ index.tsx: handleAgentEvent() receives "done" event                      │
│   1. setAnswer(event.answer)                                             │
│   2. setStats({ iterations: 2, totalTime: 1523, ... })                   │
│   3. React re-renders the UI with the answer                             │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ TERMINAL OUTPUT:                                                         │
│ ┌────────────────────────────────────────────────────────────────────┐   │
│ │ Query: What is Apple's revenue for the last 3 years?               │   │
│ │                                                                    │   │
│ │ ✓ get_income_statements(ticker=AAPL, period=annual, limit=3) [423ms]│  │
│ │                                                                    │   │
│ │ ╭────────────────────────────────────────────────────────────────╮ │   │
│ │ │ Apple's revenue for the last 3 years:                          │ │   │
│ │ │   - FY2024: $391B                                              │ │   │
│ │ │   - FY2023: $383B                                              │ │   │
│ │ │   - FY2022: $394B                                              │ │   │
│ │ │ Revenue has been relatively stable around $390B.               │ │   │
│ │ ╰────────────────────────────────────────────────────────────────╯ │   │
│ │                                                                    │   │
│ │ Completed in 2 iteration(s), 1523ms (65.2 tok/s)                   │   │
│ └────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
```

---

# 6. API Reference

## 6.1 Agent Class

```typescript
class Agent {
  static create(config?: AgentConfig, tools?: StructuredToolInterface[]): Agent;
  run(query: string): AsyncGenerator<AgentEvent>;
}

interface AgentConfig {
  model?: string;           // Default: "gemini-2.5-flash"
  modelProvider?: string;   // Default: "google"
  maxIterations?: number;   // Default: 10
  signal?: AbortSignal;     // For cancellation
}
```

## 6.2 Event Types

```typescript
type AgentEvent =
  | { type: "thinking"; message: string }
  | { type: "tool_start"; tool: string; args: Record<string, unknown> }
  | { type: "tool_end"; tool: string; args: Record<string, unknown>; result: string; duration: number }
  | { type: "tool_error"; tool: string; error: string }
  | { type: "tool_limit"; tool: string; warning?: string; blocked: boolean }
  | { type: "tool_progress"; tool: string; message: string }
  | { type: "context_cleared"; clearedCount: number; keptCount: number }
  | { type: "answer_start" }
  | { type: "done"; answer: string; toolCalls: ToolCallRecord[]; iterations: number; totalTime: number; tokenUsage?: TokenUsage; tokensPerSecond?: number };
```

## 6.3 Tool Registry Functions

```typescript
function getTools(): StructuredToolInterface[];
function getToolRegistry(): RegisteredTool[];
function buildToolDescriptions(): string;
function getToolSummary(): string;
```

## 6.4 LLM Function

```typescript
function callLlm(prompt: string, options?: CallLlmOptions): Promise<LlmResult>;

interface CallLlmOptions {
  model?: string;
  systemPrompt?: string;
  tools?: StructuredToolInterface[];
  signal?: AbortSignal;
}

interface LlmResult {
  response: AIMessage | string;
  usage?: TokenUsage;
}
```

## 6.5 Scratchpad Class

```typescript
class Scratchpad {
  constructor(query: string, limitConfig?: Partial<ToolLimitConfig>);

  addToolResult(toolName: string, args: Record<string, unknown>, result: string, llmSummary?: string): void;
  addThinking(thought: string): void;

  getToolResults(): string;
  getToolCallRecords(): ToolCallRecord[];
  getFullContexts(): ToolContext[];
  hasToolResults(): boolean;

  canCallTool(toolName: string, query?: string): { allowed: boolean; warning?: string };
  recordToolCall(toolName: string, query?: string): void;
  formatToolUsageForPrompt(): string | null;

  clearOldestToolResults(keep: number): number;
}
```

---

# 7. Glossary

| Term | Definition |
|------|------------|
| **Agent** | An AI system that can reason, use tools, and take actions to complete tasks |
| **ReAct** | "Reason + Act" - the pattern of thinking, acting, observing, and repeating |
| **Tool** | A function the LLM can request to execute |
| **Tool Call** | The LLM's request to execute a tool with specific arguments |
| **System Prompt** | Instructions given to the LLM at the start of a conversation |
| **Iteration** | One cycle of the agent loop (call LLM → maybe execute tools) |
| **Scratchpad** | The agent's memory of tool calls and results during a query |
| **Context Window** | The maximum amount of text an LLM can process at once |
| **Token** | The unit LLMs use to measure text (~4 characters) |
| **Async Generator** | A function that can yield multiple values over time (async function*) |
| **Zod** | A TypeScript library for runtime type validation |
| **LangChain** | A framework for building LLM applications |
| **Ink** | A React-based library for building terminal UIs |
| **JSONL** | JSON Lines - a format where each line is valid JSON |
| **Exponential Backoff** | Retry strategy where wait time doubles after each failure |
| **Barrel File** | An index.ts that re-exports everything from a directory |

---

# Appendix A: Environment Variables

```bash
# Required
GOOGLE_API_KEY=your_gemini_api_key
FINANCIAL_DATASETS_API_KEY=your_alpha_vantage_key

# Optional (for web search)
TAVILY_API_KEY=your_tavily_key
SERPER_API_KEY=your_serper_key
```

# Appendix B: Running the Project

```bash
# Install dependencies
bun install

# Run the app
bun run start

# Run in watch mode (auto-restart on changes)
bun run dev
```

# Appendix C: Example Queries

```
"What is Apple's stock price?"
"Show me Microsoft's revenue for the last 5 years"
"What is Tesla's debt-to-equity ratio?"
"Compare Apple and Google's profit margins"
"How much free cash flow does Amazon generate?"
"What happened in today's market?" (requires web search)
```
