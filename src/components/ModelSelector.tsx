import React from "react";
import { FormControl, InputLabel, MenuItem, Select, Box, Typography } from "@mui/material";
import { useAuthStore } from "../store/AuthStore";

export const USD_TO_SEK = 10;

export interface ChatModel {
  id: string;
  label: string;
  input: number;
  cachedInput: number;
  output: number;
  provider: "openai" | "deepseek" | "google" | "moonshot";
  streaming: boolean;
  supportsTemperature: boolean;
}

export const chatModels: ChatModel[] = [
  {
    id: "gpt-5.4",
    label: "GPT-5.4",
    input: 2.5,
    cachedInput: 0.25,
    output: 15,
    provider: "openai",
    streaming: true,
    supportsTemperature: false,
  },
  {
    id: "gpt-5.4-mini",
    label: "GPT-5.4 Mini",
    input: 0.75,
    cachedInput: 0.075,
    output: 4.5,
    provider: "openai",
    streaming: true,
    supportsTemperature: false,
  },
  {
    id: "gpt-5.4-nano",
    label: "GPT-5.4 Nano",
    input: 0.2,
    cachedInput: 0.02,
    output: 1.25,
    provider: "openai",
    streaming: true,
    supportsTemperature: false,
  },
  {
    id: "deepseek-chat",
    label: "Deepseek Chat",
    input: 0.28,
    cachedInput: 0.028,
    output: 0.42,
    provider: "deepseek",
    streaming: true,
    supportsTemperature: true,
  },
  {
    id: "deepseek-reasoner",
    label: "Deepseek Reasoner",
    input: 0.28,
    cachedInput: 0.028,
    output: 0.42,
    provider: "deepseek",
    streaming: true,
    supportsTemperature: true,
  },
  {
    id: "gemini-3-flash-preview",
    label: "Gemini 3 Flash Preview",
    input: 0.5,
    cachedInput: 0.05,
    output: 3,
    provider: "google",
    streaming: true,
    supportsTemperature: true,
  },
  {
    id: "kimi-k2.5",
    label: "Kimi 2.5",
    input: 0.6,
    cachedInput: 0.1,
    output: 3,
    provider: "moonshot",
    streaming: true,
    supportsTemperature: true,
  },
];

export function calculateCostUSD(
  model: ChatModel,
  prompt: number,
  completion: number,
  promptDetails?: { cached_tokens?: number },
): number {
  const cachedTokens = promptDetails?.cached_tokens ?? 0;
  const regularPromptTokens = Math.max(0, prompt - cachedTokens);

  return (
    (regularPromptTokens / 1_000_000) * model.input +
    (cachedTokens / 1_000_000) * model.cachedInput +
    (completion / 1_000_000) * model.output
  );
}

export function calculateCostSEK(
  model: ChatModel,
  prompt: number,
  completion: number,
  promptDetails?: { cached_tokens?: number },
): number {
  return calculateCostUSD(model, prompt, completion, promptDetails) * USD_TO_SEK;
}

interface Props {
  selectedModel: ChatModel;
  onChange: (model: ChatModel) => void;
}

const ModelSelector: React.FC<Props> = ({ selectedModel, onChange }) => {
  const { openAiKey, deepSeekKey, googleApiKey, moonshotApiKey } = useAuthStore();

  const availableModels = chatModels.filter(
    (model) =>
      (model.provider === "openai" && openAiKey) ||
      (model.provider === "deepseek" && deepSeekKey) ||
      (model.provider === "google" && googleApiKey) ||
      (model.provider === "moonshot" && moonshotApiKey),
  );

  if (availableModels.length === 0) {
    return (
      <Typography
        color="text.secondary"
        variant="body2"
        mt={2}>
        No models available. Please add an API key in the settings.
      </Typography>
    );
  }

  return (
    <FormControl
      fullWidth
      variant="outlined"
      size="small">
      <InputLabel>Model</InputLabel>
      <Select
        value={selectedModel.id}
        onChange={(e): void => {
          const selected = chatModels.find((m) => m.id === e.target.value);
          if (selected) onChange(selected);
        }}
        label="Model">
        {availableModels.map((m) => (
          <MenuItem
            key={m.id}
            value={m.id}>
            <Box
              display="flex"
              justifyContent="space-between"
              width="100%"
              alignItems="center">
              <Typography>{m.label}</Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                ml={2}
                whiteSpace="nowrap">
                {`${(m.input * USD_TO_SEK).toFixed(0)}kr | ${(m.output * USD_TO_SEK).toFixed(0)}kr / 1M`}
              </Typography>
            </Box>
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
};

export default ModelSelector;

export function getDefaultModel(): ChatModel {
  const savedModelId = localStorage.getItem("athena_selected_model");
  if (savedModelId) {
    const savedModel = chatModels.find((m) => m.id === savedModelId);
    if (savedModel) return savedModel;
  }

  const { openAiKey, deepSeekKey, googleApiKey, moonshotApiKey } = useAuthStore.getState();
  const available = chatModels.filter(
    (m) =>
      (m.provider === "openai" && openAiKey) ||
      (m.provider === "deepseek" && deepSeekKey) ||
      (m.provider === "google" && googleApiKey) ||
      (m.provider === "moonshot" && moonshotApiKey),
  );
  return available[0] ?? chatModels[0];
}

export function getDefaultTopicNameModel(): ChatModel {
  const { openAiKey, deepSeekKey, googleApiKey, moonshotApiKey } = useAuthStore.getState();
  const available = chatModels.filter(
    (m) =>
      (m.provider === "openai" && openAiKey) ||
      (m.provider === "deepseek" && deepSeekKey) ||
      (m.provider === "google" && googleApiKey) ||
      (m.provider === "moonshot" && moonshotApiKey),
  );
  return available.find((m) => m.id.includes("nano") || m.id.includes("flash")) ?? chatModels[0];
}
