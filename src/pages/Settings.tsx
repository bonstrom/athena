import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  TextField,
  Button,
  Typography,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  LinearProgress,
  Tabs,
  Tab,
  Stack,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Add as AddIcon,
  CloudDownload as DownloadIcon,
  Delete as DeleteIcon,
  Close as CloseIcon,
  Person as PersonIcon,
  Cloud as CloudIcon,
  AutoAwesome as AutoAwesomeIcon,
  Storage as StorageIcon,
} from '@mui/icons-material';
import { useAuthStore } from '../store/AuthStore';
import { BackupService } from '../services/backupService';
import { useBackupStore } from '../store/BackupStore';
import { llmSuggestionService, LlmProgress } from '../services/llmSuggestionService';
import { getMoonshotBalance, getDeepSeekBalance } from '../services/llmService';
import { useProviderStore } from '../store/ProviderStore';
import { getApiKey as getProviderApiKey } from '../types/provider';
import { USD_TO_SEK, DEFAULT_SCRATCHPAD_RULES, SCRATCHPAD_LIMIT } from '../constants';
import ThemeSelector from '../components/ThemeSelector';
import ImportDialog from '../components/ImportDialog';
import { ProviderCard, AddProviderCard } from '../components/ProviderCard';
import { PredefinedPrompt } from '../database/AthenaDb';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps): React.ReactElement {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`settings-tabpanel-${index}`}
      aria-labelledby={`settings-tab-${index}`}
      {...other}
      style={{ width: '100%', display: value === index ? 'block' : 'none' }}
    >
      {value === index && <Box sx={{ py: 3, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>{children}</Box>}
    </div>
  );
}

const Settings: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [activeTab, setActiveTab] = useState(0);
  const {
    userName,
    backupInterval,
    customInstructions,
    scratchpadRules,
    chatWidth,
    chatFontSize,
    setUserName,
    setBackupInterval,
    setCustomInstructions,
    setScratchpadRules,
    setChatWidth,
    setChatFontSize,
    predefinedPrompts,
    addPredefinedPrompt,
    updatePredefinedPrompt,
    deletePredefinedPrompt,
    llmSuggestionEnabled,
    replyPredictionEnabled,
    replyPredictionModel,
    llmModelSelected,
    llmModelDownloadStatus,
    setLlmSuggestionEnabled,
    setReplyPredictionEnabled,
    setReplyPredictionModel,
    setLlmModelSelected,
    topicPreloadCount,
    setTopicPreloadCount,
    messageTruncateChars,
    setMessageTruncateChars,
    ragEnabled,
    setRagEnabled,
    maxContextTokens,
    setMaxContextTokens,
    messageRetrievalEnabled,
    setMessageRetrievalEnabled,
    askUserEnabled,
    setAskUserEnabled,
    aiSummaryEnabled,
    setAiSummaryEnabled,
    summaryModel,
    setSummaryModel,
    defaultMaxContextMessages,
    setDefaultMaxContextMessages,
    showCameraButton,
    setShowCameraButton,
  } = useAuthStore();

  const { providers } = useProviderStore();

  const currentModelId: string = llmModelSelected === 'qwen3.5-2b' ? 'onnx-community/Qwen3.5-2B-ONNX' : 'onnx-community/Qwen3.5-0.8B-ONNX';
  const status = llmModelDownloadStatus[currentModelId] ?? 'not_downloaded';

  const [userNameInput, setUserNameInput] = useState(userName);
  const [customInstructionsInput, setCustomInstructionsInput] = useState(customInstructions);
  const [scratchpadRulesInput, setScratchpadRulesInput] = useState(scratchpadRules);

  const [saved, setSaved] = useState(false);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(false);
  const [moonshotBalance, setMoonshotBalance] = useState<number | null>(null);
  const [deepSeekBalance, setDeepSeekBalance] = useState<{ balance: number; currency: string } | null>(null);

  const [showPromptForm, setShowPromptForm] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<PredefinedPrompt | null>(null);
  const [promptNameInput, setPromptNameInput] = useState('');
  const [promptContentInput, setPromptContentInput] = useState('');

  const { status: backupStatus, lastBackupTime, setStatus: setBackupStatus, setLastBackupTime } = useBackupStore();

  const [llmProgress, setLlmProgress] = useState<LlmProgress | null>(null);
  const [isDeletingModel, setIsDeletingModel] = useState(false);

  useEffect(() => {
    llmSuggestionService.setOnProgress((progress) => {
      setLlmProgress(progress);
    });
    return () => {
      llmSuggestionService.setOnProgress(() => {
        /* no-op */
      });
    };
  }, []);

  const handleDownloadModel = (): void => {
    const modelId: string = llmModelSelected === 'qwen3.5-2b' ? 'onnx-community/Qwen3.5-2B-ONNX' : 'onnx-community/Qwen3.5-0.8B-ONNX';
    llmSuggestionService.loadModel(modelId, true);
  };

  const handleDeleteModel = async (): Promise<void> => {
    const modelId: string = llmModelSelected === 'qwen3.5-2b' ? 'onnx-community/Qwen3.5-2B-ONNX' : 'onnx-community/Qwen3.5-0.8B-ONNX';
    if (!window.confirm(`Delete downloaded model "${modelId}" from local cache?`)) {
      return;
    }
    setIsDeletingModel(true);
    try {
      await llmSuggestionService.deleteModel(modelId);
      setLlmProgress(null);
    } catch (error) {
      console.error('Failed to delete model:', error);
    } finally {
      setIsDeletingModel(false);
    }
  };

  const handleResetDownload = (): void => {
    const modelId: string = llmModelSelected === 'qwen3.5-2b' ? 'onnx-community/Qwen3.5-2B-ONNX' : 'onnx-community/Qwen3.5-0.8B-ONNX';
    llmSuggestionService.resetDownload(modelId);
    setLlmProgress(null);
  };

  useEffect(() => {
    setUserNameInput(userName);
    setCustomInstructionsInput(customInstructions);
    setScratchpadRulesInput(scratchpadRules);
  }, [userName, customInstructions, scratchpadRules]);

  // Balance display for built-in providers
  useEffect(() => {
    const moonshotProvider = providers.find((p) => p.id === 'builtin-moonshot');
    if (moonshotProvider) {
      const key = getProviderApiKey(moonshotProvider);
      if (key) {
        void getMoonshotBalance().then((data) => {
          if (data) setMoonshotBalance(data.available_balance);
        });
      } else {
        setMoonshotBalance(null);
      }
    }
  }, [providers]);

  useEffect(() => {
    const deepseekProvider = providers.find((p) => p.id === 'builtin-deepseek');
    if (deepseekProvider) {
      const key = getProviderApiKey(deepseekProvider);
      if (key) {
        void getDeepSeekBalance().then((data) => {
          if (data) setDeepSeekBalance(data);
        });
      } else {
        setDeepSeekBalance(null);
      }
    }
  }, [providers]);

  useEffect(() => {
    void BackupService.getAutoBackupHandle().then((handle) => {
      setAutoBackupEnabled(!!handle);
    });
  }, []);

  function handleSave(): void {
    setUserName(userNameInput.trim());
    setCustomInstructions(customInstructionsInput.trim());
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    setScratchpadRules(scratchpadRulesInput.trim() || DEFAULT_SCRATCHPAD_RULES);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);

  const handleExport = async (): Promise<void> => {
    try {
      await BackupService.downloadBackup();
    } catch (error) {
      console.error(error);
      alert('Failed to export backup.');
    }
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPendingImportFile(file);
    setImportDialogOpen(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImportDialogClose = (): void => {
    setImportDialogOpen(false);
    setPendingImportFile(null);
  };

  const handleImportComplete = (): void => {
    window.location.reload();
  };

  const handleToggleAutoBackup = async (checked: boolean): Promise<void> => {
    if (checked) {
      try {
        const success = await BackupService.selectAutoBackupFile();
        if (success) {
          setAutoBackupEnabled(true);
        }
      } catch (error) {
        console.error(error);
        alert('Failed to setup auto backup file.');
      }
    } else {
      if (window.confirm('Disable automatic backups? Your stored file location will be cleared.')) {
        await BackupService.clearAutoBackupHandle();
        setAutoBackupEnabled(false);
        setBackupStatus('no_handle');
        setLastBackupTime(null);
      }
    }
  };

  const handleChangeLocation = async (): Promise<void> => {
    try {
      const success = await BackupService.selectAutoBackupFile();
      if (success) {
        // Updated via store
      }
    } catch (error) {
      console.error(error);
      alert('Failed to change backup location.');
    }
  };

  const getProviderBalanceLabel = (providerId: string): string | undefined => {
    if (providerId === 'builtin-moonshot' && moonshotBalance !== null) {
      return `${(moonshotBalance * USD_TO_SEK).toFixed(2)}kr`;
    }

    if (providerId === 'builtin-deepseek' && deepSeekBalance !== null) {
      const sekBalance = deepSeekBalance.balance * (deepSeekBalance.currency === 'CNY' ? 1.5 : USD_TO_SEK);
      return `${sekBalance.toFixed(2)}kr`;
    }

    return undefined;
  };

  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: { xs: '100%', md: chatWidth === 'full' ? '100%' : chatWidth },
        mx: 'auto',
        mt: { xs: 2, md: 4 },
        px: 2,
        pb: 8,
      }}
    >
      <Paper
        elevation={4}
        sx={{
          borderRadius: 3,
          overflow: 'hidden',
          bgcolor: (theme) => theme.palette.background.paper,
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Tabs
          value={activeTab}
          onChange={(_, newValue): void => setActiveTab(newValue as number)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            borderBottom: 1,
            borderColor: 'divider',
            bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)'),
            '& .MuiTab-root': {
              minHeight: { xs: 48, sm: 64 },
              fontSize: { xs: '0.7rem', sm: '0.8rem' },
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              px: { xs: 1, sm: 2 },
            },
          }}
        >
          <Tab icon={<PersonIcon sx={{ fontSize: { xs: 18, sm: 20 } }} />} label={isMobile ? 'General' : 'General'} />
          <Tab icon={<CloudIcon sx={{ fontSize: { xs: 18, sm: 20 } }} />} label={isMobile ? 'Providers' : 'Providers'} />
          <Tab icon={<AutoAwesomeIcon sx={{ fontSize: { xs: 18, sm: 20 } }} />} label={isMobile ? 'AI' : 'AI Intelligence'} />
          <Tab icon={<StorageIcon sx={{ fontSize: { xs: 18, sm: 20 } }} />} label={isMobile ? 'Data' : 'Prompts & Data'} />
        </Tabs>

        <Box sx={{ p: { xs: 2, sm: 4 }, maxHeight: 'calc(100vh - 250px)', overflowY: 'auto' }}>
          {/* ── TAB 0: GENERAL ── */}
          <TabPanel value={activeTab} index={0}>
            <Stack spacing={4} sx={{ width: '100%', maxWidth: 600 }}>
              <Box>
                <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold' }}>
                  Profile
                </Typography>
                <TextField
                  label="User Name"
                  fullWidth
                  value={userNameInput}
                  onChange={(e): void => setUserNameInput(e.target.value)}
                  sx={{ mb: 1 }}
                />
              </Box>

              <Box>
                <Typography variant="h6" gutterBottom sx={{ borderBottom: '1px solid', borderColor: 'divider', pb: 1, mb: 2, fontWeight: 'bold' }}>
                  Appearance
                </Typography>
                <ThemeSelector />
              </Box>

              <Box>
                <Typography variant="h6" gutterBottom sx={{ borderBottom: '1px solid', borderColor: 'divider', pb: 1, mb: 2, fontWeight: 'bold' }}>
                  Chat Layout
                </Typography>
                <Stack spacing={2}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Max Chat Width</InputLabel>
                    <Select
                      value={chatWidth}
                      label="Max Chat Width"
                      onChange={(e): void => setChatWidth(e.target.value as 'sm' | 'md' | 'lg' | 'xl' | 'full')}
                    >
                      <MenuItem value="full">Full Width</MenuItem>
                      <MenuItem value="xl">Extra Wide (1600px)</MenuItem>
                      <MenuItem value="lg">Wide (1200px)</MenuItem>
                      <MenuItem value="md">Standard (900px)</MenuItem>
                      <MenuItem value="sm">Compact (600px)</MenuItem>
                    </Select>
                  </FormControl>
                  <FormControl fullWidth size="small">
                    <InputLabel>Chat Font Size</InputLabel>
                    <Select value={chatFontSize} label="Chat Font Size" onChange={(e): void => setChatFontSize(e.target.value as number)}>
                      <MenuItem value={12}>Small (12px)</MenuItem>
                      <MenuItem value={14}>Compact (14px)</MenuItem>
                      <MenuItem value={16}>Standard (16px)</MenuItem>
                      <MenuItem value={18}>Large (18px)</MenuItem>
                      <MenuItem value={20}>Extra Large (20px)</MenuItem>
                      <MenuItem value={24}>Huge (24px)</MenuItem>
                    </Select>
                  </FormControl>
                </Stack>
              </Box>

              <Box>
                <Typography variant="h6" gutterBottom sx={{ borderBottom: '1px solid', borderColor: 'divider', pb: 1, mb: 2, fontWeight: 'bold' }}>
                  Performance
                </Typography>
                <Stack spacing={2}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Topic Preload Count</InputLabel>
                    <Select
                      value={topicPreloadCount}
                      label="Topic Preload Count"
                      onChange={(e): void => setTopicPreloadCount(e.target.value as number)}
                    >
                      <MenuItem value={0}>Disabled</MenuItem>
                      <MenuItem value={3}>3 topics</MenuItem>
                      <MenuItem value={5}>5 topics</MenuItem>
                      <MenuItem value={10}>10 topics</MenuItem>
                      <MenuItem value={20}>20 topics</MenuItem>
                      <MenuItem value={50}>50 topics</MenuItem>
                    </Select>
                  </FormControl>
                  <FormControl fullWidth size="small">
                    <InputLabel>Message Preview Length</InputLabel>
                    <Select
                      value={messageTruncateChars}
                      label="Message Preview Length"
                      onChange={(e): void => setMessageTruncateChars(e.target.value as number)}
                    >
                      <MenuItem value={0}>Always show full messages</MenuItem>
                      <MenuItem value={100}>Tiny (100 characters)</MenuItem>
                      <MenuItem value={500}>Default (500 characters)</MenuItem>
                      <MenuItem value={800}>Medium (800 characters)</MenuItem>
                      <MenuItem value={1200}>Long (1200 characters)</MenuItem>
                      <MenuItem value={2000}>Very long (2000 characters)</MenuItem>
                      <MenuItem value={4000}>Maximum (4000 characters)</MenuItem>
                    </Select>
                  </FormControl>
                  <FormControl fullWidth size="small">
                    <InputLabel>Camera Button</InputLabel>
                    <Select
                      value={showCameraButton}
                      label="Camera Button"
                      onChange={(e): void => setShowCameraButton(e.target.value as 'auto' | 'always' | 'never')}
                    >
                      <MenuItem value="auto">Auto (mobile only)</MenuItem>
                      <MenuItem value="always">Always show</MenuItem>
                      <MenuItem value="never">Never show</MenuItem>
                    </Select>
                  </FormControl>
                </Stack>
              </Box>

              <Box display="flex" justifyContent="flex-end" alignItems="center" gap={2}>
                {saved && (
                  <Typography variant="body2" color="success.main">
                    Settings saved successfully.
                  </Typography>
                )}
                <Button variant="contained" color="primary" onClick={handleSave}>
                  Save Profile
                </Button>
              </Box>
            </Stack>
          </TabPanel>

          {/* ── TAB 1: PROVIDERS ── */}
          <TabPanel value={activeTab} index={1}>
            <Box sx={{ width: '100%', maxWidth: 600 }}>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold' }}>
                LLM Providers
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Each provider has its own API key and models. Add an OpenAI-compatible endpoint, Anthropic, or any custom provider (Ollama,
                Azure, LiteLLM…).
              </Typography>
              {providers.map((p) => (
                <ProviderCard key={p.id} provider={p} balanceLabel={getProviderBalanceLabel(p.id)} />
              ))}
              <AddProviderCard />
            </Box>
          </TabPanel>

          {/* ── TAB 2: AI INTELLIGENCE ── */}
          <TabPanel value={activeTab} index={2}>
            <Stack spacing={4} sx={{ width: '100%', maxWidth: 600 }}>
              <Box>
                <Typography variant="h6" gutterBottom sx={{ borderBottom: '1px solid', borderColor: 'divider', pb: 1, mb: 2, fontWeight: 'bold' }}>
                  Context &amp; Reasoning
                </Typography>
                <Stack spacing={2}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Max Context Tokens</InputLabel>
                    <Select
                      value={maxContextTokens}
                      label="Max Context Tokens"
                      onChange={(e): void => setMaxContextTokens(e.target.value as number)}
                    >
                      <MenuItem value={4000}>4k — Minimal (cheap)</MenuItem>
                      <MenuItem value={8000}>8k — Compact</MenuItem>
                      <MenuItem value={16000}>16k — Default</MenuItem>
                      <MenuItem value={32000}>32k — Large</MenuItem>
                      <MenuItem value={64000}>64k — Maximum</MenuItem>
                    </Select>
                  </FormControl>
                  <FormControl fullWidth size="small">
                    <InputLabel>Default Recent Messages</InputLabel>
                    <Select
                      value={defaultMaxContextMessages}
                      label="Default Recent Messages"
                      onChange={(e): void => setDefaultMaxContextMessages(e.target.value as number)}
                    >
                      <MenuItem value={5}>5 messages</MenuItem>
                      <MenuItem value={10}>10 messages (default)</MenuItem>
                      <MenuItem value={15}>15 messages</MenuItem>
                      <MenuItem value={20}>20 messages</MenuItem>
                      <MenuItem value={30}>30 messages</MenuItem>
                      <MenuItem value={50}>50 messages</MenuItem>
                    </Select>
                  </FormControl>
                </Stack>
              </Box>

              <Box>
                <Typography variant="h6" gutterBottom sx={{ borderBottom: '1px solid', borderColor: 'divider', pb: 1, mb: 2, fontWeight: 'bold' }}>
                  Intelligence Tools
                </Typography>
                <Stack spacing={1}>
                  <FormControlLabel
                    control={<Switch checked={messageRetrievalEnabled} onChange={(e): void => setMessageRetrievalEnabled(e.target.checked)} size="small" />}
                    label={
                      <Box>
                        <Typography variant="body2">Message Retrieval Tool</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Allows the LLM to selectively retrieve older messages from this topic using IDs.
                        </Typography>
                      </Box>
                    }
                    sx={{ alignItems: 'flex-start' }}
                  />
                  <FormControlLabel
                    control={<Switch checked={askUserEnabled} onChange={(e): void => setAskUserEnabled(e.target.checked)} size="small" />}
                    label={
                      <Box>
                        <Typography variant="body2">Ask User Tool</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Allows the LLM to pause and ask you a clarifying question instead of guessing.
                        </Typography>
                      </Box>
                    }
                    sx={{ alignItems: 'flex-start' }}
                  />
                  <FormControlLabel
                    control={<Switch checked={aiSummaryEnabled} onChange={(e): void => setAiSummaryEnabled(e.target.checked)} size="small" />}
                    label={
                      <Box>
                        <Typography variant="body2">AI Message Summaries</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Automatically generates a short AI summary for messages exceeding 300 characters.
                        </Typography>
                      </Box>
                    }
                    sx={{ alignItems: 'flex-start' }}
                  />
                  {aiSummaryEnabled && (
                    <FormControl fullWidth size="small" sx={{ mt: 1, ml: 4, width: 'calc(100% - 32px)' }}>
                      <InputLabel>Summary Model</InputLabel>
                      <Select value={summaryModel} label="Summary Model" onChange={(e): void => setSummaryModel(e.target.value)}>
                        <MenuItem value="same">Same as active chat model</MenuItem>
                        <MenuItem value="local">Local LLM (browser model)</MenuItem>
                      </Select>
                    </FormControl>
                  )}
                  <FormControlLabel
                    control={<Switch checked={replyPredictionEnabled} onChange={(e): void => setReplyPredictionEnabled(e.target.checked)} size="small" />}
                    label={
                      <Box>
                        <Typography variant="body2">Reply Prediction</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Suggest 3 follow-up questions after each response.
                        </Typography>
                      </Box>
                    }
                    sx={{ alignItems: 'flex-start' }}
                  />
                  {replyPredictionEnabled && (
                    <FormControl fullWidth size="small" sx={{ mt: 1, ml: 4, width: 'calc(100% - 32px)' }}>
                      <InputLabel>Prediction Model</InputLabel>
                      <Select value={replyPredictionModel} label="Prediction Model" onChange={(e): void => setReplyPredictionModel(e.target.value)}>
                        <MenuItem value="same">Same as active chat model</MenuItem>
                        <MenuItem value="local">Local LLM (browser model)</MenuItem>
                      </Select>
                    </FormControl>
                  )}
                </Stack>
              </Box>

              <Box>
                <Typography variant="h6" gutterBottom sx={{ borderBottom: '1px solid', borderColor: 'divider', pb: 1, mb: 2, fontWeight: 'bold' }}>
                  Local Browser Model
                </Typography>
                <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
                  A small model that runs entirely on your device. No API key required.
                </Typography>

                <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                  <InputLabel>Model</InputLabel>
                  <Select
                    value={llmModelSelected}
                    label="Model"
                    onChange={(e): void => setLlmModelSelected(e.target.value as 'qwen3.5-0.8b' | 'qwen3.5-2b')}
                  >
                    <MenuItem value="qwen3.5-0.8b">Qwen3.5 0.8B (Recommended • ~500MB)</MenuItem>
                    <MenuItem value="qwen3.5-2b">Qwen3.5 2B (~1.5GB)</MenuItem>
                  </Select>
                </FormControl>

                <Box
                  sx={{
                    p: 2,
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: 'divider',
                    bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)'),
                    mb: 3,
                  }}
                >
                  <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
                    <Typography variant="body2" component="div">
                      {status === 'downloaded' ? (
                        <Box display="flex" alignItems="center" gap={1}>
                          <CheckCircleIcon color="success" />
                          Model Downloaded
                        </Box>
                      ) : status === 'downloading' ? (
                        'Downloading Model...'
                      ) : (
                        'Model not downloaded'
                      )}
                    </Typography>
                    <Box display="flex" gap={1}>
                      {status === 'downloading' && (
                        <Button variant="outlined" size="small" color="error" startIcon={<CloseIcon />} onClick={handleResetDownload}>
                          Cancel
                        </Button>
                      )}
                      {status === 'downloaded' && (
                        <Button
                          variant="outlined"
                          size="small"
                          color="error"
                          startIcon={<DeleteIcon />}
                          disabled={isDeletingModel}
                          onClick={(): void => {
                            void handleDeleteModel();
                          }}
                        >
                          Delete
                        </Button>
                      )}
                      <Button variant="outlined" size="small" startIcon={<DownloadIcon />} disabled={isDeletingModel} onClick={handleDownloadModel}>
                        {status === 'downloaded' ? 'Update' : 'Download'}
                      </Button>
                    </Box>
                  </Box>
                  {llmProgress && status === 'downloading' && (
                    <Box sx={{ width: '100%', mt: 2 }}>
                      <LinearProgress variant="determinate" value={llmProgress.progress} />
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                        {llmProgress.progress.toFixed(1)}% ({Math.round(llmProgress.loaded / 1024 / 1024)}MB)
                      </Typography>
                    </Box>
                  )}
                </Box>

                <Stack spacing={1}>
                  <FormControlLabel
                    control={<Switch checked={llmSuggestionEnabled} onChange={(e): void => setLlmSuggestionEnabled(e.target.checked)} size="small" />}
                    label={
                      <Box>
                        <Typography variant="body2">Type-ahead Suggestions</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Word prediction while you type.
                        </Typography>
                      </Box>
                    }
                    sx={{ alignItems: 'flex-start' }}
                  />
                  <FormControlLabel
                    control={<Switch checked={ragEnabled} onChange={(e): void => setRagEnabled(e.target.checked)} size="small" />}
                    label={
                      <Box>
                        <Typography variant="body2">Semantic Search (RAG)</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Retrieves relevant older messages using local embeddings.
                        </Typography>
                      </Box>
                    }
                    sx={{ alignItems: 'flex-start' }}
                  />
                </Stack>
              </Box>
            </Stack>
          </TabPanel>

          {/* ── TAB 3: PROMPTS & DATA ── */}
          <TabPanel value={activeTab} index={3}>
            <Stack spacing={4} sx={{ width: '100%', maxWidth: 600 }}>
              <Box>
                <Typography variant="h6" gutterBottom sx={{ borderBottom: '1px solid', borderColor: 'divider', pb: 1, mb: 2, fontWeight: 'bold' }}>
                  Instructions
                </Typography>
                <TextField
                  label="Custom Instructions (System Prompt)"
                  fullWidth
                  multiline
                  minRows={3}
                  maxRows={10}
                  value={customInstructionsInput}
                  onChange={(e): void => setCustomInstructionsInput(e.target.value)}
                  placeholder="Always respond in the style of a pirate..."
                  sx={{ mb: 2 }}
                />
                <TextField
                  label="Scratchpad Rules"
                  fullWidth
                  multiline
                  minRows={5}
                  maxRows={10}
                  value={scratchpadRulesInput}
                  onChange={(e): void => setScratchpadRulesInput(e.target.value)}
                  sx={{ mb: 1 }}
                  helperText={`Instructions for long-term memory scratchpad. Limit: ${SCRATCHPAD_LIMIT.toLocaleString()} chars.`}
                />
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Button size="small" variant="text" color="inherit" onClick={(): void => setScratchpadRulesInput(DEFAULT_SCRATCHPAD_RULES)}>
                    Reset Rules
                  </Button>
                  <Box display="flex" alignItems="center" gap={2}>
                    {saved && (
                      <Typography variant="body2" color="success.main">
                        Saved!
                      </Typography>
                    )}
                    <Button variant="contained" color="primary" size="small" onClick={handleSave}>
                      Save Instructions
                    </Button>
                  </Box>
                </Box>
              </Box>

              <Box>
                <Typography variant="h6" gutterBottom sx={{ borderBottom: '1px solid', borderColor: 'divider', pb: 1, mb: 2, fontWeight: 'bold' }}>
                  Predefined Prompts
                </Typography>
                <Stack spacing={2}>
                  {predefinedPrompts.map((prompt) => (
                    <Paper
                      key={prompt.id}
                      variant="outlined"
                      sx={{
                        p: 2,
                        bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)'),
                      }}
                    >
                      <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                        <Box>
                          <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                            {prompt.name}
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{
                              whiteSpace: 'pre-wrap',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              color: 'text.secondary',
                            }}
                          >
                            {prompt.content}
                          </Typography>
                        </Box>
                        <Box display="flex">
                          <Button
                            size="small"
                            onClick={(): void => {
                              setEditingPrompt(prompt);
                              setPromptNameInput(prompt.name);
                              setPromptContentInput(prompt.content);
                              setShowPromptForm(true);
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            size="small"
                            color="error"
                            onClick={(): void => {
                              if (window.confirm(`Delete prompt "${prompt.name}"?`)) {
                                deletePredefinedPrompt(prompt.id);
                              }
                            }}
                          >
                            Delete
                          </Button>
                        </Box>
                      </Box>
                    </Paper>
                  ))}

                  {showPromptForm ? (
                    <Paper variant="outlined" sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <Typography variant="subtitle2">{editingPrompt ? 'Edit Prompt' : 'New Prompt'}</Typography>
                      <TextField
                        label="Name"
                        size="small"
                        fullWidth
                        value={promptNameInput}
                        onChange={(e): void => setPromptNameInput(e.target.value)}
                      />
                      <TextField
                        label="Content"
                        multiline
                        minRows={3}
                        fullWidth
                        value={promptContentInput}
                        onChange={(e): void => setPromptContentInput(e.target.value)}
                      />
                      <Box display="flex" justifyContent="flex-end" gap={1}>
                        <Button
                          size="small"
                          onClick={(): void => {
                            setShowPromptForm(false);
                            setEditingPrompt(null);
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="small"
                          variant="contained"
                          disabled={!promptNameInput.trim() || !promptContentInput.trim()}
                          onClick={(): void => {
                            if (editingPrompt) {
                              updatePredefinedPrompt({ ...editingPrompt, name: promptNameInput.trim(), content: promptContentInput.trim() });
                            } else {
                              addPredefinedPrompt({ id: crypto.randomUUID(), name: promptNameInput.trim(), content: promptContentInput.trim() });
                            }
                            setShowPromptForm(false);
                            setEditingPrompt(null);
                            setPromptNameInput('');
                            setPromptContentInput('');
                          }}
                        >
                          {editingPrompt ? 'Save' : 'Add'}
                        </Button>
                      </Box>
                    </Paper>
                  ) : (
                    <Button variant="outlined" startIcon={<AddIcon />} onClick={(): void => setShowPromptForm(true)} fullWidth>
                      Add Prompt
                    </Button>
                  )}
                </Stack>
              </Box>

              <Box>
                <Typography variant="h6" gutterBottom sx={{ borderBottom: '1px solid', borderColor: 'divider', pb: 1, mb: 2, fontWeight: 'bold' }}>
                  Data Management
                </Typography>
                <Stack spacing={3}>
                  <Box display="flex" gap={2}>
                    <Button variant="contained" color="primary" onClick={(): void => { void handleExport(); }} fullWidth>
                      Export JSON
                    </Button>
                    <Button variant="contained" color="secondary" onClick={(): void => fileInputRef.current?.click()} fullWidth>
                      Import JSON
                    </Button>
                    <input
                      type="file"
                      accept=".json"
                      style={{ display: 'none' }}
                      ref={fileInputRef}
                      onChange={(e): void => handleImport(e)}
                    />
                  </Box>

                  {'showSaveFilePicker' in window ? (
                    <Box sx={{ p: 2, borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>Automatic Backup</Typography>
                        <Switch
                          checked={autoBackupEnabled}
                          onChange={(e): void => { void handleToggleAutoBackup(e.target.checked); }}
                          color="primary"
                          size="small"
                        />
                      </Box>
                      {autoBackupEnabled && (
                        <Stack spacing={2}>
                          <Box display="flex" justifyContent="space-between" alignItems="center">
                            <Typography variant="caption" color="success.main">
                              {backupStatus === 'permission_required' ? 'Authorize Required' : backupStatus === 'in-progress' ? 'Backing up...' : 'Active'}
                            </Typography>
                            <Button size="small" onClick={(): void => { void handleChangeLocation(); }}>Change Location</Button>
                          </Box>
                          {backupStatus === 'permission_required' && (
                            <Button size="small" color="error" variant="contained" onClick={(): void => { void BackupService.performAutoBackup(true); }}>
                              Authorize Now
                            </Button>
                          )}
                          <FormControl fullWidth size="small">
                            <InputLabel>Frequency</InputLabel>
                            <Select value={backupInterval} label="Frequency" onChange={(e): void => setBackupInterval(e.target.value as number)}>
                              <MenuItem value={1}>1 Minute</MenuItem>
                              <MenuItem value={5}>5 Minutes</MenuItem>
                              <MenuItem value={30}>30 Minutes</MenuItem>
                              <MenuItem value={60}>1 Hour</MenuItem>
                              <MenuItem value={720}>12 Hours</MenuItem>
                            </Select>
                          </FormControl>
                        </Stack>
                      )}
                    </Box>
                  ) : (
                    <Typography variant="caption" color="text.secondary">
                      Automatic backup is not supported in this browser.
                    </Typography>
                  )}
                </Stack>
              </Box>
            </Stack>
          </TabPanel>
        </Box>
      </Paper>

      <ImportDialog open={importDialogOpen} file={pendingImportFile} onClose={handleImportDialogClose} onComplete={handleImportComplete} />
    </Box>
  );
};

export default Settings;
