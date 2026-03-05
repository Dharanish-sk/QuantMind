import { useState } from "react";
import { render, Box, Text } from "ink";
import { config } from "dotenv";
import { Input } from "./components/input";
import { callLlm } from "./model/llm";
import { Intro } from "./components/intro";
// Load .env file (API keys)
config({ quiet: true });

function App() {
  // State to store the LLM's response
  const [answer, setAnswer] = useState("");
  // State to show "Thinking..." while waiting
  const [loading, setLoading] = useState(false);
  // State to show errors
  const [error, setError] = useState("");

  // Handle user query submission
  async function handleSubmit(query: string) {
    setLoading(true);
    setError("");
    setAnswer("");

    try {
      const result = await callLlm(query, { systemPrompt: "You are a helpful assistant." });
      // result.response can be string or AIMessage — for simple chat, it's a string
      const text = typeof result.response === 'string' ? result.response : String(result.response);
      setAnswer(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
    <Intro />
    <Box flexDirection="column">
      {/* Header */}
      <Text color="cyan" bold>
        QuantMind - Financial Research Agent
      </Text>

      {/* Input */}
      <Input onSubmit={handleSubmit} />

      {/* Loading indicator */}
      {loading && <Text color="yellow">Thinking...</Text>}

      {/* Error display */}
      {error && <Text color="red">Error: {error}</Text>}

      {/* Answer display */}
      {answer && (
        <Box marginTop={1}>
          <Text color="green">{answer}</Text>
        </Box>
      )}
    </Box>
    </>
  );
}

const { waitUntilExit } = render(<App />);
await waitUntilExit();