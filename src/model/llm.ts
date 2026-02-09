import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatPromptTemplate } from "@langchain/core/prompts";

export async function callLlm(prompt: string, systemPrompt: string) {
  // Guard: don't send empty prompts
  if (!prompt.trim()) {
    throw new Error("Empty user input");
  }

  // 1. Create the model
  const model = new ChatGoogleGenerativeAI({
    model: "gemini-2.5-flash",
    apiKey: process.env.GOOGLE_API_KEY,
  });

  // 2. Create prompt template with system + user messages
  
  const promptTemplate = ChatPromptTemplate.fromMessages([
    ["system", systemPrompt],
    ["user", "{prompt}"],
  ]);

  // 3. Chain: template -> model
  const chain = promptTemplate.pipe(model);

  // 4. Invoke with the variable name matching the template
  //    Template has {prompt}, so the key must be "prompt"
  const response = await chain.invoke({ prompt });

  // 5. Return just the text content, not the whole AIMessage object
  return typeof response.content === "string"
    ? response.content
    : String(response.content);
}