import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Chip,
  Paper,
  Collapse,
  IconButton,
  Tooltip,
  Divider,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';
import { useProviderStore } from '../store/ProviderStore';
import { LlmProvider, getApiKey, encodeApiKey } from '../types/provider';

const emptyForm = (): Omit<LlmProvider, 'id'> => ({
  name: '',
  baseUrl: '',
  messageFormat: 'openai' as const,
  apiKeyEncrypted: '',
  supportsWebSearch: false,
  requiresReasoningFallback: false,
  payloadOverridesJson: '',
  isBuiltIn: false,
});

const ProvidersSettings: React.FC = () => {
  const { providers, addProvider, updateProvider, deleteProvider } = useProviderStore();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [expandedAdvanced, setExpandedAdvanced] = useState(false);
  const [jsonError, setJsonError] = useState('');

  const openEdit = (provider: LlmProvider): void => {
    setEditingId(provider.id);
    setForm({
      name: provider.name,
      baseUrl: provider.baseUrl,
      messageFormat: provider.messageFormat,
      apiKeyEncrypted: provider.apiKeyEncrypted,
      supportsWebSearch: provider.supportsWebSearch,
      requiresReasoningFallback: provider.requiresReasoningFallback,
      payloadOverridesJson: provider.payloadOverridesJson,
      isBuiltIn: provider.isBuiltIn,
    });
    setApiKeyInput('');
    setExpandedAdvanced(false);
    setJsonError('');
    setShowAddForm(false);
  };

  const openAdd = (): void => {
    setEditingId(null);
    setForm(emptyForm());
    setApiKeyInput('');
    setExpandedAdvanced(false);
    setJsonError('');
    setShowAddForm(true);
  };

  const closeForm = (): void => {
    setEditingId(null);
    setShowAddForm(false);
  };

  const validateJson = (value: string): boolean => {
    if (!value.trim()) return true;
    try {
      JSON.parse(value);
      return true;
    } catch {
      return false;
    }
  };

  const handleSave = (): void => {
    if (!validateJson(form.payloadOverridesJson)) {
      setJsonError('Invalid JSON');
      return;
    }
    const apiKeyEncrypted = apiKeyInput.trim() ? encodeApiKey(apiKeyInput.trim()) : form.apiKeyEncrypted;
    if (editingId) {
      updateProvider({ ...form, id: editingId, apiKeyEncrypted });
    } else {
      addProvider({ ...form, id: crypto.randomUUID(), apiKeyEncrypted });
    }
    closeForm();
  };

  const handleDelete = (provider: LlmProvider): void => {
    const { models } = useProviderStore.getState();
    const modelCount = models.filter((m) => m.providerId === provider.id).length;
    const msg =
      modelCount > 0
        ? `Delete provider "${provider.name}"? This will also delete ${modelCount} model(s) using it.`
        : `Delete provider "${provider.name}"?`;
    if (window.confirm(msg)) {
      deleteProvider(provider.id);
      if (editingId === provider.id) closeForm();
    }
  };

  const isFormOpen = showAddForm || editingId !== null;
  const isFormValid = form.name.trim() && form.baseUrl.trim() && validateJson(form.payloadOverridesJson);

  const ProviderRow = ({ provider }: { provider: LlmProvider }): React.ReactElement => {
    const key = getApiKey(provider);
    const hasKey = key.length > 0;
    return (
      <Box
        sx={{
          p: 1.5,
          border: '1px solid',
          borderColor: editingId === provider.id ? 'primary.main' : 'divider',
          borderRadius: 1,
          mb: 1.5,
          bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)'),
        }}
      >
        <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
          <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
            <Typography variant="body2" fontWeight="bold">
              {provider.name}
            </Typography>
            <Chip label={provider.messageFormat} size="small" variant="outlined" sx={{ fontSize: '0.65rem' }} />
            {hasKey ? (
              <Chip
                label="Key set"
                color="success"
                variant="outlined"
                size="small"
              />
            ) : (
              <Chip label="No key" color="warning" variant="outlined" size="small" />
            )}
            {provider.supportsWebSearch && <Chip label="Web Search" size="small" variant="outlined" sx={{ fontSize: '0.65rem' }} />}
          </Box>
          <Box display="flex" gap={0.5}>
            <Tooltip title="Edit">
              <IconButton size="small" onClick={(): void => openEdit(provider)}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Delete">
              <IconButton size="small" color="error" onClick={(): void => handleDelete(provider)}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
          {provider.baseUrl}
        </Typography>
      </Box>
    );
  };

  return (
    <Box>
      {providers.map((p) => (
        <Box key={p.id}>
          <ProviderRow provider={p} />
          {editingId === p.id && <ProviderForm />}
        </Box>
      ))}

      {showAddForm && <ProviderForm />}

      {!isFormOpen && (
        <Button variant="outlined" startIcon={<AddIcon />} onClick={openAdd} size="small">
          Add Provider
        </Button>
      )}
    </Box>
  );

  function ProviderForm(): React.ReactElement {
    return (
      <Paper variant="outlined" sx={{ p: 2, mb: 1.5 }}>
        <Typography variant="subtitle2" gutterBottom>
          {editingId ? 'Edit Provider' : 'New Provider'}
        </Typography>
        <TextField
          label="Name"
          size="small"
          fullWidth
          value={form.name}
          onChange={(e): void => setForm((f) => ({ ...f, name: e.target.value }))}
          sx={{ mb: 1.5 }}
        />
        <TextField
          label="Base URL"
          size="small"
          fullWidth
          value={form.baseUrl}
          onChange={(e): void => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
          helperText="e.g. https://api.openai.com/v1/chat/completions"
          sx={{ mb: 1.5 }}
        />
        <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
          <InputLabel>Message Format</InputLabel>
          <Select
            value={form.messageFormat}
            label="Message Format"
            onChange={(e): void => setForm((f) => ({ ...f, messageFormat: e.target.value as 'openai' | 'anthropic' }))}
          >
            <MenuItem value="openai">OpenAI (compatible with most providers)</MenuItem>
            <MenuItem value="anthropic">Anthropic (Claude, MiniMax)</MenuItem>
          </Select>
        </FormControl>
        <TextField
          label={editingId ? 'API Key (leave blank to keep current)' : 'API Key'}
          type="password"
          size="small"
          fullWidth
          value={apiKeyInput}
          onChange={(e): void => setApiKeyInput(e.target.value)}
          sx={{ mb: 1.5 }}
        />

        {/* Advanced */}
        <Box sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer', mb: 0.5 }} onClick={(): void => setExpandedAdvanced((v) => !v)}>
          <Typography variant="caption" color="text.secondary" fontWeight="bold">
            ADVANCED
          </Typography>
          {expandedAdvanced ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </Box>
        <Collapse in={expandedAdvanced}>
          <Box sx={{ pl: 1, borderLeft: '2px solid', borderColor: 'divider', mb: 1.5 }}>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={form.supportsWebSearch}
                  onChange={(e): void => setForm((f) => ({ ...f, supportsWebSearch: e.target.checked }))}
                />
              }
              label={<Typography variant="caption">Supports $web_search builtin (Moonshot-style)</Typography>}
            />
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={form.requiresReasoningFallback}
                  onChange={(e): void => setForm((f) => ({ ...f, requiresReasoningFallback: e.target.checked }))}
                />
              }
              label={<Typography variant="caption">Requires reasoning_content fallback in assistant messages</Typography>}
            />
            <TextField
              label="Payload Overrides (JSON)"
              size="small"
              fullWidth
              multiline
              minRows={2}
              value={form.payloadOverridesJson}
              onChange={(e): void => {
                setForm((f) => ({ ...f, payloadOverridesJson: e.target.value }));
                setJsonError(validateJson(e.target.value) ? '' : 'Invalid JSON');
              }}
              error={!!jsonError}
              helperText={jsonError || 'Extra fields merged into every request payload. e.g. {"max_tokens": 4096}'}
              sx={{ mt: 1 }}
            />
          </Box>
        </Collapse>

        <Divider sx={{ mb: 1.5 }} />
        <Box display="flex" justifyContent="flex-end" gap={1}>
          <Button size="small" onClick={closeForm}>
            Cancel
          </Button>
          <Button size="small" variant="contained" disabled={!isFormValid} onClick={handleSave}>
            {editingId ? 'Save Changes' : 'Add Provider'}
          </Button>
        </Box>
      </Paper>
    );
  }
};

export default ProvidersSettings;
