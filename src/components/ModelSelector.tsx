import React from 'react';
import { FormControl, InputLabel, MenuItem, Select, Box, Tooltip, Typography } from '@mui/material';
import WhatshotIcon from '@mui/icons-material/Whatshot';
import { useProviderStore } from '../store/ProviderStore';
import { UserChatModel } from '../types/provider';
import { DEEPSEEK_PEAK_HOURS_UTC, DEEPSEEK_PEAK_MULTIPLIER } from '../constants';
import { formatCost } from '../utils/currency';
import { useAuthStore } from '../store/AuthStore';

export type ChatModel = UserChatModel;

function resolveModelFromSavedId(savedModelId: string | null, models: ChatModel[]): ChatModel | undefined {
  if (!savedModelId) return undefined;
  return models.find((m) => m.id === savedModelId) ?? models.find((m) => m.apiModelId === savedModelId);
}

export function isDeepSeekPeakHours(): boolean {
  const utcHour = new Date().getUTCHours();
  return DEEPSEEK_PEAK_HOURS_UTC.some((r) => utcHour >= r.start && utcHour < r.end);
}

export function getPeakMultiplier(model: ChatModel): number {
  if (model.providerId === 'builtin-deepseek' && isDeepSeekPeakHours()) {
    return DEEPSEEK_PEAK_MULTIPLIER;
  }
  return 1;
}

export function calculateCostUSD(
  model: ChatModel,
  prompt: number,
  completion: number,
  promptDetails?: { cached_tokens?: number; cache_creation_tokens?: number },
  peakMultiplier?: number,
): number {
  const cachedTokens = promptDetails?.cached_tokens ?? 0;
  const cacheCreationTokens = promptDetails?.cache_creation_tokens ?? 0;
  const regularPromptTokens = Math.max(0, prompt - cachedTokens - cacheCreationTokens);
  const multiplier = peakMultiplier ?? 1;
  return (
    (regularPromptTokens / 1_000_000) * model.input * multiplier +
    (cachedTokens / 1_000_000) * model.cachedInput * multiplier +
    (cacheCreationTokens / 1_000_000) * model.input * 1.25 * multiplier +
    (completion / 1_000_000) * model.output * multiplier
  );
}

interface Props {
  selectedModel: ChatModel;
  onChange: (model: ChatModel) => void;
}

const ModelSelector: React.FC<Props> = ({ selectedModel, onChange }) => {
  const sortedModels = useSortedAvailableModels();
  const { models, providers } = useProviderStore();
  const currency = useAuthStore((s) => s.currency);

  const selectedStillAvailable = sortedModels.some((m) => m.id === selectedModel.id);
  const selectValue = selectedStillAvailable ? selectedModel.id : '';

  React.useEffect(() => {
    if (!selectedStillAvailable && sortedModels.length > 0) {
      onChange(sortedModels[0]);
    }
  }, [selectedStillAvailable, sortedModels, onChange]);

  if (sortedModels.length === 0) {
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
        value={selectValue}
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
        {sortedModels.map((m) => {
          const provider = providers.find((p) => p.id === m.providerId);
          return (
            <MenuItem key={m.id} value={m.id}>
              <Box display="flex" justifyContent="space-between" width="100%" alignItems="center" gap={2}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="caption" color="primary" sx={{ display: 'block', fontSize: '0.65rem', lineHeight: 1, mb: 0.5 }}>
                    {provider?.name.toUpperCase()}
                  </Typography>
                  <Typography sx={{ lineHeight: 1.2 }}>{m.label}</Typography>
                </Box>
                <Box display="flex" alignItems="center" gap={0.5} flexShrink={0} whiteSpace="nowrap">
                  {isDeepSeekPeakHours() && m.providerId === 'builtin-deepseek' && (
                    <Tooltip title="DeepSeek peak hours — 2x pricing">
                      <WhatshotIcon sx={{ fontSize: 14, color: 'warning.main', display: 'flex' }} />
                    </Tooltip>
                  )}
                  <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1 }}>
                    {`${formatCost(m.input, currency, 0)} | ${formatCost(m.output, currency, 0)} / 1M`}
                  </Typography>
                </Box>
              </Box>
            </MenuItem>
          );
        })}
      </Select>
    </FormControl>
  );
};

export default ModelSelector;

export function useSortedAvailableModels(): ChatModel[] {
  const { getAvailableModels } = useProviderStore();
  return getAvailableModels();
}

export function getDefaultModel(): ChatModel {
  const { models } = useProviderStore.getState();
  const available = getAvailableModels();
  const availableIds = new Set(available.map((m) => m.id));
  const savedModelId = localStorage.getItem('athena_selected_model');
  const saved = resolveModelFromSavedId(savedModelId, models);

  if (saved && availableIds.has(saved.id)) {
    return saved;
  }

  const fallback: ChatModel = available[0] ?? models[0];
  localStorage.setItem('athena_selected_model', fallback.id);
  return fallback;
}

export function getDefaultTopicNameModel(): ChatModel {
  const available = getAvailableModels();
  const { models } = useProviderStore.getState();
  const bestModel = available.find((m) => m.apiModelId.includes('nano') || m.apiModelId.includes('flash'));
  return bestModel ?? (available.length > 0 ? available[0] : models[0]);
}

export function getQuestionGenModel(): ChatModel {
  const available = getAvailableModels();
  if (available.length === 0) {
    return getDefaultModel();
  }
  const fastModel = available.find(
    (m) => m.apiModelId.includes('flash') || m.apiModelId.includes('nano'),
  );
  return fastModel ?? getDefaultModel();
}

/** Returns all models whose provider has a configured API key, sorted by provider and name. */
export function getAvailableModels(): ChatModel[] {
  return useProviderStore.getState().getAvailableModels();
}

/** Look up a model by its API model ID string (e.g. "gpt-5.4-nano").
 * Falls back to displaying the raw ID if not found (handles historical messages). */
export function getModelByApiId(apiModelId: string): ChatModel | undefined {
  return useProviderStore.getState().models.find((m) => m.apiModelId === apiModelId);
}
