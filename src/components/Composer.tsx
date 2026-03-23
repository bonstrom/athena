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
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import TuneIcon from "@mui/icons-material/Tune";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import CodeIcon from "@mui/icons-material/Code";
import AnalyticsIcon from "@mui/icons-material/Analytics";
import ForumIcon from "@mui/icons-material/Forum";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import CheckIcon from "@mui/icons-material/Check";
import EditNoteIcon from "@mui/icons-material/EditNote";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import CloseFullscreenIcon from "@mui/icons-material/CloseFullscreen";
import TopicContextDialog from "./TopicContextDialog";
import ScratchpadDialog from "./ScratchpadDialog";
import { useChatStore } from "../store/ChatStore";
import { useTopicStore } from "../store/TopicStore";
import { SCRATCHPAD_LIMIT } from "../constants";

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
  const { selectedModel, temperature, setTemperature, currentTopicId } = useChatStore();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [showContextDialog, setShowContextDialog] = useState(false);
  const [showScratchpadDialog, setShowScratchpadDialog] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [pages, setPages] = useState<Page[]>([{ id: crypto.randomUUID(), title: "Page 1", content: "" }]);
  const [activePageIndex, setActivePageIndex] = useState(0);
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

  useEffect(() => {
    if (!sending && textFieldRef.current) {
      textFieldRef.current.focus();
    }
  }, [sending]);

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
        maxWidth="md"
        display="flex"
        alignItems="flex-end"
        gap={1}>
        <Box
          display="flex"
          alignItems="center">
          <Tooltip title="Generation Settings">
            <span>
              <IconButton
                onClick={handleTempClick}
                disabled={sending}>
                <TuneIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title={isExpanded ? "Collapse" : "Expand"}>
            <span>
              <IconButton
                onClick={(): void => setIsExpanded(!isExpanded)}
                disabled={sending}>
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
              Temperature Presets
              {!selectedModel.supportsTemperature && (
                <Box
                  component="span"
                  sx={{ color: "error.main", ml: 1 }}>
                  (Not supported)
                </Box>
              )}
            </ListSubheader>

            <MenuItem
              onClick={(): void => handleTempSelect(0.0)}
              selected={temperature === 0.0}
              disabled={!selectedModel.supportsTemperature}
              sx={{ py: 1.5, px: 2, borderRadius: 1.5, mx: 1 }}>
              <CodeIcon
                fontSize="small"
                sx={{ mr: 2, color: "primary.main" }}
              />
              <ListItemText
                primary="Coding / Math"
                secondary="Deterministic and precise (0.0)"
                primaryTypographyProps={{ variant: "body2", fontWeight: 500 }}
                secondaryTypographyProps={{ variant: "caption" }}
              />
              {temperature === 0.0 && (
                <CheckIcon
                  fontSize="small"
                  color="primary"
                />
              )}
            </MenuItem>

            <MenuItem
              onClick={(): void => handleTempSelect(1.0)}
              selected={temperature === 1.0}
              disabled={!selectedModel.supportsTemperature}
              sx={{ py: 1.5, px: 2, borderRadius: 1.5, mx: 1 }}>
              <AnalyticsIcon
                fontSize="small"
                sx={{ mr: 2, color: "success.main" }}
              />
              <ListItemText
                primary="Data Analysis"
                secondary="Balanced and factual (1.0)"
                primaryTypographyProps={{ variant: "body2", fontWeight: 500 }}
                secondaryTypographyProps={{ variant: "caption" }}
              />
              {temperature === 1.0 && (
                <CheckIcon
                  fontSize="small"
                  color="primary"
                />
              )}
            </MenuItem>

            <MenuItem
              onClick={(): void => handleTempSelect(1.3)}
              selected={temperature === 1.3}
              disabled={!selectedModel.supportsTemperature}
              sx={{ py: 1.5, px: 2, borderRadius: 1.5, mx: 1 }}>
              <ForumIcon
                fontSize="small"
                sx={{ mr: 2, color: "info.main" }}
              />
              <ListItemText
                primary="General Chat"
                secondary="Natural and engaging (1.3)"
                primaryTypographyProps={{ variant: "body2", fontWeight: 500 }}
                secondaryTypographyProps={{ variant: "caption" }}
              />
              {temperature === 1.3 && (
                <CheckIcon
                  fontSize="small"
                  color="primary"
                />
              )}
            </MenuItem>

            <MenuItem
              onClick={(): void => handleTempSelect(1.5)}
              selected={temperature === 1.5}
              disabled={!selectedModel.supportsTemperature}
              sx={{ py: 1.5, px: 2, borderRadius: 1.5, mx: 1 }}>
              <AutoAwesomeIcon
                fontSize="small"
                sx={{ mr: 2, color: "warning.main" }}
              />
              <ListItemText
                primary="Creative Writing"
                secondary="Imaginative and varied (1.5)"
                primaryTypographyProps={{ variant: "body2", fontWeight: 500 }}
                secondaryTypographyProps={{ variant: "caption" }}
              />
              {temperature === 1.5 && (
                <CheckIcon
                  fontSize="small"
                  color="primary"
                />
              )}
            </MenuItem>

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

        {currentTopicId && (
          <>
            <TopicContextDialog
              open={showContextDialog}
              topicId={currentTopicId}
              onClose={(): void => setShowContextDialog(false)}
            />
            <ScratchpadDialog
              open={showScratchpadDialog}
              topicId={currentTopicId}
              onClose={(): void => setShowScratchpadDialog(false)}
            />
          </>
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

        <Tooltip title={isMobile ? "Send Message" : "Send Message (Ctrl + Enter)"}>
          <span>
            <IconButton
              onClick={handleSend}
              disabled={sending}>
              <SendIcon />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    </Box>
  );
};

export default Composer;
