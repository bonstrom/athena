const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";

export async function sendDeepSeekChat(
  messages: { role: string; content: string }[],
  model: string,
  key: string,
): Promise<{
  content: string;
  promptTokens: number;
  completionTokens: number;
  aiNote: string;
}> {
  const response = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 1.3,
    }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  interface DeepSeekResponse {
    choices: { message: { content: string } }[];
    usage: { prompt_tokens: number; completion_tokens: number };
  }

  const data = (await response.json()) as DeepSeekResponse;

  const rawContent = data.choices[0].message.content.trim();

  const match = /<!--\s*persist:\s*(.*?)\s*-->/i.exec(rawContent);
  const strippedContent = rawContent.replace(/<!--\s*persist:\s*(.*?)\s*-->/i, "").trim();

  return {
    content: strippedContent,
    promptTokens: data.usage.prompt_tokens,
    completionTokens: data.usage.completion_tokens,
    aiNote: match?.[1]?.trim() ?? "",
  };
}
