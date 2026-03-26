import React, { useEffect, useRef, useState } from "react";
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
} from "@mui/material";
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
import EditNoteIcon from "@mui/icons-material/EditNote";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import CloseFullscreenIcon from "@mui/icons-material/CloseFullscreen";
import TopicContextDialog from "./TopicContextDialog";
import ScratchpadDialog from "./ScratchpadDialog";
import { useAuthStore } from "../store/AuthStore";
import { useChatStore } from "../store/ChatStore";
import { useTopicStore } from "../store/TopicStore";
import { chatModels } from "./ModelSelector";
import { SCRATCHPAD_LIMIT, USD_TO_SEK } from "../constants";

interface ComposerProps {
  sending: boolean;
  onSend: (content: string) => void;
  isMobile: boolean;
}
interface Page {
  id: string;
  title: string;
  content: string;
}

const Composer: React.FC<ComposerProps> = ({ sending, onSend, isMobile }) => {
  const textFieldRef = useRef<HTMLInputElement>(null);
  const questionRef = useRef("");
  const topicStore = useTopicStore();
  const { selectedModel, setSelectedModel, temperature, setTemperature, currentTopicId, stopSending } = useChatStore();
  const {
    chatWidth,
    setChatWidth,
    chatFontSize,
    setChatFontSize,
    openAiKey,
    deepSeekKey,
    googleApiKey,
    moonshotApiKey,
  } = useAuthStore();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [showContextDialog, setShowContextDialog] = useState(false);
  const [showScratchpadDialog, setShowScratchpadDialog] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [pages, setPages] = useState<Page[]>([{ id: crypto.randomUUID(), title: "Page 1", content: "" }]);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [localMaxContext, setLocalMaxContext] = useState<number | null>(null);

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
    const currentContent = textFieldRef.current?.value ?? "";
    const updatedPages = pages.map((p, i) => (i === activePageIndex ? { ...p, content: currentContent } : p));

    const combinedContent = updatedPages
      .filter((p) => p.content.trim())
      .map((p) => p.content.trim())
      .join("\n\n---\n\n");

    if (!combinedContent) return;

    onSend(combinedContent);
    questionRef.current = "";
    if (textFieldRef.current) textFieldRef.current.value = "";
    setPages([{ id: crypto.randomUUID(), title: "Page 1", content: "" }]);
    setActivePageIndex(0);
  };

  const handleTabChange = (_: React.SyntheticEvent, newValue: number): void => {
    const currentContent = textFieldRef.current?.value ?? "";
    setPages((prev) => prev.map((p, i) => (i === activePageIndex ? { ...p, content: currentContent } : p)));

    const targetPage = pages[newValue];
    if (textFieldRef.current) {
      textFieldRef.current.value = targetPage.content;
      questionRef.current = targetPage.content;
    }
    setActivePageIndex(newValue);
  };

  const addPage = (): void => {
    const currentContent = textFieldRef.current?.value ?? "";
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

    if (textFieldRef.current) {
      textFieldRef.current.value = "";
      questionRef.current = "";
    }
  };

  const deletePage = (index: number, e: React.MouseEvent): void => {
    e.stopPropagation();
    if (pages.length <= 1) return;

    const currentContent = textFieldRef.current?.value ?? "";
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
      if (textFieldRef.current) {
        textFieldRef.current.value = targetContent;
        questionRef.current = targetContent;
      }
    }
  };

  const handleStop = async (): Promise<void> => {
    const restoredContent = await stopSending();
    if (restoredContent) {
      setPages([{ id: crypto.randomUUID(), title: "Page 1", content: restoredContent }]);
      setActivePageIndex(0);
      if (textFieldRef.current) {
        textFieldRef.current.value = restoredContent;
        questionRef.current = restoredContent;
      }
    }
  };

  useEffect(() => {
    if (!sending && textFieldRef.current) {
      textFieldRef.current.focus();
    }
  }, [sending]);

  useEffect(() => {
    setLocalMaxContext(null);
  }, [currentTopicId]);

  return (
    <Box
      display="flex"
      alignItems="center"
      gap={1}
      px={2}
      pb={2}
      pt={1}
      justifyContent="center"
      sx={{
        backgroundColor: (theme) => theme.palette.background.default,
        position: "sticky",
        bottom: 0,
      }}>
      <Box
        width="100%"
        maxWidth={chatWidth === "full" ? "100%" : chatWidth}
        display="flex"
        alignItems="flex-end"
        gap={1}>
        <Box
          display="flex"
          alignItems="center">
          <Tooltip
            title="Topic Settings"
            disableTouchListener={isMobile}>
            <span>
              <IconButton
                onClick={handleTempClick}
                disabled={sending}
                aria-label="Topic Settings">
                <TuneIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip
            title={isExpanded ? "Collapse" : "Expand"}
            disableTouchListener={isMobile}>
            <span>
              <IconButton
                onClick={(): void => setIsExpanded(!isExpanded)}
                disabled={sending}
                aria-label={isExpanded ? "Collapse message composer" : "Expand message composer"}>
                {isExpanded ? <CloseFullscreenIcon /> : <OpenInFullIcon />}
              </IconButton>
            </span>
          </Tooltip>
          <Menu
            anchorEl={anchorEl}
            open={openTempMenu}
            onClose={handleTempClose}
            transformOrigin={{ vertical: "bottom", horizontal: "left" }}
            anchorOrigin={{ vertical: "top", horizontal: "left" }}
            PaperProps={{
              sx: {
                borderRadius: 3,
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
        </Box>

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

        <Box
          display="flex"
          flexDirection="column"
          width="100%"
          gap={isExpanded ? 1 : 0}>
          {isExpanded && (
            <Box
              display="flex"
              alignItems="center"
              gap={1}
              sx={{ borderBottom: 1, borderColor: "divider", mb: 1 }}>
              <Tabs
                value={activePageIndex}
                onChange={handleTabChange}
                variant="scrollable"
                scrollButtons="auto"
                sx={{ minHeight: 40, height: 40 }}>
                {pages.map((page, index) => (
                  <Tab
                    key={page.id}
                    label={
                      <Box
                        display="flex"
                        alignItems="center"
                        gap={1}>
                        {page.title}
                        {pages.length > 1 && (
                          <IconButton
                            component="span"
                            size="small"
                            onClick={(e): void => deletePage(index, e)}
                            sx={{ p: 0.5 }}>
                            <CloseIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        )}
                      </Box>
                    }
                    sx={{ minHeight: 40, height: 40, textTransform: "none", fontSize: "0.8rem" }}
                  />
                ))}
              </Tabs>
              <IconButton
                size="small"
                onClick={addPage}
                sx={{ ml: 1 }}>
                <AddIcon fontSize="small" />
              </IconButton>
            </Box>
          )}

          <TextField
            inputRef={textFieldRef}
            fullWidth
            multiline
            inputProps={{ maxLength: 100000 }}
            rows={isExpanded ? undefined : undefined}
            minRows={isExpanded ? undefined : 1}
            maxRows={isExpanded ? undefined : 15}
            placeholder="Ask something..."
            sx={{
              "& .MuiInputBase-root": {
                height: isExpanded ? "80vh" : "auto",
                minHeight: isExpanded ? "80vh" : "auto",
                alignItems: "start",
                overflow: "auto",
              },
              "& textarea": {
                height: isExpanded ? "100% !important" : "auto",
                overflow: "auto !important",
              },
            }}
            onChange={(e): string => (questionRef.current = e.target.value)}
            onKeyDown={(e): void => {
              if (!isMobile && e.key === "Enter" && e.ctrlKey) {
                handleSend();
                e.preventDefault();
              }
            }}
            disabled={sending}
          />
        </Box>

        <Tooltip
          title={sending ? "Stop Generation" : isMobile ? "Send Message" : "Send Message (Ctrl + Enter)"}
          disableTouchListener={isMobile}>
          <span>
            <IconButton
              onClick={sending ? handleStop : handleSend}
              disabled={false}
              color={sending ? "error" : "primary"}
              aria-label={sending ? "Stop generating" : "Send message"}>
              {sending ? <StopCircleIcon /> : <SendIcon />}
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    </Box>
  );
};

export default Composer;
