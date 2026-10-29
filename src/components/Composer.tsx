import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  IconButton,
  TextField,
  Menu,
  Popover,
  MenuItem,
  Tooltip,
  ListSubheader,
  Divider,
  ListItemText,
  Tabs,
  Tab,
  Slider,
  Typography,
  ToggleButton as MuiToggleButton,
  ToggleButtonGroup as MuiToggleButtonGroup,
  FormControl,
  Select,
  SelectChangeEvent,
  alpha,
  Chip,
  InputAdornment,
  InputLabel,
} from '@mui/material';
import { Theme } from '@mui/material/styles';
import SendIcon from '@mui/icons-material/Send';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import AddIcon from '@mui/icons-material/Add';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import CloseIcon from '@mui/icons-material/Close';
import TuneIcon from '@mui/icons-material/Tune';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import CodeIcon from '@mui/icons-material/Code';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import ForumIcon from '@mui/icons-material/Forum';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import PsychologyIcon from '@mui/icons-material/Psychology';
import EditNoteIcon from '@mui/icons-material/EditNote';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import CloseFullscreenIcon from '@mui/icons-material/CloseFullscreen';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import LanguageIcon from '@mui/icons-material/Language';
import BrushIcon from '@mui/icons-material/Brush';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import MicIcon from '@mui/icons-material/Mic';
import WhatshotIcon from '@mui/icons-material/Whatshot';
import { stopSpeech } from '../services/mediaService';
import TopicContextDialog from './TopicContextDialog';
import ScratchpadDialog from './ScratchpadDialog';
import { useAuthStore } from '../store/AuthStore';
import { useProviderStore } from '../store/ProviderStore';
import { useChatStore } from '../store/ChatStore';
import { useTopicStore } from '../store/TopicStore';
import { useUiStore } from '../store/UiStore';
import { isDeepSeekPeakHours } from './ModelSelector';
import { formatCost } from '../utils/currency';
import { ENGLISH_VOICES } from '../constants/voices';
import { Attachment } from '../database/AthenaDb';
import { useNotificationStore } from '../store/NotificationStore';
import { ReasoningEffort, getReasoningEfforts, resolveReasoningEffort } from '../types/provider';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const VOICE_SILENCE_TIMEOUT_MS = 2000;
const MIN_INLINE_INPUT_WIDTH = 320;

const REASONING_EFFORT_OPTIONS: { value: ReasoningEffort; label: string; title: string }[] = [
  { value: 'none', label: 'None', title: 'No reasoning' },
  { value: 'low', label: 'Low', title: 'Low Effort' },
  { value: 'medium', label: 'Med', title: 'Medium Effort (Default)' },
  { value: 'high', label: 'High', title: 'High Effort' },
  { value: 'xhigh', label: 'X-Hi', title: 'Extra High Effort' },
  { value: 'max', label: 'Max', title: 'Max Effort (Best reasoning)' },
];

const MUSIC_TEMPLATE = `Genre:
Mood:
Instrumentation:
Tempo:
---
[Intro]

[Verse 1]

[Chorus]

[Verse 2]

[Chorus]

[Bridge]

[Chorus]

[Outro]`;

const IMAGE_TEMPLATE = `Ratio: 16:9
Description:`;

interface ComposerProps {
  sending: boolean;
  onSend: (content: string, attachments?: Attachment[]) => void;
  isMobile: boolean;
  forksCollapsed?: boolean;
  onToggleForks?: () => void;
}
interface Page {
  id: string;
  title: string;
  content: string;
}

const WaveformIndicator: React.FC = () => (
  <Box
    display="flex"
    alignItems="center"
    gap={0.3}
    height={16}
    sx={{ px: 1 }}>
    {[0, 1, 2, 3].map((i) => (
      <Box
        key={i}
        sx={{
          width: 3,
          bgcolor: 'primary.main',
          borderRadius: 0.5,
          animation: 'waveform 0.8s ease-in-out infinite',
          animationDelay: `${i * 0.15}s`,
          '@keyframes waveform': {
            '0%, 100%': { height: 6 },
            '50%': { height: 16 },
          },
        }}
      />
    ))}
  </Box>
);

const Composer: React.FC<ComposerProps> = ({ sending, onSend, isMobile, forksCollapsed = false, onToggleForks }) => {
  const textFieldRef = useRef<HTMLInputElement>(null);
  const composerRowRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const sendControlsRef = useRef<HTMLDivElement>(null);
  const [controlsInline, setControlsInline] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const questionRef = useRef('');
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const finalTranscriptRef = useRef('');
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const topicStore = useTopicStore();
  const selectedModel = useChatStore((s) => s.selectedModel);
  const setSelectedModel = useChatStore((s) => s.setSelectedModel);
  const storedReasoningEffort = useChatStore((s) => s.reasoningEffort);
  const effortOptions = REASONING_EFFORT_OPTIONS.filter((o) => {
    const efforts = getReasoningEfforts(selectedModel);
    return !efforts || efforts.includes(o.value);
  });
  const currentEffort = resolveReasoningEffort(selectedModel, storedReasoningEffort) ?? 'medium';
  const temperature = useChatStore((s) => s.temperature);
  const setTemperature = useChatStore((s) => s.setTemperature);
  const currentTopicId = useChatStore((s) => s.currentTopicId);
  const stopSending = useChatStore((s) => s.stopSending);
  const autoReadEnabled = useChatStore((s) => s.autoReadEnabled);
  const setAutoReadEnabled = useChatStore((s) => s.setAutoReadEnabled);
  const webSearchEnabled = useChatStore((s) => s.webSearchEnabled);
  const setWebSearchEnabled = useChatStore((s) => s.setWebSearchEnabled);
  const imageGenerationEnabled = useChatStore((s) => s.imageGenerationEnabled);
  const setImageGenerationEnabled = useChatStore((s) => s.setImageGenerationEnabled);
  const musicGenerationEnabled = useChatStore((s) => s.musicGenerationEnabled);
  const setMusicGenerationEnabled = useChatStore((s) => s.setMusicGenerationEnabled);
  const { addNotification } = useNotificationStore();
  const {
    chatWidth,
    setChatWidth,
    chatFontSize,
    setChatFontSize,
    predefinedPrompts,
    defaultMaxContextMessages,
    showCameraButton,
    ttsEnabled,
    ttsVoiceId,
    setTtsVoiceId,
    currency,
  } = useAuthStore();
  const { getAvailableModels, providers, hasWebSearchProvider } = useProviderStore();
  const currentlySpeakingMessageId = useUiStore((s) => s.currentlySpeakingMessageId);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [parameterTab, setParameterTab] = useState(0);
  const [showContextDialog, setShowContextDialog] = useState(false);
  const [showScratchpadDialog, setShowScratchpadDialog] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [pages, setPages] = useState<Page[]>([{ id: crypto.randomUUID(), title: 'Page 1', content: '' }]);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [localMaxContext, setLocalMaxContext] = useState<number | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [promptAnchorEl, setPromptAnchorEl] = useState<null | HTMLElement>(null);
  const [inputValue, setInputValue] = useState('');
  const [isListening, setIsListening] = useState(false);

  const topic = topicStore.topics.find((t) => t.id === currentTopicId);
  const hasSelectedPrompt = (topic?.selectedPromptIds?.length ?? 0) > 0;

  const availableModels = getAvailableModels();
  const hasMiniMaxKey = providers.some((p) => p.id === 'builtin-minimax' && !!p.apiKeyEncrypted);
  const hasWebSearchProviderAvailable = hasWebSearchProvider();
  const openTempMenu = Boolean(anchorEl);

  useEffect(() => {
    const row = composerRowRef.current;
    const actions = actionsRef.current;
    const sendControls = sendControlsRef.current;
    if (!row || !actions || !sendControls || typeof ResizeObserver === 'undefined') return;

    const updateLayout = (): void => {
      const requiredWidth = actions.scrollWidth + sendControls.scrollWidth + MIN_INLINE_INPUT_WIDTH + 16;
      setControlsInline(row.clientWidth >= requiredWidth);
    };
    let frameId = 0;
    const scheduleLayout = (): void => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(updateLayout);
    };
    const observer = new ResizeObserver(scheduleLayout);
    observer.observe(row);
    observer.observe(actions);
    observer.observe(sendControls);
    updateLayout();
    return (): void => {
      observer.disconnect();
      cancelAnimationFrame(frameId);
    };
  }, []);

  useEffect(() => {
    if (availableModels.length === 0) return;
    const selectedStillAvailable = availableModels.some((m) => m.id === selectedModel.id);
    if (!selectedStillAvailable) {
      setSelectedModel(availableModels[0]);
    }
  }, [availableModels, selectedModel.id, setSelectedModel]);

  const handleTempClick = (event: React.MouseEvent<HTMLButtonElement>): void => {
    setAnchorEl(event.currentTarget);
  };
  const handleTempClose = (): void => {
    setAnchorEl(null);
  };
  const handleTempSelect = (value: number): void => {
    setTemperature(value);
    setAnchorEl(null);
  };

  const clearSilenceTimer = (): void => {
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
  };

  const resetSilenceTimer = (): void => {
    clearSilenceTimer();
    silenceTimeoutRef.current = setTimeout(() => {
      recognitionRef.current?.stop();
    }, VOICE_SILENCE_TIMEOUT_MS);
  };

  const startListening = (): void => {
    const SpeechRecognitionCtor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || 'en-US';

    finalTranscriptRef.current = '';

    recognition.onresult = (event: SpeechRecognitionEvent): void => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscriptRef.current += transcript;
        } else {
          interim += transcript;
        }
      }
      setInputValue((finalTranscriptRef.current + interim).trim());
      resetSilenceTimer();
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent): void => {
      clearSilenceTimer();
      setIsListening(false);
      if (event.error === 'not-allowed') {
        addNotification('Microphone access denied', 'Please allow microphone access in your browser settings.');
      } else if (event.error === 'network') {
        addNotification('Speech recognition error', 'A network error occurred. Please check your connection.');
      } else if (event.error !== 'aborted' && event.error !== 'no-speech') {
        addNotification('Speech recognition error', `Recognition failed: ${event.error}`);
      }
    };

    recognition.onend = (): void => {
      clearSilenceTimer();
      setIsListening(false);
      setInputValue(finalTranscriptRef.current.trim());
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    resetSilenceTimer();
  };

  const stopListening = (): void => {
    clearSilenceTimer();
    recognitionRef.current?.stop();
    setIsListening(false);
  };

  // Clean up speech recognition on unmount
  useEffect(() => {
    return (): void => {
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }
      recognitionRef.current?.stop();
    };
  }, []);

  const handleSendOrRecord = (): void => {
    if (isListening) {
      stopListening();
      return;
    }

    if (sending) {
      void handleStop();
      return;
    }

    if (currentlySpeakingMessageId) {
      stopSpeech();
      // If the input is empty, we only stop speech and don't proceed to send/record
      if (!inputValue.trim() && !attachments.length) {
        return;
      }
    }

    if (!inputValue.trim() && !attachments.length) {
      startListening();
      return;
    }

    handleSend();
  };

  const handleSend = (): void => {
    const currentContent = inputValue;
    const updatedPages = pages.map((p, i) => (i === activePageIndex ? { ...p, content: currentContent } : p));

    const combinedContent = updatedPages
      .filter((p) => p.content.trim())
      .map((p) => p.content.trim())
      .join('\n\n---\n\n');

    if (!combinedContent && attachments.length === 0) return;

    onSend(combinedContent, attachments);
    questionRef.current = '';
    setInputValue('');
    setIsExpanded(false);
    setPages([{ id: crypto.randomUUID(), title: 'Page 1', content: '' }]);
    setActivePageIndex(0);
    setAttachments([]);
    // Defer blur so it runs after React re-renders – needed to dismiss the Android keyboard
    requestAnimationFrame(() => {
      textFieldRef.current?.blur();
    });
  };

  const handleTabChange = (_: React.SyntheticEvent, newValue: number): void => {
    const currentContent = inputValue;
    setPages((prev) => prev.map((p, i) => (i === activePageIndex ? { ...p, content: currentContent } : p)));

    const targetPage = pages[newValue];
    setInputValue(targetPage.content);
    questionRef.current = targetPage.content;
    setActivePageIndex(newValue);
  };

  const addPage = (): void => {
    const currentContent = inputValue;
    setPages((prev) => {
      const updatedPrev = prev.map((p, i) => (i === activePageIndex ? { ...p, content: currentContent } : p));
      const newPage: Page = {
        id: crypto.randomUUID(),
        title: `Page ${updatedPrev.length + 1}`,
        content: '',
      };
      return [...updatedPrev, newPage];
    });

    setActivePageIndex(pages.length);
    setInputValue('');
    questionRef.current = '';
  };

  const deletePage = (index: number, e: React.MouseEvent): void => {
    e.stopPropagation();
    if (pages.length <= 1) return;

    const currentContent = inputValue;
    const updatedPages = pages.map((p, i) => (i === activePageIndex ? { ...p, content: currentContent } : p));
    const newPages = updatedPages.filter((_, i) => i !== index);

    let newIndex = activePageIndex;
    if (activePageIndex === index) {
      newIndex = Math.max(0, index - 1);
    } else if (activePageIndex > index) {
      newIndex = activePageIndex - 1;
    }

    setPages(newPages);
    setActivePageIndex(newIndex);

    if (activePageIndex === index) {
      const targetContent = newPages[newIndex].content;
      setInputValue(targetContent);
      questionRef.current = targetContent;
    }
  };

  const handleStop = async (): Promise<void> => {
    stopSpeech();
    const topicIdBeforeStop = currentTopicId;
    const restoredContent = await stopSending();
    // Guard: if the user switched topics while the stop was in flight, do not
    // inject the restored content into the newly-active topic's input.
    if (restoredContent && useChatStore.getState().currentTopicId === topicIdBeforeStop) {
      setPages([{ id: crypto.randomUUID(), title: 'Page 1', content: restoredContent }]);
      setActivePageIndex(0);
      setInputValue(restoredContent);
      questionRef.current = restoredContent;
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const files = e.target.files;
    if (!files) return;

    const newAttachments: Attachment[] = [];

    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_SIZE) {
        addNotification('File too large', `${file.name} exceeds the 10MB limit.`);
        continue;
      }

      try {
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (): void => {
            const result = reader.result;
            if (typeof result === 'string') {
              resolve(result);
            } else {
              reject(new Error('Unexpected FileReader result type'));
            }
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        newAttachments.push({
          id: crypto.randomUUID(),
          name: file.name,
          type: file.type,
          size: file.size,
          data: data,
          previewUrl: file.type.startsWith('image/') ? data : undefined,
        });
      } catch (err) {
        console.error('Failed to read file:', err);
        addNotification('Upload failed', `Could not read ${file.name}`);
      }
    }

    setAttachments((prev) => [...prev, ...newAttachments]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const removeAttachment = (id: string): void => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handlePromptClick = (event: React.MouseEvent<HTMLElement>): void => {
    setPromptAnchorEl(event.currentTarget);
  };
  const handlePromptClose = (): void => {
    setPromptAnchorEl(null);
  };

  useEffect(() => {
    if (!sending && !isMobile && textFieldRef.current) {
      textFieldRef.current.focus();
    }
  }, [sending, isMobile, currentTopicId]);

  useEffect(() => {
    setLocalMaxContext(null);
  }, [currentTopicId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (!isMobile && e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      handleSend();
      e.preventDefault();
    }
  };

  return (
    <Box
      display="flex"
      alignItems="center"
      gap={1}
      px={2}
      pb={isMobile ? 0.5 : 1}
      pt={isMobile ? 0.5 : 1}
      justifyContent="center"
      sx={{
        backgroundColor: (theme) => alpha(theme.palette.background.default, 0.85),
        backdropFilter: 'blur(12px)',
        borderTop: (theme) => `1px solid ${theme.palette.divider}`,
        boxShadow: 'none',
        position: 'relative',
        flexShrink: 0,
        zIndex: 10,
        maxHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}>
      <Box
        width="100%"
        sx={{
          maxWidth: chatWidth === 'full' ? '100%' : chatWidth,
        }}
        display="flex"
        flexDirection="column"
        alignItems="stretch"
        gap={1}>
        <Popover
          anchorEl={anchorEl}
          open={openTempMenu}
          onClose={handleTempClose}
          transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
          PaperProps={{
            role: 'dialog',
            'aria-label': 'Chat settings',
            sx: {
              width: 480,
              maxWidth: 'calc(100vw - 32px)',
              height: 'min(640px, calc(100dvh - 48px))',
              maxHeight: 'min(640px, calc(100dvh - 48px))',
              overflowY: 'auto',
              scrollbarGutter: 'stable',
              mt: -1,
              border: (theme) => `1px solid ${theme.palette.divider}`,
              boxShadow: (theme) =>
                theme.palette.mode === 'dark' ? '0 8px 32px rgba(0,0,0,0.4)' : '0 8px 32px rgba(0,0,0,0.1)',
              bgcolor: 'background.paper',
            },
          }}>
          <Tabs
            value={parameterTab}
            onChange={(_, value: number): void => setParameterTab(value)}
            variant="fullWidth"
            aria-label="Chat settings"
            sx={{
              borderBottom: 1,
              borderColor: 'divider',
              position: 'sticky',
              top: 0,
              bgcolor: 'background.paper',
              zIndex: 1,
              '& .MuiTab-root': { minWidth: 0, px: 1, fontSize: '0.75rem', textTransform: 'none' },
            }}>
            <Tab
              id="chat-settings-tab-0"
              aria-controls="chat-settings-panel-0"
              label="Generation"
            />
            <Tab
              id="chat-settings-tab-1"
              aria-controls="chat-settings-panel-1"
              label="Appearance"
            />
            <Tab
              id="chat-settings-tab-2"
              aria-controls="chat-settings-panel-2"
              label="Tools"
            />
          </Tabs>
          <Box
            role="tabpanel"
            id="chat-settings-panel-0"
            aria-labelledby="chat-settings-tab-0"
            hidden={parameterTab !== 0}>
            <ListSubheader
              sx={{
                lineHeight: '36px',
                fontWeight: 'bold',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                bgcolor: 'transparent',
              }}>
              Active Model
            </ListSubheader>
            <Box sx={{ px: 2, pb: 1 }}>
              <FormControl
                fullWidth
                size="small">
                <Select
                  value={selectedModel.id}
                  onChange={(e: SelectChangeEvent): void => {
                    const selected = availableModels.find((m) => m.id === e.target.value);
                    if (selected) setSelectedModel(selected);
                  }}
                  sx={{
                    fontSize: '0.85rem',
                    '& .MuiSelect-select': {
                      py: 1,
                    },
                  }}
                  renderValue={(selected): React.ReactNode => {
                    const model = availableModels.find((m) => m.id === selected);
                    if (!model) return selected;
                    return (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {isDeepSeekPeakHours() && model.providerId === 'builtin-deepseek' && (
                          <WhatshotIcon sx={{ fontSize: 14, color: 'warning.main' }} />
                        )}
                        {model.label}
                      </Box>
                    );
                  }}>
                  {availableModels.map((m) => (
                    <MenuItem
                      key={m.id}
                      value={m.id}>
                      <Box
                        display="flex"
                        justifyContent="space-between"
                        width="100%"
                        alignItems="center"
                        gap={2}>
                        <Typography
                          variant="body2"
                          sx={{ lineHeight: 1.2 }}>
                          {m.label}
                        </Typography>
                        <Box
                          display="flex"
                          alignItems="center"
                          gap={0.5}
                          flexShrink={0}
                          whiteSpace="nowrap">
                          {isDeepSeekPeakHours() && m.providerId === 'builtin-deepseek' && (
                            <Tooltip title="DeepSeek peak hours — 2x pricing">
                              <WhatshotIcon sx={{ fontSize: 14, color: 'warning.main', display: 'flex' }} />
                            </Tooltip>
                          )}
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ lineHeight: 1 }}>
                            {`${formatCost(m.input, currency, 0)} | ${formatCost(m.output, currency, 0)} / 1M`}
                          </Typography>
                        </Box>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            <Divider sx={{ my: 1, opacity: 0.6 }} />

            {selectedModel.forceTemperature == null && (
              <ListSubheader
                sx={{
                  lineHeight: '36px',
                  fontWeight: 'bold',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  bgcolor: 'transparent',
                }}>
                Temperature Presets
                {!selectedModel.supportsTemperature && (
                  <Box
                    component="span"
                    sx={{ color: 'text.secondary', ml: 1 }}>
                    (Not supported)
                  </Box>
                )}
              </ListSubheader>
            )}
            {selectedModel.forceTemperature == null && (
              <Box
                sx={{
                  px: 2,
                  pb: 1,
                  display: 'flex',
                  justifyContent: 'center',
                  opacity: selectedModel.supportsTemperature ? 1 : 0.45,
                }}>
                <MuiToggleButtonGroup
                  value={temperature}
                  exclusive
                  onChange={(_, value: number | null): void => {
                    if (value !== null) handleTempSelect(value);
                  }}
                  disabled={!selectedModel.supportsTemperature}
                  size="small"
                  fullWidth
                  sx={{
                    bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
                    p: 0.5,
                    '& .MuiToggleButton-root': {
                      border: 'none',
                      borderRadius: '8px !important',
                      mx: 0.25,
                      px: 1,
                      py: 0.5,
                      fontSize: '0.75rem',
                      fontWeight: 'bold',
                      color: 'text.secondary',
                      '&.Mui-selected': {
                        bgcolor: 'primary.main',
                        color: 'primary.contrastText',
                        '&:hover': {
                          bgcolor: 'primary.dark',
                        },
                      },
                    },
                  }}>
                  <MuiToggleButton value={0.0}>
                    <Tooltip
                      title="Coding / Math (0.0)"
                      disableTouchListener={isMobile}>
                      <CodeIcon fontSize="small" />
                    </Tooltip>
                  </MuiToggleButton>
                  <MuiToggleButton value={1.0}>
                    <Tooltip
                      title="Data Analysis (1.0)"
                      disableTouchListener={isMobile}>
                      <AnalyticsIcon fontSize="small" />
                    </Tooltip>
                  </MuiToggleButton>
                  <MuiToggleButton value={1.3}>
                    <Tooltip
                      title="General Chat (1.3)"
                      disableTouchListener={isMobile}>
                      <ForumIcon fontSize="small" />
                    </Tooltip>
                  </MuiToggleButton>
                  <MuiToggleButton value={1.5}>
                    <Tooltip
                      title="Creative Writing (1.5)"
                      disableTouchListener={isMobile}>
                      <AutoAwesomeIcon fontSize="small" />
                    </Tooltip>
                  </MuiToggleButton>
                </MuiToggleButtonGroup>
              </Box>
            )}
            {selectedModel.forceTemperature == null && <Divider sx={{ my: 1, opacity: 0.6 }} />}

            {selectedModel.supportsThinking &&
              (selectedModel.thinkingToggle == null || selectedModel.reasoningEffort == null) && (
                <ListSubheader
                  sx={{
                    lineHeight: '36px',
                    fontWeight: 'bold',
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    bgcolor: 'transparent',
                  }}>
                  Thinking & Effort
                </ListSubheader>
              )}
            {selectedModel.supportsThinking &&
              (selectedModel.thinkingToggle == null || selectedModel.reasoningEffort == null) && (
                <Box
                  sx={{
                    px: 2,
                    pb: 1,
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr)',
                    gap: 1,
                  }}>
                  {selectedModel.thinkingToggle == null && (
                    <MuiToggleButtonGroup
                      value={useChatStore.getState().thinkingMode ?? 'enabled'}
                      exclusive
                      onChange={(_, value: 'enabled' | 'disabled' | null): void => {
                        if (value !== null) useChatStore.getState().setThinkingMode(value);
                      }}
                      size="small"
                      fullWidth
                      sx={{
                        bgcolor: (theme) =>
                          theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                        p: 0.5,
                        '& .MuiToggleButton-root': {
                          border: 'none',
                          borderRadius: '8px !important',
                          mx: 0.25,
                          px: 1,
                          py: 0.5,
                          fontSize: '0.75rem',
                          fontWeight: 'bold',
                          color: 'text.secondary',
                          '&.Mui-selected': {
                            bgcolor: 'primary.main',
                            color: 'primary.contrastText',
                            '&:hover': {
                              bgcolor: 'primary.dark',
                            },
                          },
                        },
                      }}>
                      <MuiToggleButton value="enabled">
                        <Tooltip
                          title="Thinking Enabled"
                          disableTouchListener={isMobile}>
                          <span>On</span>
                        </Tooltip>
                      </MuiToggleButton>
                      <MuiToggleButton value="disabled">
                        <Tooltip
                          title="Thinking Disabled"
                          disableTouchListener={isMobile}>
                          <span>Off</span>
                        </Tooltip>
                      </MuiToggleButton>
                    </MuiToggleButtonGroup>
                  )}

                  {selectedModel.reasoningEffort == null && (
                    <MuiToggleButtonGroup
                      value={currentEffort}
                      exclusive
                      onChange={(_, value: ReasoningEffort | null): void => {
                        if (value !== null) useChatStore.getState().setReasoningEffort(value);
                      }}
                      size="small"
                      fullWidth
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                        gap: 0.5,
                        bgcolor: (theme) =>
                          theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                        p: 0.5,
                        '& .MuiToggleButton-root': {
                          border: 'none',
                          borderRadius: '8px !important',
                          mx: 0.25,
                          px: 1,
                          py: 0.5,
                          fontSize: '0.75rem',
                          fontWeight: 'bold',
                          color: 'text.secondary',
                          '&.Mui-selected': {
                            bgcolor: 'primary.main',
                            color: 'primary.contrastText',
                            '&:hover': {
                              bgcolor: 'primary.dark',
                            },
                          },
                        },
                      }}>
                      {effortOptions.map((option) => (
                        <MuiToggleButton
                          key={option.value}
                          value={option.value}>
                          <Tooltip
                            title={option.title}
                            disableTouchListener={isMobile}>
                            <span>{option.label}</span>
                          </Tooltip>
                        </MuiToggleButton>
                      ))}
                    </MuiToggleButtonGroup>
                  )}
                </Box>
              )}
            {selectedModel.supportsThinking &&
              (selectedModel.thinkingToggle == null || selectedModel.reasoningEffort == null) && (
                <Divider sx={{ my: 1, opacity: 0.6 }} />
              )}
          </Box>
          <Box
            role="tabpanel"
            id="chat-settings-panel-1"
            aria-labelledby="chat-settings-tab-1"
            hidden={parameterTab !== 1}>
            {!isMobile && (
              <ListSubheader
                sx={{
                  lineHeight: '36px',
                  fontWeight: 'bold',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  bgcolor: 'transparent',
                }}>
                Layout Width
              </ListSubheader>
            )}

            {!isMobile && (
              <Box sx={{ px: 2, pb: 1, display: 'flex', justifyContent: 'center' }}>
                <MuiToggleButtonGroup
                  value={chatWidth}
                  exclusive
                  onChange={(_, value: 'sm' | 'md' | 'lg' | 'xl' | 'full' | null): void => {
                    if (value) setChatWidth(value);
                  }}
                  size="small"
                  fullWidth
                  sx={{
                    bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
                    p: 0.5,
                    '& .MuiToggleButton-root': {
                      border: 'none',
                      borderRadius: '8px !important',
                      mx: 0.25,
                      px: 1.5,
                      py: 0.5,
                      fontSize: '0.75rem',
                      fontWeight: 'bold',
                      color: 'text.secondary',
                      '&.Mui-selected': {
                        bgcolor: 'primary.main',
                        color: 'primary.contrastText',
                        '&:hover': {
                          bgcolor: 'primary.dark',
                        },
                      },
                    },
                  }}>
                  <MuiToggleButton value="sm">
                    <Tooltip
                      title="Compact (600px)"
                      disableTouchListener={isMobile}>
                      <span>S</span>
                    </Tooltip>
                  </MuiToggleButton>
                  <MuiToggleButton value="md">
                    <Tooltip
                      title="Standard (900px)"
                      disableTouchListener={isMobile}>
                      <span>M</span>
                    </Tooltip>
                  </MuiToggleButton>
                  <MuiToggleButton value="lg">
                    <Tooltip
                      title="Wide (1200px)"
                      disableTouchListener={isMobile}>
                      <span>L</span>
                    </Tooltip>
                  </MuiToggleButton>
                  <MuiToggleButton value="xl">
                    <Tooltip
                      title="Extra Wide (1500px)"
                      disableTouchListener={isMobile}>
                      <span>XL</span>
                    </Tooltip>
                  </MuiToggleButton>
                  <MuiToggleButton value="full">
                    <Tooltip
                      title="Full Width"
                      disableTouchListener={isMobile}>
                      <span>Full</span>
                    </Tooltip>
                  </MuiToggleButton>
                </MuiToggleButtonGroup>
              </Box>
            )}

            <Divider sx={{ my: 1, opacity: 0.6 }} />

            <ListSubheader
              sx={{
                lineHeight: '36px',
                fontWeight: 'bold',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                bgcolor: 'transparent',
              }}>
              Font Size
            </ListSubheader>

            <Box sx={{ px: 2, pb: 1, display: 'flex', justifyContent: 'center' }}>
              <MuiToggleButtonGroup
                value={chatFontSize}
                exclusive
                onChange={(_, value: number | null): void => {
                  if (value) setChatFontSize(value);
                }}
                size="small"
                fullWidth
                sx={{
                  bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
                  p: 0.5,
                  '& .MuiToggleButton-root': {
                    border: 'none',
                    borderRadius: '8px !important',
                    mx: 0.25,
                    px: 1,
                    py: 0.5,
                    fontSize: '0.75rem',
                    fontWeight: 'bold',
                    color: 'text.secondary',
                    '&.Mui-selected': {
                      bgcolor: 'primary.main',
                      color: 'primary.contrastText',
                      '&:hover': {
                        bgcolor: 'primary.dark',
                      },
                    },
                  },
                }}>
                {[12, 14, 16, 18, 20, 24].map((size) => (
                  <MuiToggleButton
                    key={size}
                    value={size}>
                    {size}
                  </MuiToggleButton>
                ))}
              </MuiToggleButtonGroup>
            </Box>

            <Divider sx={{ my: 1, opacity: 0.6 }} />
          </Box>
          <Box hidden={parameterTab !== 0}>
            <ListSubheader
              sx={{
                lineHeight: '36px',
                fontWeight: 'bold',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                bgcolor: 'transparent',
              }}>
              Context Limit
            </ListSubheader>
            <Box sx={{ px: 3, py: 1 }}>
              <Box
                display="flex"
                justifyContent="space-between"
                mb={1}>
                <Typography
                  variant="caption"
                  color="text.secondary">
                  Recent messages:{' '}
                  {localMaxContext ??
                    topicStore.topics.find((t) => t.id === currentTopicId)?.maxContextMessages ??
                    defaultMaxContextMessages}
                </Typography>
              </Box>
              <Slider
                value={
                  localMaxContext ??
                  topicStore.topics.find((t) => t.id === currentTopicId)?.maxContextMessages ??
                  defaultMaxContextMessages
                }
                min={1}
                max={50}
                step={1}
                onChange={(_, value): void => {
                  setLocalMaxContext(value);
                }}
                onChangeCommitted={(_, value): void => {
                  if (currentTopicId) {
                    void topicStore.updateTopicMaxContextMessages(currentTopicId, value);
                    setLocalMaxContext(null);
                  }
                }}
                valueLabelDisplay="auto"
                size="small"
              />
            </Box>

            <Divider sx={{ my: 1, opacity: 0.6 }} />
          </Box>
          <Box
            role="tabpanel"
            id="chat-settings-panel-2"
            aria-labelledby="chat-settings-tab-2"
            hidden={parameterTab !== 2}>
            <ListSubheader
              sx={{
                lineHeight: '36px',
                fontWeight: 'bold',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                bgcolor: 'transparent',
              }}>
              Chat Tools
            </ListSubheader>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 1,
                px: 2,
                pb: 2,
                pt: 1,
              }}>
              <Tooltip title="Inspect the full LLM context payload">
                <IconButton
                  onClick={(): void => {
                    setShowContextDialog(true);
                    handleTempClose();
                  }}
                  disabled={!currentTopicId}
                  sx={{
                    borderRadius: 2,
                    flexDirection: 'column',
                    gap: 0.5,
                    py: 1,
                    border: (theme) => `1px solid ${theme.palette.divider}`,
                  }}>
                  <MenuBookOutlinedIcon fontSize="small" />
                  <Typography
                    variant="caption"
                    sx={{ fontSize: '0.65rem', fontWeight: 600 }}>
                    Inspect
                  </Typography>
                </IconButton>
              </Tooltip>

              <Tooltip title="View AI persistent memory">
                <IconButton
                  onClick={(): void => {
                    setShowScratchpadDialog(true);
                    handleTempClose();
                  }}
                  disabled={!currentTopicId}
                  sx={{
                    borderRadius: 2,
                    flexDirection: 'column',
                    gap: 0.5,
                    py: 1,
                    border: (theme) => `1px solid ${theme.palette.divider}`,
                  }}>
                  <EditNoteIcon fontSize="small" />
                  <Typography
                    variant="caption"
                    sx={{ fontSize: '0.65rem', fontWeight: 600 }}>
                    Scratchpad
                  </Typography>
                </IconButton>
              </Tooltip>

              {hasMiniMaxKey && (
                <Tooltip title={imageGenerationEnabled ? 'Image Gen: Active' : 'Image Gen: Inactive'}>
                  <IconButton
                    onClick={(): void => {
                      const nextState = !imageGenerationEnabled;
                      if (nextState) {
                        setWebSearchEnabled(false);
                        setMusicGenerationEnabled(false);
                        if (!inputValue.trim() || inputValue === MUSIC_TEMPLATE) setInputValue(IMAGE_TEMPLATE);
                      } else if (inputValue === IMAGE_TEMPLATE) {
                        setInputValue('');
                      }
                      setImageGenerationEnabled(nextState);
                    }}
                    disabled={sending}
                    aria-pressed={imageGenerationEnabled}
                    sx={{
                      borderRadius: 2,
                      flexDirection: 'column',
                      gap: 0.5,
                      py: 1,
                      border: (theme) =>
                        `1px solid ${imageGenerationEnabled ? alpha(theme.palette.secondary.main, 0.5) : theme.palette.divider}`,
                      bgcolor: (theme) =>
                        imageGenerationEnabled ? alpha(theme.palette.secondary.main, 0.08) : 'transparent',
                      color: imageGenerationEnabled ? 'secondary.main' : 'text.secondary',
                    }}>
                    <BrushIcon fontSize="small" />
                    <Typography
                      variant="caption"
                      sx={{ fontSize: '0.65rem', fontWeight: 600 }}>
                      Images
                    </Typography>
                  </IconButton>
                </Tooltip>
              )}

              {hasMiniMaxKey && (
                <Tooltip title={musicGenerationEnabled ? 'Music Gen: Active' : 'Music Gen: Inactive'}>
                  <IconButton
                    onClick={(): void => {
                      const nextState = !musicGenerationEnabled;
                      if (nextState) {
                        setWebSearchEnabled(false);
                        setImageGenerationEnabled(false);
                        if (!inputValue.trim() || inputValue === IMAGE_TEMPLATE) setInputValue(MUSIC_TEMPLATE);
                      } else if (inputValue === MUSIC_TEMPLATE) {
                        setInputValue('');
                      }
                      setMusicGenerationEnabled(nextState);
                    }}
                    disabled={sending}
                    aria-pressed={musicGenerationEnabled}
                    sx={{
                      borderRadius: 2,
                      flexDirection: 'column',
                      gap: 0.5,
                      py: 1,
                      border: (theme) =>
                        `1px solid ${musicGenerationEnabled ? alpha(theme.palette.secondary.main, 0.5) : theme.palette.divider}`,
                      bgcolor: (theme) =>
                        musicGenerationEnabled ? alpha(theme.palette.secondary.main, 0.08) : 'transparent',
                      color: musicGenerationEnabled ? 'secondary.main' : 'text.secondary',
                    }}>
                    <MusicNoteIcon fontSize="small" />
                    <Typography
                      variant="caption"
                      sx={{ fontSize: '0.65rem', fontWeight: 600 }}>
                      Music
                    </Typography>
                  </IconButton>
                </Tooltip>
              )}
            </Box>

            {ttsEnabled && <Divider sx={{ my: 1, opacity: 0.6 }} />}
            {ttsEnabled && (
              <ListSubheader
                sx={{
                  lineHeight: '36px',
                  fontWeight: 'bold',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  bgcolor: 'transparent',
                }}>
                TTS Voice
              </ListSubheader>
            )}
            {ttsEnabled && (
              <Box sx={{ px: 2, pb: 2 }}>
                <FormControl
                  fullWidth
                  size="small">
                  <InputLabel>Voice</InputLabel>
                  <Select
                    value={ttsVoiceId}
                    label="Voice"
                    onChange={(e: SelectChangeEvent): void => setTtsVoiceId(e.target.value)}>
                    {ENGLISH_VOICES.map((voice) => (
                      <MenuItem
                        key={voice.id}
                        value={voice.id}>
                        {voice.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            )}
          </Box>
        </Popover>

        {currentTopicId && showContextDialog && (
          <TopicContextDialog
            open={showContextDialog}
            topicId={currentTopicId}
            onClose={(): void => setShowContextDialog(false)}
            userMessagePreview={inputValue}
          />
        )}
        {currentTopicId && showScratchpadDialog && (
          <ScratchpadDialog
            open={showScratchpadDialog}
            topicId={currentTopicId}
            onClose={(): void => setShowScratchpadDialog(false)}
          />
        )}

        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          multiple
          accept="image/*"
          onChange={(e): void => {
            void handleFileSelect(e);
          }}
        />
        <input
          type="file"
          ref={cameraInputRef}
          style={{ display: 'none' }}
          accept="image/*"
          capture="environment"
          onChange={(e): void => {
            void handleFileSelect(e);
          }}
        />

        <Box
          display="flex"
          flexDirection="column"
          width="100%"
          gap={isExpanded ? 0.5 : 0}
          mb={attachments.length > 0 ? 0.5 : 0}>
          {isExpanded && (
            <Box
              display="flex"
              alignItems="center"
              gap={1}
              sx={{ borderBottom: 1, borderColor: 'divider', mb: 0.5 }}>
              <Tabs
                value={activePageIndex}
                onChange={handleTabChange}
                variant="scrollable"
                scrollButtons="auto"
                sx={{ minHeight: 32, height: 32 }}>
                {pages.map((page, index) => (
                  <Tab
                    key={page.id}
                    label={
                      <Box
                        display="flex"
                        alignItems="center"
                        gap={0.5}>
                        {page.title}
                        {pages.length > 1 && (
                          <IconButton
                            component="span"
                            size="small"
                            aria-label={`Delete page ${page.title}`}
                            onClick={(e): void => deletePage(index, e)}
                            sx={{ p: 0.25 }}>
                            <CloseIcon sx={{ fontSize: 12 }} />
                          </IconButton>
                        )}
                      </Box>
                    }
                    sx={{ minHeight: 32, height: 32, textTransform: 'none', fontSize: '0.75rem' }}
                  />
                ))}
              </Tabs>
              <IconButton
                size="small"
                aria-label="Add page"
                onClick={addPage}
                sx={{ ml: 0.5, p: 0.5 }}>
                <AddIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Box>
          )}

          {attachments.length > 0 && (
            <Box
              display="flex"
              flexWrap="wrap"
              gap={0.5}
              mb={0.5}
              px={1}>
              {attachments.map((att) => (
                <Box
                  key={att.id}
                  sx={{
                    position: 'relative',
                    width: 50,
                    height: 50,
                    borderRadius: 1,
                    overflow: 'hidden',
                    border: (theme) => `1px solid ${theme.palette.divider}`,
                    bgcolor: 'background.paper',
                  }}>
                  {att.previewUrl ? (
                    <img
                      src={att.previewUrl}
                      alt={att.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <Box
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      height="100%">
                      <AttachFileIcon fontSize="small" />
                    </Box>
                  )}
                  <IconButton
                    size="small"
                    aria-label={`Remove attachment ${att.name}`}
                    onClick={(): void => removeAttachment(att.id)}
                    sx={{
                      position: 'absolute',
                      top: 0,
                      right: 0,
                      p: 0.1,
                      bgcolor: 'rgba(0,0,0,0.5)',
                      color: 'white',
                      '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' },
                    }}>
                    <CloseIcon sx={{ fontSize: 10 }} />
                  </IconButton>
                </Box>
              ))}
            </Box>
          )}
        </Box>

        <Box
          ref={composerRowRef}
          data-layout={controlsInline ? 'inline' : 'stacked'}
          sx={{
            width: '100%',
            display: 'grid',
            gridTemplateColumns: controlsInline
              ? `auto minmax(${MIN_INLINE_INPUT_WIDTH}px, 1fr) auto`
              : 'minmax(0, 1fr) auto',
            alignItems: 'center',
            gap: 1,
          }}>
          {/* Left Actions (Icons) */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gridRow: controlsInline ? 1 : 2,
              gridColumn: 1,
              minWidth: 0,
              overflowX: 'auto',
              flexShrink: 0,
              gap: 0,
              mb: { xs: 0, md: 0.25 },
              pl: 0,
              width: 'max-content',
              maxWidth: '100%',
              justifyContent: 'flex-start',
              flexGrow: { xs: 1, md: 0 },
            }}>
            <Box
              ref={actionsRef}
              role="toolbar"
              aria-label="Message tools"
              sx={{ display: 'flex', width: 'max-content', flexShrink: 0 }}>
              {(topic?.forks?.length ?? 0) > 1 && onToggleForks && (
                <Tooltip
                  title={`${forksCollapsed ? 'Show' : 'Hide'} forks (${topic?.forks?.length ?? 0})`}
                  disableTouchListener={isMobile}>
                  <IconButton
                    onClick={onToggleForks}
                    disabled={sending}
                    color={!forksCollapsed ? 'primary' : 'default'}
                    aria-label="Toggle fork tabs"
                    sx={{ position: 'relative' }}>
                    <AccountTreeIcon />
                    <Box
                      component="span"
                      sx={{
                        position: 'absolute',
                        top: '1px',
                        right: '1px',
                        minWidth: 14,
                        height: 14,
                        borderRadius: '50%',
                        bgcolor: !forksCollapsed ? 'primary.main' : 'text.secondary',
                        color: 'background.paper',
                        fontSize: '0.55rem',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        px: '2px',
                        lineHeight: 1,
                      }}>
                      {topic?.forks?.length}
                    </Box>
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip
                title="Chat settings"
                disableTouchListener={isMobile}>
                <span>
                  <IconButton
                    onClick={handleTempClick}
                    disabled={sending}
                    color={topic?.maxContextMessages !== undefined ? 'primary' : 'default'}
                    aria-label="Chat settings">
                    <TuneIcon />
                  </IconButton>
                </span>
              </Tooltip>

              <Tooltip
                title="Attach File"
                disableTouchListener={isMobile}>
                <span>
                  <IconButton
                    onClick={(): void => fileInputRef.current?.click()}
                    disabled={sending}
                    aria-label="Attach file">
                    <AttachFileIcon />
                  </IconButton>
                </span>
              </Tooltip>

              {(showCameraButton === 'always' || (showCameraButton === 'auto' && isMobile)) && (
                <Tooltip
                  title="Camera"
                  disableTouchListener={isMobile}>
                  <span>
                    <IconButton
                      onClick={(): void => cameraInputRef.current?.click()}
                      disabled={sending}
                      aria-label="Camera">
                      <PhotoCameraIcon />
                    </IconButton>
                  </span>
                </Tooltip>
              )}

              {hasMiniMaxKey && (
                <Tooltip
                  title={`Auto-Read (${autoReadEnabled ? 'On' : 'Off'})`}
                  disableTouchListener={isMobile}>
                  <span>
                    <IconButton
                      onClick={(): void => setAutoReadEnabled(!autoReadEnabled)}
                      disabled={!ttsEnabled || sending}
                      color={autoReadEnabled ? 'primary' : 'default'}
                      aria-label="Toggle Auto-Read"
                      aria-pressed={autoReadEnabled}>
                      <VolumeUpIcon />
                    </IconButton>
                  </span>
                </Tooltip>
              )}

              {hasWebSearchProviderAvailable && (
                <Tooltip
                  title={
                    selectedModel.supportsTools
                      ? `Web Search (${webSearchEnabled ? 'Enabled' : 'Disabled'})`
                      : 'Web Search requires a model with tool support'
                  }
                  disableTouchListener={isMobile}>
                  <span>
                    <IconButton
                      onClick={(): void => {
                        const nextState = !webSearchEnabled;
                        if (nextState) {
                          setImageGenerationEnabled(false);
                          setMusicGenerationEnabled(false);
                        }
                        setWebSearchEnabled(nextState);
                      }}
                      disabled={sending || !selectedModel.supportsTools}
                      color={webSearchEnabled ? 'primary' : 'default'}
                      aria-label="Toggle Web Search"
                      aria-pressed={webSearchEnabled}>
                      <LanguageIcon />
                    </IconButton>
                  </span>
                </Tooltip>
              )}

              <Tooltip
                title="Predefined Prompts"
                disableTouchListener={isMobile}>
                <span>
                  <IconButton
                    onClick={handlePromptClick}
                    disabled={sending || predefinedPrompts.length === 0}
                    aria-label="Predefined Prompts"
                    color={hasSelectedPrompt ? 'primary' : 'default'}>
                    <PsychologyIcon />
                  </IconButton>
                </span>
              </Tooltip>

              <Menu
                anchorEl={promptAnchorEl}
                open={Boolean(promptAnchorEl)}
                onClose={handlePromptClose}
                PaperProps={{
                  sx: {
                    minWidth: 200,
                    maxHeight: 400,
                    mt: -1,
                  },
                }}>
                <ListSubheader sx={{ bgcolor: 'transparent', fontWeight: 'bold' }}>Predefined Prompts</ListSubheader>
                {predefinedPrompts.map((prompt) => {
                  const isSelected = topic?.selectedPromptIds?.includes(prompt.id) ?? false;
                  return (
                    <MenuItem
                      key={prompt.id}
                      onClick={(): void => {
                        if (!currentTopicId) return;
                        const currentIds = topic?.selectedPromptIds ?? [];
                        const newIds = isSelected
                          ? currentIds.filter((id) => id !== prompt.id)
                          : [...currentIds, prompt.id];
                        void topicStore.updateTopicPromptSelection(currentTopicId, newIds);
                      }}>
                      <ListItemText primary={prompt.name} />
                      <Box
                        sx={{
                          ml: 2,
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          bgcolor: isSelected ? 'primary.main' : 'transparent',
                          border: (theme) => `1px solid ${isSelected ? 'primary.main' : theme.palette.divider}`,
                        }}
                      />
                    </MenuItem>
                  );
                })}
                {predefinedPrompts.length === 0 && (
                  <MenuItem disabled>
                    <Typography variant="body2">No predefined prompts. Add some in settings.</Typography>
                  </MenuItem>
                )}
              </Menu>
            </Box>
          </Box>

          {/* Center (Input Field) */}
          <Box
            sx={{
              width: '100%',
              minWidth: 0,
              gridRow: 1,
              gridColumn: controlsInline ? 2 : '1 / -1',
              display: 'flex',
              flexDirection: 'column',
              mb: 0,
            }}>
            {attachments.length > 0 && (
              <Box
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 1,
                  mb: 1,
                  px: 1,
                }}>
                {attachments.map((file, idx) => (
                  <Chip
                    key={file.name + String(idx)}
                    label={file.name}
                    onDelete={(): void => {
                      setAttachments((prev) => prev.filter((_, i) => i !== idx));
                    }}
                    size="small"
                  />
                ))}
              </Box>
            )}
            <Box
              sx={{
                position: 'relative',
                width: '100%',
                borderRadius: 2,
              }}>
              <TextField
                id="athena-chat-input"
                fullWidth
                multiline
                inputRef={textFieldRef}
                maxRows={isExpanded ? undefined : 10}
                minRows={isExpanded ? (isMobile ? 15 : 30) : 1}
                placeholder={isMobile ? 'Message...' : 'Type your message...'}
                value={inputValue}
                onChange={(e): void => {
                  setInputValue(e.target.value);
                  questionRef.current = e.target.value;
                }}
                onKeyDown={handleKeyDown}
                disabled={sending}
                InputProps={{
                  className: 'athena-composer-input',
                  endAdornment: (
                    <InputAdornment
                      position="end"
                      sx={{
                        alignSelf: 'flex-end',
                        mb: 0,
                        mr: 0.5,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                      }}>
                      <Tooltip
                        title={isExpanded ? 'Collapse' : 'Expand'}
                        disableTouchListener={isMobile}>
                        <span>
                          <IconButton
                            onClick={(): void => setIsExpanded(!isExpanded)}
                            disabled={sending}
                            size="small"
                            aria-label={isExpanded ? 'Collapse message composer' : 'Expand message composer'}
                            sx={{
                              opacity: 0.4,
                              transition: 'opacity 0.2s',
                              '&:hover': {
                                opacity: 1,
                                backgroundColor: (theme: Theme) => alpha(theme.palette.action.active, 0.05),
                              },
                            }}>
                            {isExpanded ? <CloseFullscreenIcon /> : <OpenInFullIcon />}
                          </IconButton>
                        </span>
                      </Tooltip>
                    </InputAdornment>
                  ),
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2,
                    paddingTop: '6px !important',
                    paddingBottom: '6px !important',
                    fontSize: `${chatFontSize}px !important`,
                    lineHeight: '1.5 !important',
                    '& fieldset': {
                      borderColor: (theme: Theme) => alpha(theme.palette.primary.main, 0.4),
                    },
                    '&:hover fieldset': {
                      borderColor: (theme: Theme) => alpha(theme.palette.primary.main, 0.7),
                    },
                    '&.Mui-disabled fieldset': {
                      borderColor: 'action.disabledBackground',
                    },
                  },
                  '& .MuiInputBase-input': {
                    fontSize: `${chatFontSize}px !important`,
                    fontFamily: 'var(--font-family, inherit)',
                    lineHeight: '1.5 !important',
                  },
                  ...(isExpanded
                    ? {
                        '& .MuiInputBase-inputMultiline': {
                          maxHeight: isMobile ? '50vh' : '60vh',
                          overflowY: 'auto !important',
                        },
                      }
                    : {}),
                }}
              />
            </Box>
          </Box>

          {/* Right (Send Button) */}
          <Box
            ref={sendControlsRef}
            sx={{
              gridRow: controlsInline ? 1 : 2,
              gridColumn: controlsInline ? 3 : 2,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
            }}>
            {currentlySpeakingMessageId && (
              <Box
                display="flex"
                alignItems="center"
                sx={{
                  bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                  borderRadius: 4,
                  pr: 1,
                  py: 0.5,
                  animation: 'fadeIn 0.3s ease-out',
                  '@keyframes fadeIn': {
                    from: { opacity: 0, transform: 'translateX(10px)' },
                    to: { opacity: 1, transform: 'translateX(0)' },
                  },
                }}>
                <WaveformIndicator />
                <Typography
                  variant="caption"
                  color="primary.main"
                  sx={{ fontWeight: 'bold', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Speaking
                </Typography>
              </Box>
            )}
            <Tooltip
              title={
                sending
                  ? 'Stop Generation'
                  : currentlySpeakingMessageId
                    ? 'Stop Reading'
                    : isListening
                      ? 'Stop Voice Input'
                      : !inputValue.trim() && !attachments.length && isMobile
                        ? 'Start Voice Input'
                        : 'Send Message (Enter)'
              }
              disableTouchListener={isMobile}>
              <span>
                <IconButton
                  color={isListening ? 'error' : 'primary'}
                  aria-label={
                    sending
                      ? 'Stop Generation'
                      : currentlySpeakingMessageId
                        ? 'Stop Reading'
                        : isListening
                          ? 'Stop Voice Input'
                          : !inputValue.trim() && !attachments.length && isMobile
                            ? 'Start Voice Input'
                            : 'Send Message'
                  }
                  onClick={handleSendOrRecord}
                  disabled={
                    !sending &&
                    !inputValue.trim() &&
                    attachments.length === 0 &&
                    !isMobile &&
                    !isListening &&
                    !currentlySpeakingMessageId
                  }
                  sx={{
                    width: 52,
                    height: 52,
                    '&.Mui-disabled': {
                      backgroundColor: 'transparent',
                    },
                    ...(isListening || currentlySpeakingMessageId
                      ? {
                          animation: 'pulse 1.5s ease-in-out infinite',
                          '@keyframes pulse': {
                            '0%': { opacity: 1 },
                            '50%': { opacity: 0.5 },
                            '100%': { opacity: 1 },
                          },
                        }
                      : {}),
                  }}>
                  {sending ? (
                    <StopCircleIcon />
                  ) : isListening ? (
                    <MicIcon />
                  ) : currentlySpeakingMessageId && !inputValue.trim() && !attachments.length ? (
                    <StopCircleIcon />
                  ) : !inputValue.trim() && !attachments.length && isMobile ? (
                    <MicIcon />
                  ) : (
                    <SendIcon />
                  )}
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default Composer;
