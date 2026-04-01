import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Box,
  IconButton,
  TextField,
  Menu,
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
  CircularProgress,
} from "@mui/material";
import { Theme } from "@mui/material/styles";
import SendIcon from "@mui/icons-material/Send";
import StopCircleIcon from "@mui/icons-material/StopCircle";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import TuneIcon from "@mui/icons-material/Tune";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import CodeIcon from "@mui/icons-material/Code";
import AnalyticsIcon from "@mui/icons-material/Analytics";
import ForumIcon from "@mui/icons-material/Forum";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import PsychologyIcon from "@mui/icons-material/Psychology";
import EditNoteIcon from "@mui/icons-material/EditNote";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import CloseFullscreenIcon from "@mui/icons-material/CloseFullscreen";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import LanguageIcon from "@mui/icons-material/Language";
import TopicContextDialog from "./TopicContextDialog";
import ScratchpadDialog from "./ScratchpadDialog";
import { useAuthStore } from "../store/AuthStore";
import { llmSuggestionService } from "../services/llmSuggestionService";
import { useChatStore } from "../store/ChatStore";
import { useTopicStore } from "../store/TopicStore";
import { chatModels } from "./ModelSelector";
import { SCRATCHPAD_LIMIT, USD_TO_SEK } from "../constants";
import { Attachment } from "../database/AthenaDb";
import { useNotificationStore } from "../store/NotificationStore";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

interface ComposerProps {
  sending: boolean;
  onSend: (content: string, attachments?: Attachment[]) => void;
  isMobile: boolean;
}
interface Page {
  id: string;
  title: string;
  content: string;
}

const Composer: React.FC<ComposerProps> = ({ sending, onSend, isMobile }) => {
  const textFieldRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const questionRef = useRef("");
  const topicStore = useTopicStore();
  const { selectedModel, setSelectedModel, temperature, setTemperature, currentTopicId, stopSending } = useChatStore();
  const { addNotification } = useNotificationStore();
  const {
    chatWidth,
    setChatWidth,
    chatFontSize,
    setChatFontSize,
    openAiKey,
    deepSeekKey,
    googleApiKey,
    moonshotApiKey,
    predefinedPrompts,
    llmSuggestionEnabled,
    llmModelSelected,
    llmModelDownloadStatus,
  } = useAuthStore();
  const { webSearchEnabled, setWebSearchEnabled } = useChatStore();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [showContextDialog, setShowContextDialog] = useState(false);
  const [showScratchpadDialog, setShowScratchpadDialog] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [pages, setPages] = useState<Page[]>([{ id: crypto.randomUUID(), title: "Page 1", content: "" }]);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [localMaxContext, setLocalMaxContext] = useState<number | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [promptAnchorEl, setPromptAnchorEl] = useState<null | HTMLElement>(null);
  const [inputValue, setInputValue] = useState("");
  const [suggestion, setSuggestion] = useState("");
  const [isSuggesting, setIsSuggesting] = useState(false);
  const suggestionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const topic = topicStore.topics.find((t) => t.id === currentTopicId);

  const availableModels = chatModels.filter(
    (model) =>
      (model.provider === "openai" && openAiKey) ||
      (model.provider === "deepseek" && deepSeekKey) ||
      (model.provider === "google" && googleApiKey) ||
      (model.provider === "moonshot" && moonshotApiKey),
  );
  const openTempMenu = Boolean(anchorEl);

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

  const handleSend = (): void => {
    const currentContent = inputValue;
    const updatedPages = pages.map((p, i) => (i === activePageIndex ? { ...p, content: currentContent } : p));

    const combinedContent = updatedPages
      .filter((p) => p.content.trim())
      .map((p) => p.content.trim())
      .join("\n\n---\n\n");

    if (!combinedContent && attachments.length === 0) return;

    onSend(combinedContent, attachments);
    questionRef.current = "";
    setInputValue("");
    setPages([{ id: crypto.randomUUID(), title: "Page 1", content: "" }]);
    setActivePageIndex(0);
    setAttachments([]);
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
        content: "",
      };
      return [...updatedPrev, newPage];
    });

    setActivePageIndex(pages.length);
    setInputValue("");
    questionRef.current = "";
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
    const restoredContent = await stopSending();
    if (restoredContent) {
      setPages([{ id: crypto.randomUUID(), title: "Page 1", content: restoredContent }]);
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
        addNotification("File too large", `${file.name} exceeds the 10MB limit.`);
        continue;
      }

      try {
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (): void => {
            const result = reader.result;
            if (typeof result === "string") {
              resolve(result);
            } else {
              reject(new Error("Unexpected FileReader result type"));
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
          previewUrl: file.type.startsWith("image/") ? data : undefined,
        });
      } catch (err) {
        console.error("Failed to read file:", err);
        addNotification("Upload failed", `Could not read ${file.name}`);
      }
    }

    setAttachments((prev) => [...prev, ...newAttachments]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
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
    if (!sending && textFieldRef.current) {
      textFieldRef.current.focus();
    }
  }, [sending]);

  useEffect(() => {
    setLocalMaxContext(null);
  }, [currentTopicId]);

  // Load model into memory if enabled
  useEffect(() => {
    const modelMap = {
      "qwen-0.5b-chat": "Xenova/Qwen1.5-0.5B-Chat",
      "distilgpt2-q8": "Xenova/distilgpt2",
    } as const;
    const modelId = modelMap[llmModelSelected];
    const status = llmModelDownloadStatus[modelId] ?? "not_downloaded";

    if (llmSuggestionEnabled && status === "downloaded") {
      llmSuggestionService.loadModel(modelId, true, true);
    }
  }, [llmSuggestionEnabled, llmModelSelected, llmModelDownloadStatus]);

  const fetchSuggestion = useCallback(
    async (text: string) => {
      const modelMap = {
        "qwen-0.5b-chat": "Xenova/Qwen1.5-0.5B-Chat",
        "distilgpt2-q8": "Xenova/distilgpt2",
      };
      const modelId = modelMap[llmModelSelected];
      if (!llmSuggestionEnabled || llmModelDownloadStatus[modelId] !== "downloaded" || !text.trim()) {
        setSuggestion("");
        return;
      }

      setIsSuggesting(true);
      try {
        const result = await llmSuggestionService.getSuggestion(text);
        if (result && result.length > 0) {
          const cleaned = result.replace(/^\n+/, "");
          const firstLine = cleaned.split("\n")[0];
          setSuggestion(firstLine);
        } else {
          setSuggestion("");
        }
      } catch (err) {
        console.error("Suggestion error:", err);
        setSuggestion("");
      } finally {
        setIsSuggesting(false);
      }
    },
    [llmSuggestionEnabled, llmModelDownloadStatus, llmModelSelected],
  );

  useEffect(() => {
    if (suggestionTimeoutRef.current) {
      clearTimeout(suggestionTimeoutRef.current);
    }

    if (!inputValue.trim()) {
      setSuggestion("");
      return;
    }

    // Only fetch suggestion if the user has typed a space or newline (finished a word)
    if (!inputValue.endsWith(" ") && !inputValue.endsWith("\n")) {
      setSuggestion("");
      return;
    }

    suggestionTimeoutRef.current = setTimeout(() => {
      fetchSuggestion(inputValue).catch(console.error);
    }, 500); // 500ms debounce

    return () => {
      if (suggestionTimeoutRef.current) {
        clearTimeout(suggestionTimeoutRef.current);
      }
    };
  }, [inputValue, fetchSuggestion]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === "Tab" && suggestion) {
      e.preventDefault();
      const newValue = inputValue + suggestion;
      setInputValue(newValue);
      questionRef.current = newValue;
      setSuggestion("");
    }

    if (!isMobile && e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
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
      pb={isMobile ? 0.5 : 1.5}
      pt={isMobile ? 1 : 1.5}
      justifyContent="center"
      sx={{
        backgroundColor: (theme) => alpha(theme.palette.background.default, 0.85),
        backdropFilter: "blur(12px)",
        borderTop: (theme) => `1px solid ${theme.palette.divider}`,
        boxShadow: (theme) =>
          theme.palette.mode === "dark" ? "0 -4px 16px rgba(0,0,0,0.4)" : "0 -4px 16px rgba(0,0,0,0.05)",
        position: "relative",
        flexShrink: 0,
        zIndex: 10,
        maxHeight: "100%",
        display: "flex",
        flexDirection: "column",
      }}>
      <Box
        width="100%"
        maxWidth={chatWidth === "full" ? "100%" : chatWidth}
        display="flex"
        flexDirection="column"
        alignItems="stretch"
        gap={1}>
        <Menu
          anchorEl={anchorEl}
          open={openTempMenu}
          onClose={handleTempClose}
          transformOrigin={{ vertical: "bottom", horizontal: "left" }}
          anchorOrigin={{ vertical: "top", horizontal: "left" }}
          PaperProps={{
            sx: {
              minWidth: 260,
              mt: -1,
              border: (theme) => `1px solid ${theme.palette.divider}`,
              boxShadow: (theme) =>
                theme.palette.mode === "dark" ? "0 8px 32px rgba(0,0,0,0.4)" : "0 8px 32px rgba(0,0,0,0.1)",
              bgcolor: "background.paper",
            },
          }}>
          <ListSubheader
            sx={{
              lineHeight: "36px",
              fontWeight: "bold",
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              bgcolor: "transparent",
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
                  const selected = chatModels.find((m) => m.id === e.target.value);
                  if (selected) setSelectedModel(selected);
                }}
                sx={{
                  fontSize: "0.85rem",
                  "& .MuiSelect-select": {
                    py: 1,
                  },
                }}
                renderValue={(selected): React.ReactNode => {
                  const model = chatModels.find((m) => m.id === selected);
                  return model ? model.label : selected;
                }}>
                {availableModels.map((m) => (
                  <MenuItem
                    key={m.id}
                    value={m.id}>
                    <Box
                      display="flex"
                      justifyContent="space-between"
                      width="100%"
                      alignItems="center">
                      <Typography variant="body2">{m.label}</Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        ml={2}>
                        {`${(m.input * USD_TO_SEK).toFixed(0)}kr | ${(m.output * USD_TO_SEK).toFixed(0)}kr / 1M`}
                      </Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <Divider sx={{ my: 1, opacity: 0.6 }} />

          <ListSubheader
            sx={{
              lineHeight: "36px",
              fontWeight: "bold",
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              bgcolor: "transparent",
            }}>
            Temperature Presets
            {!selectedModel.supportsTemperature && (
              <Box
                component="span"
                sx={{ color: "error.main", ml: 1 }}>
                (Not supported)
              </Box>
            )}
          </ListSubheader>

          <Box sx={{ px: 2, pb: 1, display: "flex", justifyContent: "center" }}>
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
                bgcolor: (theme) => (theme.palette.mode === "dark" ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)"),
                p: 0.5,
                "& .MuiToggleButton-root": {
                  border: "none",
                  borderRadius: "8px !important",
                  mx: 0.25,
                  px: 1,
                  py: 0.5,
                  fontSize: "0.75rem",
                  fontWeight: "bold",
                  color: "text.secondary",
                  "&.Mui-selected": {
                    bgcolor: "primary.main",
                    color: "primary.contrastText",
                    "&:hover": {
                      bgcolor: "primary.dark",
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

          <Divider sx={{ my: 1, opacity: 0.6 }} />

          <ListSubheader
            sx={{
              lineHeight: "36px",
              fontWeight: "bold",
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              bgcolor: "transparent",
            }}>
            Layout Width
          </ListSubheader>

          <Box sx={{ px: 2, pb: 1, display: "flex", justifyContent: "center" }}>
            <MuiToggleButtonGroup
              value={chatWidth}
              exclusive
              onChange={(_, value: "sm" | "md" | "lg" | "full" | null): void => {
                if (value) setChatWidth(value);
              }}
              size="small"
              fullWidth
              sx={{
                bgcolor: (theme) => (theme.palette.mode === "dark" ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)"),
                p: 0.5,
                "& .MuiToggleButton-root": {
                  border: "none",
                  borderRadius: "8px !important",
                  mx: 0.25,
                  px: 1.5,
                  py: 0.5,
                  fontSize: "0.75rem",
                  fontWeight: "bold",
                  color: "text.secondary",
                  "&.Mui-selected": {
                    bgcolor: "primary.main",
                    color: "primary.contrastText",
                    "&:hover": {
                      bgcolor: "primary.dark",
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
              <MuiToggleButton value="full">
                <Tooltip
                  title="Full Width"
                  disableTouchListener={isMobile}>
                  <span>Full</span>
                </Tooltip>
              </MuiToggleButton>
            </MuiToggleButtonGroup>
          </Box>

          <Divider sx={{ my: 1, opacity: 0.6 }} />

          <ListSubheader
            sx={{
              lineHeight: "36px",
              fontWeight: "bold",
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              bgcolor: "transparent",
            }}>
            Font Size
          </ListSubheader>

          <Box sx={{ px: 2, pb: 1, display: "flex", justifyContent: "center" }}>
            <MuiToggleButtonGroup
              value={chatFontSize}
              exclusive
              onChange={(_, value: number | null): void => {
                if (value) setChatFontSize(value);
              }}
              size="small"
              fullWidth
              sx={{
                bgcolor: (theme) => (theme.palette.mode === "dark" ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)"),
                p: 0.5,
                "& .MuiToggleButton-root": {
                  border: "none",
                  borderRadius: "8px !important",
                  mx: 0.25,
                  px: 1,
                  py: 0.5,
                  fontSize: "0.75rem",
                  fontWeight: "bold",
                  color: "text.secondary",
                  "&.Mui-selected": {
                    bgcolor: "primary.main",
                    color: "primary.contrastText",
                    "&:hover": {
                      bgcolor: "primary.dark",
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

          <ListSubheader
            sx={{
              lineHeight: "36px",
              fontWeight: "bold",
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              bgcolor: "transparent",
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
                Recent messages:{" "}
                {localMaxContext ?? topicStore.topics.find((t) => t.id === currentTopicId)?.maxContextMessages ?? 10}
              </Typography>
            </Box>
            <Slider
              value={
                localMaxContext ?? topicStore.topics.find((t) => t.id === currentTopicId)?.maxContextMessages ?? 10
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

          <ListSubheader
            sx={{
              lineHeight: "36px",
              fontWeight: "bold",
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              bgcolor: "transparent",
            }}>
            Chat Tools
          </ListSubheader>

          <MenuItem
            onClick={(): void => {
              setShowContextDialog(true);
              handleTempClose();
            }}
            disabled={!currentTopicId}
            sx={{ py: 1.5, px: 2, borderRadius: 1.5, mx: 1, mb: 1 }}>
            <MenuBookOutlinedIcon
              fontSize="small"
              sx={{ mr: 2, color: "text.secondary" }}
            />
            <ListItemText
              primary="Edit Context"
              secondary="Manage pinned messages"
              primaryTypographyProps={{ variant: "body2", fontWeight: 500 }}
              secondaryTypographyProps={{ variant: "caption" }}
            />
          </MenuItem>

          <MenuItem
            onClick={(): void => {
              setShowScratchpadDialog(true);
              handleTempClose();
            }}
            disabled={!currentTopicId}
            sx={{ py: 1.5, px: 2, borderRadius: 1.5, mx: 1, mb: 1 }}>
            <EditNoteIcon
              fontSize="small"
              sx={{ mr: 2, color: "text.secondary" }}
            />
            <ListItemText
              primary="View Scratchpad"
              secondary={`AI persistent memory (${(topicStore.topics.find((t) => t.id === currentTopicId)?.scratchpad?.length ?? 0).toLocaleString()} / ${SCRATCHPAD_LIMIT.toLocaleString()})`}
              primaryTypographyProps={{ variant: "body2", fontWeight: 500 }}
              secondaryTypographyProps={{ variant: "caption" }}
            />
          </MenuItem>
        </Menu>

        {currentTopicId && showContextDialog && (
          <TopicContextDialog
            open={showContextDialog}
            topicId={currentTopicId}
            onClose={(): void => setShowContextDialog(false)}
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
          style={{ display: "none" }}
          multiple
          accept="image/*"
          onChange={(e): void => {
            void handleFileSelect(e);
          }}
        />
        <input
          type="file"
          ref={cameraInputRef}
          style={{ display: "none" }}
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
              sx={{ borderBottom: 1, borderColor: "divider", mb: 0.5 }}>
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
                            onClick={(e): void => deletePage(index, e)}
                            sx={{ p: 0.25 }}>
                            <CloseIcon sx={{ fontSize: 12 }} />
                          </IconButton>
                        )}
                      </Box>
                    }
                    sx={{ minHeight: 32, height: 32, textTransform: "none", fontSize: "0.75rem" }}
                  />
                ))}
              </Tabs>
              <IconButton
                size="small"
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
                    position: "relative",
                    width: 50,
                    height: 50,
                    borderRadius: 1,
                    overflow: "hidden",
                    border: (theme) => `1px solid ${theme.palette.divider}`,
                    bgcolor: "background.paper",
                  }}>
                  {att.previewUrl ? (
                    <img
                      src={att.previewUrl}
                      alt={att.name}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
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
                    onClick={(): void => removeAttachment(att.id)}
                    sx={{
                      position: "absolute",
                      top: 0,
                      right: 0,
                      p: 0.1,
                      bgcolor: "rgba(0,0,0,0.5)",
                      color: "white",
                      "&:hover": { bgcolor: "rgba(0,0,0,0.7)" },
                    }}>
                    <CloseIcon sx={{ fontSize: 10 }} />
                  </IconButton>
                </Box>
              ))}
            </Box>
          )}
        </Box>

        <Box
          sx={{
            width: "100%",
            display: "flex",
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "flex-end",
            columnGap: { xs: 0.5, md: 1 },
            rowGap: 0,
          }}>
          {/* Left Actions (Icons) */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              order: { xs: 2, md: 1 },
              flexShrink: 0,
              gap: 0,
              mb: { xs: 0, md: 0.25 },
              flexGrow: { xs: 1, md: 0 },
            }}>
            <Tooltip
              title="Parameters"
              disableTouchListener={isMobile}>
              <span>
                <IconButton
                  onClick={handleTempClick}
                  disabled={sending}
                  color={topic?.maxContextMessages !== undefined ? "primary" : "default"}
                  aria-label="Adjust parameters">
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

            {!isMobile && (
              <Tooltip
                title="Camera"
                disableTouchListener={isMobile}>
                <span>
                  <IconButton
                    disabled={sending}
                    aria-label="Camera">
                    <PhotoCameraIcon />
                  </IconButton>
                </span>
              </Tooltip>
            )}

            <Tooltip
              title={`Web Search (${webSearchEnabled ? "Enabled" : "Disabled"})`}
              disableTouchListener={isMobile}>
              <span>
                <IconButton
                  onClick={(): void => {
                    const nextState = !webSearchEnabled;
                    if (nextState && selectedModel.id !== "kimi-k2.5") {
                      const kimi = chatModels.find((m) => m.id === "kimi-k2.5");
                      if (kimi) setSelectedModel(kimi);
                    }
                    setWebSearchEnabled(nextState);
                  }}
                  disabled={sending}
                  color={webSearchEnabled ? "primary" : "default"}
                  aria-label="Toggle Web Search">
                  <LanguageIcon />
                </IconButton>
              </span>
            </Tooltip>

            <Tooltip
              title="Predefined Prompts"
              disableTouchListener={isMobile}>
              <span>
                <IconButton
                  onClick={handlePromptClick}
                  disabled={sending || predefinedPrompts.length === 0}
                  aria-label="Predefined Prompts">
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
              <ListSubheader sx={{ bgcolor: "transparent", fontWeight: "bold" }}>Predefined Prompts</ListSubheader>
              {predefinedPrompts.map((prompt) => {
                const topic = topicStore.topics.find((t) => t.id === currentTopicId);
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
                        borderRadius: "50%",
                        bgcolor: isSelected ? "primary.main" : "transparent",
                        border: (theme) => `1px solid ${isSelected ? "primary.main" : theme.palette.divider}`,
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

          {/* Center (Input Field) */}
          <Box
            sx={{
              flexGrow: { xs: 0, md: 1 },
              width: { xs: "100%", md: "auto" },
              order: { xs: 1, md: 2 },
              display: "flex",
              flexDirection: "column",
              mb: 0,
            }}>
            {attachments.length > 0 && (
              <Box
                sx={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 1,
                  mb: 1,
                  px: 1,
                }}>
                {attachments.map((file, idx) => (
                  <Chip
                    key={idx}
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
                position: "relative",
                width: "100%",
                borderRadius: 3,
                backgroundColor: (theme) =>
                  theme.palette.mode === "dark" ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                "&:hover": {
                  backgroundColor: (theme) =>
                    theme.palette.mode === "dark" ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
                },
              }}>
              {/* Suggestion overlay moved to InputProps */}
              <TextField
                fullWidth
                multiline
                inputRef={textFieldRef}
                maxRows={isExpanded ? 25 : 10}
                minRows={isExpanded ? 15 : 1}
                placeholder={isMobile ? "Message..." : "Type your message..."}
                value={inputValue}
                onChange={(e): void => {
                  setInputValue(e.target.value);
                  questionRef.current = e.target.value;
                  setSuggestion(""); // Clear suggestion immediately on change
                }}
                onKeyDown={handleKeyDown}
                disabled={sending}
                InputProps={{
                  startAdornment: suggestion ? (
                    <Box
                      sx={{
                        position: "absolute",
                        top: "1px",
                        left: "1px",
                        right: "1px",
                        bottom: "1px",
                        pt: "6px",
                        pb: "6px",
                        pl: "14px",
                        pr: "50px",
                        pointerEvents: "none",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        fontSize: `${chatFontSize}px !important`,
                        fontFamily: "var(--font-family, inherit)",
                        color: "transparent",
                        lineHeight: "1.5 !important",
                        overflow: "hidden",
                        display: "block",
                        zIndex: 1,
                      }}>
                      <span>{inputValue}</span>
                      <Box
                        component="span"
                        onClick={(e: React.MouseEvent): void => {
                          e.preventDefault();
                          e.stopPropagation();
                          const newValue = inputValue + suggestion;
                          setInputValue(newValue);
                          questionRef.current = newValue;
                          setSuggestion("");
                          setTimeout(() => {
                            if (textFieldRef.current) {
                              textFieldRef.current.focus();
                              const length = newValue.length;
                              textFieldRef.current.setSelectionRange(length, length);
                            }
                          }, 0);
                        }}
                        sx={{
                          color: "rgba(128, 128, 128, 0.5)",
                          pointerEvents: "auto",
                          cursor: "pointer",
                          "&:hover": { color: "rgba(128, 128, 128, 0.8)" },
                        }}>
                        {suggestion}
                        <Typography
                          component="span"
                          variant="caption"
                          sx={{
                            ml: 1,
                            bgcolor: "rgba(128, 128, 128, 0.1)",
                            px: 0.5,
                            borderRadius: 0.5,
                            fontSize: "0.6rem",
                            verticalAlign: "middle",
                          }}>
                          {isMobile ? "Tap to apply" : "Tab"}
                        </Typography>
                      </Box>
                    </Box>
                  ) : undefined,
                  endAdornment: (
                    <InputAdornment
                      position="end"
                      sx={{
                        alignSelf: "flex-end",
                        mb: 0,
                        mr: 0.5,
                        display: "flex",
                        alignItems: "center",
                        gap: 0.5,
                      }}>
                      {isSuggesting && (
                        <CircularProgress
                          size={16}
                          sx={{ mr: 1 }}
                        />
                      )}
                      <Tooltip
                        title={isExpanded ? "Collapse" : "Expand"}
                        disableTouchListener={isMobile}>
                        <span>
                          <IconButton
                            onClick={(): void => setIsExpanded(!isExpanded)}
                            disabled={sending}
                            size="small"
                            aria-label={isExpanded ? "Collapse message composer" : "Expand message composer"}
                            sx={{
                              opacity: 0.4,
                              transition: "opacity 0.2s",
                              "&:hover": {
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
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 3,
                    paddingTop: "6px !important",
                    paddingBottom: "6px !important",
                    fontSize: `${chatFontSize}px !important`,
                    lineHeight: "1.5 !important",
                    backgroundColor: "transparent",
                    transition: "background-color 0.2s",
                    "& fieldset": {
                      borderColor: (theme: Theme) => alpha(theme.palette.divider, 0.5),
                    },
                  },
                  "& .MuiInputBase-input": {
                    fontSize: `${chatFontSize}px !important`,
                    fontFamily: "var(--font-family, inherit)",
                    lineHeight: "1.5 !important",
                  },
                }}
              />
            </Box>
          </Box>

          {/* Right (Send Button) */}
          <Box
            sx={{
              order: 3,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
            }}>
            <Tooltip
              title={sending ? "Stop Generation" : isMobile ? "Send Message" : "Send Message (Enter)"}
              disableTouchListener={isMobile}>
              <span>
                <IconButton
                  color="primary"
                  onClick={sending ? handleStop : handleSend}
                  disabled={!inputValue.trim() && !attachments.length && !sending}
                  sx={{
                    width: 52,
                    height: 52,
                    "&.Mui-disabled": {
                      backgroundColor: "transparent",
                    },
                  }}>
                  {sending ? <StopCircleIcon /> : <SendIcon />}
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
