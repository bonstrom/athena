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
  Settings as SettingsIcon,
} from '@mui/icons-material';
import { useProviderStore } from '../store/ProviderStore';
import { LlmProvider, UserChatModel, getApiKey, encodeApiKey } from '../types/provider';
import { USD_TO_SEK } from '../constants';

// ── Provider form helpers ─────────────────────────────────────────────────────

const emptyProviderForm = (): Omit<LlmProvider, 'id'> => ({
  name: '',
  baseUrl: '',
  messageFormat: 'openai' as const,
  apiKeyEncrypted: '',
  supportsWebSearch: false,
  requiresReasoningFallback: false,
  payloadOverridesJson: '',
  isBuiltIn: false,
});

const emptyModelForm = (providerId: string): Omit<UserChatModel, 'id'> => ({
  label: '',
  apiModelId: '',
  providerId,
  input: 0,
  cachedInput: 0,
  output: 0,
  streaming: true,
  supportsTemperature: true,
  supportsTools: true,
  supportsVision: false,
  supportsFiles: false,
  contextWindow: 128_000,
  forceTemperature: null,
  enforceAlternatingRoles: false,
  maxTokensOverride: null,
  isBuiltIn: false,
  enabled: true,
  thinkingParseMode: 'api-native',
  thinkingOpenTag: '<think>',
  thinkingCloseTag: '</think>',
});

// ── Model inline form ─────────────────────────────────────────────────────────

interface ModelFormProps {
  providerId: string;
  model?: UserChatModel;
  onClose: () => void;
}

const ModelForm: React.FC<ModelFormProps> = ({ providerId, model, onClose }) => {
  const { addModel, updateModel } = useProviderStore();
  const [form, setForm] = useState<Omit<UserChatModel, 'id'>>(
    model
      ? {
          ...model,
          thinkingParseMode: model.thinkingParseMode ?? 'api-native',
          thinkingOpenTag: model.thinkingOpenTag ?? '<think>',
          thinkingCloseTag: model.thinkingCloseTag ?? '</think>',
        }
      : emptyModelForm(providerId),
  );
  const [expandedAdvanced, setExpandedAdvanced] = useState(false);
  const [forceTempInput, setForceTempInput] = useState(model?.forceTemperature != null ? String(model.forceTemperature) : '');
  const [maxTokensInput, setMaxTokensInput] = useState(model?.maxTokensOverride != null ? String(model.maxTokensOverride) : '');

  const isValid = form.label.trim() && form.apiModelId.trim();

  const handleSave = (): void => {
    const finalModel: Omit<UserChatModel, 'id'> = {
      ...form,
      forceTemperature: forceTempInput.trim() ? parseFloat(forceTempInput) : null,
      maxTokensOverride: maxTokensInput.trim() ? parseInt(maxTokensInput, 10) : null,
    };
    if (model) {
      updateModel({ ...finalModel, id: model.id });
    } else {
      addModel({ ...finalModel, id: crypto.randomUUID() });
    }
    onClose();
  };

  return (
    <Paper variant="outlined" sx={{ p: 2, mt: 1 }}>
      <Typography variant="subtitle2" gutterBottom>
        {model ? 'Edit Model' : 'Add Model'}
      </Typography>
      <Box display="grid" gridTemplateColumns="1fr 1fr" gap={1.5} sx={{ mb: 1.5 }}>
        <TextField
          label="Display Label"
          size="small"
          fullWidth
          value={form.label}
          onChange={(e): void => setForm((f) => ({ ...f, label: e.target.value }))}
        />
        <TextField
          label="API Model ID"
          size="small"
          fullWidth
          value={form.apiModelId}
          onChange={(e): void => setForm((f) => ({ ...f, apiModelId: e.target.value }))}
          helperText="Sent to the API, e.g. gpt-4o"
        />
      </Box>

      <Box display="grid" gridTemplateColumns="1fr 1fr 1fr" gap={1.5} sx={{ mb: 1.5 }}>
        <TextField
          label="Input (USD/1M)"
          size="small"
          type="number"
          value={form.input}
          onChange={(e): void => setForm((f) => ({ ...f, input: parseFloat(e.target.value) || 0 }))}
        />
        <TextField
          label="Cached In (USD/1M)"
          size="small"
          type="number"
          value={form.cachedInput}
          onChange={(e): void => setForm((f) => ({ ...f, cachedInput: parseFloat(e.target.value) || 0 }))}
        />
        <TextField
          label="Output (USD/1M)"
          size="small"
          type="number"
          value={form.output}
          onChange={(e): void => setForm((f) => ({ ...f, output: parseFloat(e.target.value) || 0 }))}
        />
      </Box>

      <TextField
        label="Context Window (tokens)"
        size="small"
        type="number"
        fullWidth
        value={form.contextWindow}
        onChange={(e): void => setForm((f) => ({ ...f, contextWindow: parseInt(e.target.value, 10) || 128_000 }))}
        sx={{ mb: 1.5 }}
      />

      <Typography variant="caption" color="text.secondary" fontWeight="bold">
        CAPABILITIES
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
          gap: 1,
          mt: 0.75,
          mb: 1,
        }}
      >
        {(
          [
            ['streaming', 'Streaming'],
            ['supportsTemperature', 'Temperature'],
            ['supportsTools', 'Tool Calls'],
            ['supportsVision', 'Vision'],
            ['supportsFiles', 'Files'],
          ] as [keyof typeof form, string][]
        ).map(([key, label]) => (
          <Box
            key={key}
            sx={{
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1,
              px: 1,
              py: 0.25,
              bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)'),
            }}
          >
            <FormControlLabel
              control={
                <Switch size="small" checked={form[key] as boolean} onChange={(e): void => setForm((f) => ({ ...f, [key]: e.target.checked }))} />
              }
              label={<Typography variant="caption">{label}</Typography>}
              sx={{ m: 0, width: '100%', justifyContent: 'space-between' }}
            />
          </Box>
        ))}
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer', mb: 0.5 }} onClick={(): void => setExpandedAdvanced((v) => !v)}>
        <Typography variant="caption" color="text.secondary" fontWeight="bold">
          BEHAVIORAL OVERRIDES
        </Typography>
        {expandedAdvanced ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
      </Box>
      <Collapse in={expandedAdvanced}>
        <Box sx={{ pl: 1, borderLeft: '2px solid', borderColor: 'divider', mb: 1.5 }}>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={form.enforceAlternatingRoles}
                onChange={(e): void => setForm((f) => ({ ...f, enforceAlternatingRoles: e.target.checked }))}
              />
            }
            label={<Typography variant="caption">Enforce alternating roles (required for DeepSeek Reasoner)</Typography>}
          />
          <Box display="grid" gridTemplateColumns="1fr 1fr" gap={1.5} sx={{ mt: 1 }}>
            <TextField
              label="Force Temperature"
              size="small"
              type="number"
              value={forceTempInput}
              onChange={(e): void => setForceTempInput(e.target.value)}
              helperText="Override temp on non-streaming (e.g. 0.6)"
              inputProps={{ step: 0.1, min: 0, max: 2 }}
            />
            <TextField
              label="Max Tokens Override"
              size="small"
              type="number"
              value={maxTokensInput}
              onChange={(e): void => setMaxTokensInput(e.target.value)}
              helperText="Adds max_tokens to payload"
            />
          </Box>

          {/* Thinking / Reasoning extraction */}
          <Typography variant="caption" color="text.secondary" fontWeight="bold" sx={{ display: 'block', mt: 1.5, mb: 0.75 }}>
            THINKING EXTRACTION
          </Typography>
          <FormControl fullWidth size="small" sx={{ mb: 1 }}>
            <InputLabel>Parse Mode</InputLabel>
            <Select
              value={form.thinkingParseMode ?? 'api-native'}
              label="Parse Mode"
              onChange={(e): void => setForm((f) => ({ ...f, thinkingParseMode: e.target.value as UserChatModel['thinkingParseMode'] }))}
            >
              <MenuItem value="api-native">API Native (reasoning_content / thinking blocks)</MenuItem>
              <MenuItem value="tag-based">Tag-Based (e.g. &lt;think&gt;…&lt;/think&gt;)</MenuItem>
              <MenuItem value="none">None (never extract reasoning)</MenuItem>
            </Select>
          </FormControl>
          {(form.thinkingParseMode ?? 'api-native') === 'tag-based' && (
            <Box display="grid" gridTemplateColumns="1fr 1fr" gap={1.5}>
              <TextField
                label="Open Tag"
                size="small"
                value={form.thinkingOpenTag ?? '<think>'}
                onChange={(e): void => setForm((f) => ({ ...f, thinkingOpenTag: e.target.value }))}
                helperText="e.g. <think>"
              />
              <TextField
                label="Close Tag"
                size="small"
                value={form.thinkingCloseTag ?? '</think>'}
                onChange={(e): void => setForm((f) => ({ ...f, thinkingCloseTag: e.target.value }))}
                helperText="e.g. </think>"
              />
            </Box>
          )}
        </Box>
      </Collapse>

      <Divider sx={{ mb: 1.5 }} />
      <Box display="flex" justifyContent="flex-end" gap={1}>
        <Button size="small" onClick={onClose}>
          Cancel
        </Button>
        <Button size="small" variant="contained" disabled={!isValid} onClick={handleSave}>
          {model ? 'Save Changes' : 'Add Model'}
        </Button>
      </Box>
    </Paper>
  );
};

// ── Provider settings form (inline in card header) ────────────────────────────

interface ProviderSettingsFormProps {
  provider: LlmProvider;
  onClose: () => void;
}

const ProviderSettingsForm: React.FC<ProviderSettingsFormProps> = ({ provider, onClose }) => {
  const { updateProvider } = useProviderStore();
  const [form, setForm] = useState<Omit<LlmProvider, 'id'>>({ ...provider });
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [expandedAdvanced, setExpandedAdvanced] = useState(false);
  const [jsonError, setJsonError] = useState('');

  const validateJson = (value: string): boolean => {
    if (!value.trim()) return true;
    try {
      JSON.parse(value);
      return true;
    } catch {
      return false;
    }
  };

  const isValid = form.name.trim() && form.baseUrl.trim() && validateJson(form.payloadOverridesJson);

  const handleSave = (): void => {
    if (!validateJson(form.payloadOverridesJson)) {
      setJsonError('Invalid JSON');
      return;
    }
    const apiKeyEncrypted = apiKeyInput.trim() ? encodeApiKey(apiKeyInput.trim()) : form.apiKeyEncrypted;
    updateProvider({ ...form, id: provider.id, apiKeyEncrypted });
    onClose();
  };

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
      <Typography variant="subtitle2" gutterBottom>
        Provider Settings
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
        label="API Key (leave blank to keep current)"
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
        <Button size="small" onClick={onClose}>
          Cancel
        </Button>
        <Button size="small" variant="contained" disabled={!isValid} onClick={handleSave}>
          Save Changes
        </Button>
      </Box>
    </Paper>
  );
};

// ── Single provider card ──────────────────────────────────────────────────────

interface ProviderCardProps {
  provider: LlmProvider;
  balanceLabel?: string;
}

const ProviderCardComponent: React.FC<ProviderCardProps> = ({ provider, balanceLabel }) => {
  const { models, deleteProvider } = useProviderStore();
  const [editingProviderSettings, setEditingProviderSettings] = useState(false);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [showAddModel, setShowAddModel] = useState(false);

  const providerModels = models.filter((m) => m.providerId === provider.id);
  const key = getApiKey(provider);
  const hasKey = key.length > 0;

  const handleDeleteProvider = (): void => {
    const msg =
      providerModels.length > 0
        ? `Delete provider "${provider.name}"? This will also delete ${providerModels.length} model(s).`
        : `Delete provider "${provider.name}"?`;
    if (window.confirm(msg)) {
      deleteProvider(provider.id);
    }
  };

  return (
    <Paper elevation={3} sx={{ p: 3, mb: 3, width: '100%', maxWidth: 600, bgcolor: (theme) => theme.palette.background.paper }}>
      {/* Card header */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
        <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
          <Typography variant="h6">{provider.name}</Typography>
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
          <Tooltip title="Provider settings">
            <IconButton
              size="small"
              color={editingProviderSettings ? 'primary' : 'default'}
              onClick={(): void => setEditingProviderSettings((v) => !v)}
            >
              <SettingsIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete provider">
            <IconButton size="small" color="error" onClick={handleDeleteProvider}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2, wordBreak: 'break-all' }}>
        {provider.baseUrl}
      </Typography>
      {balanceLabel && (
        <Typography variant="caption" color="success.main" sx={{ display: 'block', mb: 2, fontWeight: 700 }}>
          Balance: {balanceLabel}
        </Typography>
      )}

      {/* Provider settings form */}
      {editingProviderSettings && <ProviderSettingsForm provider={provider} onClose={(): void => setEditingProviderSettings(false)} />}

      {/* Models */}
      <Divider sx={{ mb: 1.5 }} />
      <Typography
        variant="caption"
        fontWeight="bold"
        color="text.secondary"
        sx={{ textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', mb: 1 }}
      >
        Models
      </Typography>

      {providerModels.map((model) => (
        <Box key={model.id}>
          <Box
            sx={{
              p: 1.5,
              border: '1px solid',
              borderColor: editingModelId === model.id ? 'primary.main' : 'divider',
              borderRadius: 1,
              mb: 1,
              bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)'),
              opacity: model.enabled ? 1 : 0.5,
            }}
          >
            <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
              <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
                <Tooltip title={model.enabled ? 'Enabled' : 'Disabled — not selectable in chat'}>
                  <Switch
                    size="small"
                    checked={model.enabled}
                    onChange={(e): void => {
                      useProviderStore.getState().updateModel({ ...model, enabled: e.target.checked });
                    }}
                    sx={{ mr: 0.5 }}
                  />
                </Tooltip>
                <Typography variant="body2" fontWeight="bold">
                  {model.label}
                </Typography>
                {model.supportsTools && <Chip label="Tools" size="small" variant="outlined" sx={{ fontSize: '0.6rem' }} />}
                {model.supportsVision && <Chip label="Vision" size="small" variant="outlined" sx={{ fontSize: '0.6rem' }} />}
                {model.enforceAlternatingRoles && (
                  <Chip label="Alt-roles" size="small" variant="outlined" color="warning" sx={{ fontSize: '0.6rem' }} />
                )}
                {model.forceTemperature != null && (
                  <Chip label={`T=${model.forceTemperature}`} size="small" variant="outlined" color="info" sx={{ fontSize: '0.6rem' }} />
                )}
              </Box>
              <Box display="flex" alignItems="center" gap={1}>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {`${(model.input * USD_TO_SEK).toFixed(0)}kr | ${(model.output * USD_TO_SEK).toFixed(0)}kr /1M`}
                </Typography>
                <Tooltip title="Edit model">
                  <IconButton size="small" onClick={(): void => setEditingModelId((id) => (id === model.id ? null : model.id))}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Delete model">
                  <IconButton
                    size="small"
                    color="error"
                    onClick={(): void => {
                      if (window.confirm(`Delete model "${model.label}"?`)) {
                        useProviderStore.getState().deleteModel(model.id);
                        if (editingModelId === model.id) setEditingModelId(null);
                      }
                    }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>
          </Box>
          {editingModelId === model.id && <ModelForm providerId={provider.id} model={model} onClose={(): void => setEditingModelId(null)} />}
        </Box>
      ))}

      {providerModels.length === 0 && !showAddModel && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          No models configured.
        </Typography>
      )}

      {showAddModel && <ModelForm providerId={provider.id} onClose={(): void => setShowAddModel(false)} />}

      {!showAddModel && editingModelId === null && (
        <Button variant="outlined" size="small" startIcon={<AddIcon />} onClick={(): void => setShowAddModel(true)} sx={{ mt: 0.5 }}>
          Add Model
        </Button>
      )}
    </Paper>
  );
};

// ── "Add Provider" card ───────────────────────────────────────────────────────

const AddProviderCard: React.FC = () => {
  const { addProvider } = useProviderStore();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyProviderForm());
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [expandedAdvanced, setExpandedAdvanced] = useState(false);
  const [jsonError, setJsonError] = useState('');

  const validateJson = (value: string): boolean => {
    if (!value.trim()) return true;
    try {
      JSON.parse(value);
      return true;
    } catch {
      return false;
    }
  };

  const isValid = form.name.trim() && form.baseUrl.trim() && validateJson(form.payloadOverridesJson);

  const handleSave = (): void => {
    if (!validateJson(form.payloadOverridesJson)) {
      setJsonError('Invalid JSON');
      return;
    }
    const apiKeyEncrypted = apiKeyInput.trim() ? encodeApiKey(apiKeyInput.trim()) : '';
    addProvider({ ...form, id: crypto.randomUUID(), apiKeyEncrypted });
    setForm(emptyProviderForm());
    setApiKeyInput('');
    setOpen(false);
  };

  const handleCancel = (): void => {
    setForm(emptyProviderForm());
    setApiKeyInput('');
    setJsonError('');
    setOpen(false);
  };

  return (
    <Paper
      elevation={3}
      sx={{
        p: 3,
        mb: 3,
        width: '100%',
        maxWidth: 600,
        bgcolor: (theme) => theme.palette.background.paper,
        border: '1px dashed',
        borderColor: 'divider',
      }}
    >
      {!open ? (
        <Button variant="outlined" startIcon={<AddIcon />} onClick={(): void => setOpen(true)} fullWidth>
          Add Custom Provider
        </Button>
      ) : (
        <Box>
          <Typography variant="h6" gutterBottom>
            New Provider
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
            helperText="e.g. https://api.openai.com/v1/chat/completions or http://localhost:11434/v1/chat/completions"
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
            label="API Key"
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
            <Button size="small" onClick={handleCancel}>
              Cancel
            </Button>
            <Button size="small" variant="contained" disabled={!isValid} onClick={handleSave}>
              Add Provider
            </Button>
          </Box>
        </Box>
      )}
    </Paper>
  );
};

// ── Exports ───────────────────────────────────────────────────────────────────

export { ProviderCardComponent as ProviderCard, AddProviderCard };
