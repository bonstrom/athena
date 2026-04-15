import React from 'react';
import { FormControl, InputLabel, MenuItem, Select, Box, Typography } from '@mui/material';
import { useProviderStore } from '../store/ProviderStore';
import { UserChatModel } from '../types/provider';
import { USD_TO_SEK } from '../constants';

// Re-export UserChatModel as ChatModel for backward compatibility with consumers
export type ChatModel = UserChatModel;
export type { ProviderId } from '../services/llmService';

export function calculateCostUSD(model: ChatModel, prompt: number, completion: number, promptDetails?: { cached_tokens?: number }): number {
  const cachedTokens = promptDetails?.cached_tokens ?? 0;
  const regularPromptTokens = Math.max(0, prompt - cachedTokens);
  return (regularPromptTokens / 1_000_000) * model.input + (cachedTokens / 1_000_000) * model.cachedInput + (completion / 1_000_000) * model.output;
}

export function calculateCostSEK(model: ChatModel, prompt: number, completion: number, promptDetails?: { cached_tokens?: number }): number {
  return calculateCostUSD(model, prompt, completion, promptDetails) * USD_TO_SEK;
}

interface Props {
  selectedModel: ChatModel;
  onChange: (model: ChatModel) => void;
}

const ModelSelector: React.FC<Props> = ({ selectedModel, onChange }) => {
  const { getAvailableModels, models } = useProviderStore();
  const availableModels = getAvailableModels();

  if (availableModels.length === 0) {
    return (
      <Typography color="text.secondary" variant="body2" mt={2}>
        No models available. Please add a provider API key in the settings.
      </Typography>
    );
  }

  return (
    <FormControl fullWidth variant="outlined" size="small">
      <InputLabel>Model</InputLabel>
      <Select
        value={selectedModel.id}
        onChange={(e): void => {
          const selected = models.find((m) => m.id === e.target.value);
          if (selected) onChange(selected);
        }}
        label="Model"
        renderValue={(selected): React.ReactNode => {
          const model = models.find((m) => m.id === selected);
          return model ? model.label : selected;
        }}
      >
        {availableModels.map((m) => (
          <MenuItem key={m.id} value={m.id}>
            <Box display="flex" justifyContent="space-between" width="100%" alignItems="center">
              <Typography>{m.label}</Typography>
              <Typography variant="caption" color="text.secondary" ml={2} whiteSpace="nowrap">
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
  const { models, getAvailableModels } = useProviderStore.getState();
  const savedModelId = localStorage.getItem('athena_selected_model');
  if (savedModelId) {
    // Try by internal ID first, then by apiModelId for backward compat
    const saved = models.find((m) => m.id === savedModelId) ?? models.find((m) => m.apiModelId === savedModelId);
    if (saved) return saved;
  }
  const available = getAvailableModels();
  return available[0] ?? models[0];
}

export function getDefaultTopicNameModel(): ChatModel {
  const { getAvailableModels, models } = useProviderStore.getState();
  const available = getAvailableModels();
  const bestModel = available.find((m) => m.apiModelId.includes('nano') || m.apiModelId.includes('flash'));
  return bestModel ?? (available.length > 0 ? available[0] : models[0]);
}

/** Returns all models whose provider has a configured API key. */
export function getAvailableModels(): ChatModel[] {
  return useProviderStore.getState().getAvailableModels();
}

/** Look up a model by its API model ID string (e.g. "gpt-5.4-nano").
 * Falls back to displaying the raw ID if not found (handles historical messages). */
export function getModelByApiId(apiModelId: string): ChatModel | undefined {
  return useProviderStore.getState().models.find((m) => m.apiModelId === apiModelId);
}
