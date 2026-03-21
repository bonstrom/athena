const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

export async function sendOpenAiChat(
  messages: { role: string; content: string }[],
  model: string,
  key: string,
): Promise<{
  content: string;
  promptTokens: number;
  completionTokens: number;
}> {
  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages
    }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  interface OpenAiResponse {
    choices: { message: { content: string } }[];
    usage: { prompt_tokens: number; completion_tokens: number };
  }

  const data = (await response.json()) as OpenAiResponse;

  return {
    content: data.choices[0].message.content.trim(),
    promptTokens: data.usage.prompt_tokens,
    completionTokens: data.usage.completion_tokens,
  };
}
