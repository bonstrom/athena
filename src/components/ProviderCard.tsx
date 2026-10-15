import React, { useEffect, useState } from 'react';
import { Box, Chip, IconButton, InputAdornment, Switch, TextField, Tooltip, Typography } from '@mui/material';
import { DeleteOutline as DeleteOutlineIcon, SaveOutlined as SaveOutlinedIcon } from '@mui/icons-material';
import { useProviderStore } from '../store/ProviderStore';
import { useAuthStore } from '../store/AuthStore';
import { DEFAULT_MODELS, LlmProvider, getApiKey } from '../types/provider';
import { formatCost } from '../utils/currency';

interface ProviderCardProps {
  provider: LlmProvider;
  balanceLabel?: string;
}

const ProviderCard: React.FC<ProviderCardProps> = ({ provider, balanceLabel }) => {
  const { models, setProviderKey, updateModel } = useProviderStore();
  const currency = useAuthStore((state) => state.currency);
  const savedKey = getApiKey(provider);
  const [apiKeyInput, setApiKeyInput] = useState(savedKey);
  const providerModels = models.filter(
    (model) => model.providerId === provider.id && DEFAULT_MODELS.some((predefined) => predefined.id === model.id),
  );

  useEffect(() => {
    setApiKeyInput(savedKey);
  }, [provider.id, savedKey]);

  const handleSave = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setProviderKey(provider.id, apiKeyInput.trim());
  };

  const handleRemoveKey = (): void => {
    setProviderKey(provider.id, '');
    setApiKeyInput('');
  };

  return (
    <Box
      component="section"
      aria-labelledby={`provider-heading-${provider.id}`}
      sx={{ py: 3, borderBottom: '1px solid', borderColor: 'divider', minWidth: 0 }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        <Typography id={`provider-heading-${provider.id}`} variant="h6" component="h3">
          {provider.name}
        </Typography>
        <Chip label={savedKey ? 'Key set' : 'No key'} color={savedKey ? 'success' : 'default'} size="small" variant="outlined" />
        {balanceLabel && (
          <Typography variant="caption" color="success.main" sx={{ ml: { sm: 'auto' } }}>
            Balance: {balanceLabel}
          </Typography>
        )}
      </Box>

      <Box component="form" onSubmit={handleSave} sx={{ mb: 2 }}>
        <TextField
          label="API key"
          type="password"
          size="small"
          fullWidth
          value={apiKeyInput}
          onChange={(event): void => setApiKeyInput(event.target.value)}
          autoComplete="off"
          inputProps={{ 'aria-label': `${provider.name} API key` }}
          helperText="Stored locally with recoverable obfuscation, not encryption. Avoid saving keys on shared devices."
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <Tooltip title="Save API key">
                  <span>
                    <IconButton type="submit" size="small" aria-label={`Save ${provider.name} API key`} disabled={apiKeyInput.trim() === savedKey}>
                      <SaveOutlinedIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Remove API key">
                  <span>
                    <IconButton size="small" aria-label={`Remove ${provider.name} API key`} disabled={!savedKey} onClick={handleRemoveKey}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </InputAdornment>
            ),
          }}
        />
      </Box>

      {providerModels.map((model) => (
        <Box key={model.id} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: 1, py: 1 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography component="label" htmlFor={`model-toggle-${model.id}`} variant="body2" sx={{ overflowWrap: 'anywhere' }}>
              {model.label}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflowWrap: 'anywhere' }}>
              {`${formatCost(model.input, currency, 2)} input / ${formatCost(model.output, currency, 2)} output per 1M tokens`}
            </Typography>
          </Box>
          <Switch
            id={`model-toggle-${model.id}`}
            size="small"
            checked={model.enabled}
            onChange={(event): void => updateModel({ ...model, enabled: event.target.checked })}
            inputProps={{ 'aria-label': model.label }}
          />
        </Box>
      ))}
    </Box>
  );
};

export { ProviderCard };
