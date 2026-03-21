import React from "react";
import { FormControl, InputLabel, MenuItem, Select, Box, Typography } from "@mui/material";
import { useAuthStore } from "../store/AuthStore";

const USD_TO_SEK = 10;

export interface ChatModel {
  id: string;
  label: string;
  input: number;
  output: number;
  provider: "openai" | "deepseek";
  streaming: boolean;
  supportsTemperature: boolean;
}

export const chatModels: ChatModel[] = [
  {
    id: "gpt-5",
    label: "GPT-5",
    input: 1.25,
    output: 10,
    provider: "openai",
    streaming: true,
    supportsTemperature: false,
  },
  {
    id: "gpt-5-mini",
    label: "GPT-5 Mini",
    input: 0.25,
    output: 2,
    provider: "openai",
    streaming: true,
    supportsTemperature: false,
  },
  {
    id: "gpt-5-nano",
    label: "GPT-5 Nano",
    input: 0.05,
    output: 0.4,
    provider: "openai",
    streaming: true,
    supportsTemperature: false,
  },
  {
    id: "o3",
    label: "GPT-o3",
    input: 2,
    output: 8,
    provider: "openai",
    streaming: true,
    supportsTemperature: false,
  },
  {
    id: "deepseek-chat",
    label: "Deepseek Chat",
    input: 0.27,
    output: 1.1,
    provider: "deepseek",
    streaming: true,
    supportsTemperature: true,
  },
  {
    id: "deepseek-reasoner",
    label: "Deepseek R",
    input: 0.55,
    output: 2.19,
    provider: "deepseek",
    streaming: true,
    supportsTemperature: true,
  },
];

export function calculateCostUSD(model: ChatModel, prompt: number, completion: number): number {
  return (prompt / 1_000_000) * model.input + (completion / 1_000_000) * model.output;
}

export function calculateCostSEK(model: ChatModel, prompt: number, completion: number): number {
  return calculateCostUSD(model, prompt, completion) * USD_TO_SEK;
}

interface Props {
  selectedModel: ChatModel;
  onChange: (model: ChatModel) => void;
}

const ModelSelector: React.FC<Props> = ({ selectedModel, onChange }) => {
  const { openAiKey, deepSeekKey } = useAuthStore();

  const availableModels = chatModels.filter(
    (model) => (model.provider === "openai" && openAiKey) || (model.provider === "deepseek" && deepSeekKey),
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
  const { openAiKey, deepSeekKey } = useAuthStore.getState();
  const available = chatModels.filter(
    (m) => (m.provider === "openai" && openAiKey) || (m.provider === "deepseek" && deepSeekKey),
  );
  return available[0] ?? chatModels[0];
}

export function getDefaultTopicNameModel(): ChatModel {
  const { openAiKey, deepSeekKey } = useAuthStore.getState();
  const available = chatModels.filter(
    (m) => (m.provider === "openai" && openAiKey) || (m.provider === "deepseek" && deepSeekKey),
  );
  return available.find((m) => m.id.includes("nano")) ?? chatModels[0];
}
