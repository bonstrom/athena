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
import { UserChatModel } from '../types/provider';
import { USD_TO_SEK } from '../constants';

const emptyModel = (providerId = ''): Omit<UserChatModel, 'id'> => ({
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

const ModelsSettings: React.FC = () => {
  const { models, providers, addModel, updateModel, deleteModel } = useProviderStore();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState(emptyModel());
  const [expandedAdvanced, setExpandedAdvanced] = useState(false);
  const [forceTempInput, setForceTempInput] = useState('');
  const [maxTokensInput, setMaxTokensInput] = useState('');

  const openEdit = (model: UserChatModel): void => {
    setEditingId(model.id);
    setForm({
      label: model.label,
      apiModelId: model.apiModelId,
      providerId: model.providerId,
      input: model.input,
      cachedInput: model.cachedInput,
      output: model.output,
      streaming: model.streaming,
      supportsTemperature: model.supportsTemperature,
      supportsTools: model.supportsTools,
      supportsVision: model.supportsVision,
      supportsFiles: model.supportsFiles,
      contextWindow: model.contextWindow,
      forceTemperature: model.forceTemperature,
      enforceAlternatingRoles: model.enforceAlternatingRoles,
      maxTokensOverride: model.maxTokensOverride,
      isBuiltIn: model.isBuiltIn,
      enabled: model.enabled !== false,
      thinkingParseMode: model.thinkingParseMode ?? 'api-native',
      thinkingOpenTag: model.thinkingOpenTag ?? '<think>',
      thinkingCloseTag: model.thinkingCloseTag ?? '</think>',
    });
    setForceTempInput(model.forceTemperature !== null && model.forceTemperature !== undefined ? String(model.forceTemperature) : '');
    setMaxTokensInput(model.maxTokensOverride !== null && model.maxTokensOverride !== undefined ? String(model.maxTokensOverride) : '');
    setExpandedAdvanced(false);
    setShowAddForm(false);
  };

  const openAdd = (): void => {
    setEditingId(null);
    const firstProviderId = providers[0]?.id ?? '';
    setForm(emptyModel(firstProviderId));
    setForceTempInput('');
    setMaxTokensInput('');
    setExpandedAdvanced(false);
    setShowAddForm(true);
  };

  const closeForm = (): void => {
    setEditingId(null);
    setShowAddForm(false);
  };

  const handleSave = (): void => {
    const forceTemp = forceTempInput.trim() ? parseFloat(forceTempInput) : null;
    const maxTok = maxTokensInput.trim() ? parseInt(maxTokensInput, 10) : null;
    const finalModel: Omit<UserChatModel, 'id'> = {
      ...form,
      forceTemperature: forceTemp,
      maxTokensOverride: maxTok,
    };
    if (editingId) {
      updateModel({ ...finalModel, id: editingId });
    } else {
      addModel({ ...finalModel, id: crypto.randomUUID() });
    }
    closeForm();
  };

  const handleDelete = (model: UserChatModel): void => {
    if (window.confirm(`Delete model "${model.label}"?`)) {
      deleteModel(model.id);
      if (editingId === model.id) closeForm();
    }
  };

  const isFormValid = form.label.trim() && form.apiModelId.trim() && form.providerId;

  // Group models by provider
  const byProvider = providers.map((p) => ({
    provider: p,
    models: models.filter((m) => m.providerId === p.id),
  }));
  const ungrouped = models.filter((m) => !providers.find((p) => p.id === m.providerId));

  const ModelRow = ({ model }: { model: UserChatModel }): React.ReactElement => (
    <Box
      sx={{
        p: 1.5,
        border: '1px solid',
        borderColor: editingId === model.id ? 'primary.main' : 'divider',
        borderRadius: 1,
        mb: 1,
        bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)'),
      }}
    >
      <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
        <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
          <Typography variant="body2" fontWeight="bold">
            {model.label}
          </Typography>
          {model.supportsTools && <Chip label="Tools" size="small" variant="outlined" sx={{ fontSize: '0.6rem' }} />}
          {model.supportsVision && <Chip label="Vision" size="small" variant="outlined" sx={{ fontSize: '0.6rem' }} />}
          {model.enforceAlternatingRoles && <Chip label="Alt-roles" size="small" variant="outlined" color="warning" sx={{ fontSize: '0.6rem' }} />}
          {model.forceTemperature !== null && model.forceTemperature !== undefined && (
            <Chip label={`T=${model.forceTemperature}`} size="small" variant="outlined" color="info" sx={{ fontSize: '0.6rem' }} />
          )}
        </Box>
        <Box display="flex" alignItems="center" gap={1}>
          <Typography variant="caption" color="text.secondary" noWrap>
            {`${(model.input * USD_TO_SEK).toFixed(0)}kr | ${(model.output * USD_TO_SEK).toFixed(0)}kr /1M`}
          </Typography>
          <Tooltip title="Edit">
            <IconButton size="small" onClick={(): void => openEdit(model)}>
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton size="small" color="error" onClick={(): void => handleDelete(model)}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
      {editingId === model.id && <ModelForm />}
    </Box>
  );

  function ModelForm(): React.ReactElement {
    return (
      <Paper variant="outlined" sx={{ p: 2, mt: 1.5 }}>
        <Typography variant="subtitle2" gutterBottom>
          {editingId ? 'Edit Model' : 'New Model'}
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
        <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
          <InputLabel>Provider</InputLabel>
          <Select value={form.providerId} label="Provider" onChange={(e): void => setForm((f) => ({ ...f, providerId: e.target.value }))}>
            {providers.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Pricing */}
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

        {/* Capabilities */}
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

        {/* Behavioral overrides */}
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
                helperText="Override temp on non-streaming (e.g. 0.6 for kimi-k2.5)"
                inputProps={{ step: 0.1, min: 0, max: 2 }}
              />
              <TextField
                label="Max Tokens Override"
                size="small"
                type="number"
                value={maxTokensInput}
                onChange={(e): void => setMaxTokensInput(e.target.value)}
                helperText="Adds max_tokens to payload (e.g. 4096 for MiniMax)"
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
          <Button size="small" onClick={closeForm}>
            Cancel
          </Button>
          <Button size="small" variant="contained" disabled={!isFormValid} onClick={handleSave}>
            {editingId ? 'Save Changes' : 'Add Model'}
          </Button>
        </Box>
      </Paper>
    );
  }

  return (
    <Box>
      {byProvider.map(({ provider, models: providerModels }) => (
        <Box key={provider.id} sx={{ mb: 2 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            fontWeight="bold"
            sx={{ textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', mb: 0.5 }}
          >
            {provider.name}
          </Typography>
          {providerModels.map((m) => (
            <ModelRow key={m.id} model={m} />
          ))}
          {providerModels.length === 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ pl: 1 }}>
              No models for this provider.
            </Typography>
          )}
        </Box>
      ))}
      {ungrouped.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary" fontWeight="bold">
            Unknown Provider
          </Typography>
          {ungrouped.map((m) => (
            <ModelRow key={m.id} model={m} />
          ))}
        </Box>
      )}

      {showAddForm && <ModelForm />}

      {!showAddForm && editingId === null && (
        <Button variant="outlined" startIcon={<AddIcon />} onClick={openAdd} size="small">
          Add Model
        </Button>
      )}
    </Box>
  );
};

export default ModelsSettings;
