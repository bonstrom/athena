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
    id: "gpt-5.4",
    label: "GPT-5.4",
    input: 2.5,
    output: 15,
    provider: "openai",
    streaming: true,
    supportsTemperature: false,
  },
  {
    id: "gpt-5.4-mini",
    label: "GPT-5.4 Mini",
    input: 0.75,
    output: 4.5,
    provider: "openai",
    streaming: true,
    supportsTemperature: false,
  },
  {
    id: "gpt-5.4-nano",
    label: "GPT-5.4 Nano",
    input: 0.2,
    output: 1.25,
    provider: "openai",
    streaming: true,
    supportsTemperature: false,
  },
  {
    id: "deepseek-chat",
    label: "Deepseek Chat",
    input: 0.28,
    output: 0.42,
    provider: "deepseek",
    streaming: true,
    supportsTemperature: true,
  },
  {
    id: "deepseek-reasoner",
    label: "Deepseek Reasoner",
    input: 0.28,
    output: 0.42,
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
