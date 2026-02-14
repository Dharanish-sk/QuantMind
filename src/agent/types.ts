/**
 * =========================
 * Agent configuration
 * =========================
 *
 * This interface defines ALL the knobs that control
 * how an agent runs, without changing agent logic.
 *
 * Think of this as:
 *  - runtime settings
 *  - safety limits
 *  - environment control
 *
 * The agent engine reads this config and adjusts its behavior.
 */
export interface AgentConfig {
  /**
   * The LLM model name to use.
   * Example:
   *  - "gpt-5.2"
   *  - "claude-sonnet-4-20250514"
   *
   * Keeping this here allows:
   *  - model swapping without code changes
   *  - A/B testing models
   *  - environment-based configs (dev vs prod)
   */
  model?: string;

  /**
   * Which provider serves the model.
   * This decouples the agent from a single vendor.
   *
   * Examples:
   *  - "openai"
   *  - "anthropic"
   *  - "google"
   *  - "ollama"
   *
   * The agent can route requests based on this.
   */
  modelProvider?: string;

  /**
   * Maximum number of reasoning / tool-use loops
   * the agent is allowed to perform.
   *
   * Why this exists:
   *  - prevents infinite loops
   *  - controls cost
   *  - bounds latency
   *
   * Typical agent flow:
   *  think → tool → think → tool → answer
   */
  maxIterations?: number;

  /**
   * AbortSignal used to cancel agent execution.
   *
   * Very important for:
   *  - user cancellation (Ctrl+C, Stop button)
   *  - timeouts
   *  - UI navigation changes
   *
   * The agent should periodically check this signal
   * and stop gracefully if aborted.
   */
  signal?: AbortSignal;
}

/**
 * =========================
 * Message (conversation memory)
 * =========================
 *
 * Represents ONE message in the agent’s internal history.
 * This history is passed back to the LLM on each step.
 */
export interface Message {
  /**
   * Who produced the message:
   *  - user: original user input
   *  - assistant: LLM reasoning / answers
   *  - tool: output returned by a tool call
   */
  role: 'user' | 'assistant' | 'tool';

  /**
   * Plain text content of the message.
   * Tools stringify their output before storing it here.
   */
  content: string;
}

// ============================================================================
// Agent Events (real-time streaming + observability)
// ============================================================================
//
// These interfaces define EVENTS emitted while the agent runs.
// The agent does NOT just return a final answer.
// Instead, it streams progress updates as events.
//
// This enables:
//  - live UIs (CLI / web)
//  - debugging
//  - performance tracking
//  - transparency into agent behavior
//

/**
 * Emitted when the agent is reasoning / deciding next steps.
 * This is usually triggered before an LLM call.
 */
export interface ThinkingEvent {
  type: 'thinking';

  /**
   * Human-readable message explaining
   * what the agent is currently thinking about.
   *
   * Example:
   *  "Deciding which tool to call next"
   */
  message: string;
}

/**
 * Emitted immediately before a tool is executed.
 * Allows UI to show which tool is running.
 */
export interface ToolStartEvent {
  type: 'tool_start';

  /** Name of the tool being executed */
  tool: string;

  /** Arguments passed to the tool */
  args: Record<string, unknown>;
}

/**
 * Emitted when a tool finishes successfully.
 * Contains timing + result for observability.
 */
export interface ToolEndEvent {
  type: 'tool_end';

  /** Tool name */
  tool: string;

  /** Arguments used */
  args: Record<string, unknown>;

  /** Tool result (stringified) */
  result: string;

  /** Execution time in milliseconds */
  duration: number;
}

/**
 * Emitted when a tool execution fails.
 * This does NOT crash the agent automatically.
 * The agent can decide how to recover.
 */
export interface ToolErrorEvent {
  type: 'tool_error';

  /** Tool that failed */
  tool: string;

  /** Error message */
  error: string;
}

/**
 * Emitted during long-running tool execution.
 * Useful for streaming progress updates.
 */
export interface ToolProgressEvent {
  type: 'tool_progress';

  /** Tool emitting progress */
  tool: string;

  /** Progress message (e.g., "Fetched page 3/10") */
  message: string;
}

/**
 * Emitted when a tool is approaching or exceeding
 * recommended usage limits.
 *
 * IMPORTANT:
 *  - This is a warning, not a hard block.
 *  - The agent remains autonomous.
 */
export interface ToolLimitEvent {
  type: 'tool_limit';

  /** Tool name */
  tool: string;

  /** Optional warning message */
  warning?: string;

  /**
   * Whether the tool call was blocked.
   * Always false in this design.
   * We warn, but never hard-stop tools.
   */
  blocked: boolean;
}

/**
 * Emitted when agent context is trimmed
 * due to token limits.
 *
 * Common in Anthropic-style sliding context windows.
 */
export interface ContextClearedEvent {
  type: 'context_cleared';

  /** Number of old tool results removed */
  clearedCount: number;

  /** Number of recent tool results preserved */
  keptCount: number;
}

/**
 * Emitted when the agent stops tool usage
 * and begins generating the final answer.
 */
export interface AnswerStartEvent {
  type: 'answer_start';
}

/**
 * Token usage statistics for a full agent run.
 * Useful for cost estimation and performance tracking.
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * Final event emitted when the agent completes.
 * This is the terminal event in the agent lifecycle.
 */
export interface DoneEvent {
  type: 'done';

  /** Final answer returned to the user */
  answer: string;

  /**
   * Summary of all tool calls made during execution.
   * Useful for debugging and auditing.
   */
  toolCalls: Array<{
    tool: string;
    args: Record<string, unknown>;
    result: string;
  }>;

  /** Number of agent iterations used */
  iterations: number;

  /** Total execution time in milliseconds */
  totalTime: number;

  /** Optional token usage stats */
  tokenUsage?: TokenUsage;

  /** Optional throughput metric */
  tokensPerSecond?: number;
}

/**
 * =========================
 * AgentEvent (union type)
 * =========================
 *
 * This union represents EVERY possible event
 * the agent can emit during execution.
 *
 * Consumers (UI, logs, analytics) can switch
 * on `event.type` to react appropriately.
 */
export type AgentEvent =
  | ThinkingEvent
  | ToolStartEvent
  | ToolProgressEvent
  | ToolEndEvent
  | ToolErrorEvent
  | ToolLimitEvent
  | ContextClearedEvent
  | AnswerStartEvent
  | DoneEvent;
