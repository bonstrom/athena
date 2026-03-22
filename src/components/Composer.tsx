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
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
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
import { useChatStore, SCRATCHPAD_LIMIT } from "../store/ChatStore";
import { useTopicStore } from "../store/TopicStore";

interface ComposerProps {
  sending: boolean;
  onSend: (content: string) => void;
  isMobile: boolean;
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
    onSend(questionRef.current);
    questionRef.current = "";
    if (textFieldRef.current) textFieldRef.current.value = "";
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

        <TextField
          inputRef={textFieldRef}
          fullWidth
          multiline
          inputProps={{ maxLength: 100000 }}
          maxRows={isExpanded ? 40 : 15}
          placeholder="Ask something..."
          onChange={(e): string => (questionRef.current = e.target.value)}
          onKeyDown={(e): void => {
            if (!isMobile && e.key === "Enter" && !e.shiftKey) {
              handleSend();
              e.preventDefault();
            }
          }}
          disabled={sending}
        />

        <IconButton
          onClick={handleSend}
          disabled={sending}>
          <SendIcon />
        </IconButton>
      </Box>
    </Box>
  );
};

export default Composer;
