import {
  Box,
  IconButton,
  Paper,
  Tooltip,
  Typography,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Zoom,
  alpha,
} from "@mui/material";
import { useState, useRef, memo } from "react";
import { useAuthStore } from "../store/AuthStore";
import MarkdownWithCode from "./MarkdownWithCode";
import TypingIndicator from "./TypingIndicator";
import RefreshIcon from "@mui/icons-material/Refresh";
import DeleteIcon from "@mui/icons-material/Delete";
import PushPinIcon from "@mui/icons-material/PushPin";
import PushPinOutlinedIcon from "@mui/icons-material/PushPinOutlined";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import { useChatStore } from "../store/ChatStore";
import { chatModels } from "./ModelSelector";
import { Message } from "../database/AthenaDb";
import { useNotificationStore } from "../store/NotificationStore";
import { useTopicStore } from "../store/TopicStore";
import AltRouteIcon from "@mui/icons-material/AltRoute";
import PsychologyIcon from "@mui/icons-material/Psychology";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";

interface MessageBubbleProps {
  message: Message;
  versions?: Message[];
}

const MessageBubble: React.FC<MessageBubbleProps> = memo(function MessageBubble({ message, versions }) {
  const { updateMessageContext, deleteMessage, sendMessageStream, regenerateResponse, switchMessageVersion } =
    useChatStore();
  const { forkTopic } = useTopicStore();
  const { addNotification } = useNotificationStore();
  const { userName } = useAuthStore();

  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showReasoning, setShowReasoning] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isAssistant = message.type === "assistant";

  const togglePin = async (): Promise<void> => {
    try {
      await updateMessageContext(message.id, !message.includeInContext);
    } catch (err) {
      console.error("Failed to update context pin:", err);
      const message = err instanceof Error ? err.message : String(err);
      addNotification("Failed to update context pin", message);
    }
  };

  const handleDeleteClick = (): void => {
    setOpenDeleteDialog(true);
  };

  const handleCloseDeleteDialog = (): void => {
    setOpenDeleteDialog(false);
  };

  const handleConfirmDelete = async (): Promise<void> => {
    try {
      await deleteMessage(message.id);
      setOpenDeleteDialog(false);
    } catch (err) {
      console.error("Failed to delete message:", err);
      const message = err instanceof Error ? err.message : String(err);
      addNotification("Failed to delete message", message);
    }
  };

  const getModelLabel = (id?: string): string => {
    return chatModels.find((m) => m.id === id)?.label ?? id ?? "Unknown model";
  };

  const handleMouseEnter = (): void => {
    timeoutRef.current = setTimeout(() => {
      setTooltipOpen(true);
    }, 700);
  };

  const handleMouseLeave = (): void => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setTooltipOpen(false);
  };

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    } catch (err) {
      console.error("Failed to copy message:", err);
      addNotification("Error", "Failed to copy message");
    }
  };

  const handleFork = async (): Promise<void> => {
    try {
      await forkTopic(message.topicId, message.id);
    } catch (err) {
      console.error("Failed to fork conversation:", err);
      const message = err instanceof Error ? err.message : String(err);
      addNotification("Failed to fork conversation", message);
    }
  };

  return (
    <Paper
      sx={{
        p: 2,
        width: "100%",
        borderRadius: 3,
        border: message.failed ? (theme): string => `1px solid ${theme.palette.error.main}` : "none",
        bgcolor: (theme): string | undefined => {
          if (message.failed) return alpha(theme.palette.error.main, 0.1);
          if (message.type === "assistant") return theme.palette.assistant.main;
          if (message.type === "aiNote") return theme.palette.aiNote.main;
          return undefined;
        },
        color: (theme): string | undefined => {
          if (message.failed) return theme.palette.text.primary;
          if (message.type === "assistant") return theme.palette.assistant.contrastText;
          if (message.type === "aiNote") return theme.palette.aiNote.contrastText;
          return undefined;
        },
      }}>
      <Box sx={{ width: "100%" }}>
        <Box
          display="flex"
          justifyContent="space-between"
          mb={0.5}>
          <Box
            display="flex"
            alignItems="center">
            <Tooltip
              open={tooltipOpen}
              title={
                <Box>
                  <Typography
                    variant="caption"
                    display="block">
                    {new Intl.DateTimeFormat("sv-SE", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    }).format(new Date(message.created))}
                  </Typography>
                  <Typography
                    variant="caption"
                    display="block">
                    {`${message.totalCost.toFixed(3)} kr`}
                  </Typography>
                  {message.latencyMs && (
                    <>
                      <Typography
                        variant="caption"
                        display="block">
                        {`Time: ${(message.latencyMs / 1000).toFixed(1)} s`}
                      </Typography>
                      <Typography
                        variant="caption"
                        display="block">
                        {`Speed: ${(
                          (message.promptTokens + message.completionTokens) /
                          (message.latencyMs / 1000)
                        ).toFixed(1)} TPS`}
                      </Typography>
                    </>
                  )}
                </Box>
              }>
              <Typography
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                variant="subtitle2"
                color="text.secondary"
                sx={{ cursor: "default", display: "inline-block" }}>
                {message.type === "user" ? userName : getModelLabel(message.model)}
              </Typography>
            </Tooltip>

            {isAssistant && versions && versions.length > 1 && (
              <Box
                display="flex"
                alignItems="center"
                ml={1.5}
                sx={{
                  bgcolor: (theme): string =>
                    theme.palette.mode === "dark" ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.03)",
                  borderRadius: 1.5,
                  px: 0.5,
                  height: 24,
                }}>
                <IconButton
                  size="small"
                  disabled={versions.findIndex((v) => v.id === message.id) === 0}
                  onClick={(): void => {
                    const currentIndex = versions.findIndex((v) => v.id === message.id);
                    if (currentIndex > 0 && message.parentMessageId) {
                      void switchMessageVersion(message.parentMessageId, versions[currentIndex - 1].id);
                    }
                  }}
                  sx={{ p: 0.25, color: "text.secondary" }}>
                  <ExpandLessIcon
                    fontSize="small"
                    sx={{ transform: "rotate(-90deg)", fontSize: "1.1rem" }}
                  />
                </IconButton>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ mx: 0.5, fontWeight: "bold", minWidth: "2.5em", textAlign: "center", fontSize: "0.7rem" }}>
                  {`${versions.findIndex((v) => v.id === message.id) + 1} / ${versions.length}`}
                </Typography>
                <IconButton
                  size="small"
                  disabled={versions.findIndex((v) => v.id === message.id) === versions.length - 1}
                  onClick={(): void => {
                    const currentIndex = versions.findIndex((v) => v.id === message.id);
                    if (currentIndex < versions.length - 1 && message.parentMessageId) {
                      void switchMessageVersion(message.parentMessageId, versions[currentIndex + 1].id);
                    }
                  }}
                  sx={{ p: 0.25, color: "text.secondary" }}>
                  <ExpandMoreIcon
                    fontSize="small"
                    sx={{ transform: "rotate(-90deg)", fontSize: "1.1rem" }}
                  />
                </IconButton>
              </Box>
            )}
          </Box>

          <Box
            display="flex"
            alignItems="center"
            gap={1}>
            {/* Group 1: Regenerate and Delete */}
            <Box
              display="flex"
              alignItems="center"
              gap={0.5}
              mr={2}>
              {isAssistant && message.content !== "" && !message.failed && (
                <Tooltip title="Regenerate response">
                  <IconButton
                    size="small"
                    onClick={(): void => {
                      void regenerateResponse(message.id);
                    }}
                    sx={{
                      color: (theme): string =>
                        theme.palette.mode === "dark" ? "rgba(255, 255, 255, 0.5)" : "rgba(0, 0, 0, 0.5)",
                      "&:hover": {
                        bgcolor: (theme): string =>
                          theme.palette.mode === "dark" ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                      },
                    }}>
                    <Box
                      position="relative"
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      sx={{ width: 20, height: 20 }}>
                      <Zoom
                        in
                        timeout={200}>
                        <RefreshIcon fontSize="small" />
                      </Zoom>
                    </Box>
                  </IconButton>
                </Tooltip>
              )}

              <Tooltip title="Delete message">
                <IconButton
                  size="small"
                  onClick={handleDeleteClick}
                  sx={{
                    color: (theme): string =>
                      theme.palette.mode === "dark" ? "rgba(255, 255, 255, 0.5)" : "rgba(0, 0, 0, 0.5)",
                    "&:hover": {
                      bgcolor: (theme): string =>
                        theme.palette.mode === "dark" ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                    },
                  }}>
                  <Box
                    position="relative"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    sx={{ width: 20, height: 20 }}>
                    <Zoom
                      in
                      timeout={200}>
                      <DeleteIcon fontSize="small" />
                    </Zoom>
                  </Box>
                </IconButton>
              </Tooltip>
            </Box>

            {/* Group 2: Copy and Pin */}
            <Box
              display="flex"
              alignItems="center"
              gap={0.5}>
              {isAssistant && message.content !== "" && !message.failed && (
                <Tooltip title="Fork conversation here">
                  <IconButton
                    size="small"
                    onClick={(): void => {
                      void handleFork();
                    }}
                    sx={{
                      color: (theme): string =>
                        theme.palette.mode === "dark" ? "rgba(255, 255, 255, 0.5)" : "rgba(0, 0, 0, 0.5)",
                      "&:hover": {
                        bgcolor: (theme): string =>
                          theme.palette.mode === "dark" ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                      },
                    }}>
                    <Box
                      position="relative"
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      sx={{ width: 20, height: 20 }}>
                      <Zoom
                        in
                        timeout={200}>
                        <AltRouteIcon
                          fontSize="small"
                          sx={{ transform: "rotate(90deg)" }}
                        />
                      </Zoom>
                    </Box>
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title={copied ? "Copied!" : "Copy message"}>
                <IconButton
                  size="small"
                  onClick={(): void => {
                    void handleCopy();
                  }}
                  sx={{
                    color: (theme): string =>
                      theme.palette.mode === "dark" ? "rgba(255, 255, 255, 0.5)" : "rgba(0, 0, 0, 0.5)",
                    "&:hover": {
                      bgcolor: (theme): string =>
                        theme.palette.mode === "dark" ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                    },
                  }}>
                  <Box
                    position="relative"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    sx={{ width: 20, height: 20 }}>
                    <Zoom
                      in={!copied}
                      timeout={200}
                      unmountOnExit>
                      <ContentCopyIcon
                        fontSize="small"
                        sx={{ position: "absolute" }}
                      />
                    </Zoom>
                    <Zoom
                      in={copied}
                      timeout={200}
                      unmountOnExit>
                      <CheckIcon
                        fontSize="small"
                        color="success"
                        sx={{ position: "absolute" }}
                      />
                    </Zoom>
                  </Box>
                </IconButton>
              </Tooltip>

              <Tooltip title={message.includeInContext ? "Unpin from context" : "Pin to context"}>
                <IconButton
                  size="small"
                  onClick={(): void => {
                    void togglePin();
                  }}
                  sx={{
                    color: (theme): string =>
                      theme.palette.mode === "dark" ? "rgba(255, 255, 255, 0.5)" : "rgba(0, 0, 0, 0.5)",
                    "&:hover": {
                      bgcolor: (theme): string =>
                        theme.palette.mode === "dark" ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                    },
                  }}>
                  <Box
                    position="relative"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    sx={{ width: 20, height: 20 }}>
                    <Zoom
                      in={!message.includeInContext}
                      timeout={200}
                      unmountOnExit>
                      <PushPinOutlinedIcon
                        fontSize="small"
                        sx={{ position: "absolute" }}
                      />
                    </Zoom>
                    <Zoom
                      in={message.includeInContext}
                      timeout={200}
                      unmountOnExit>
                      <PushPinIcon
                        fontSize="small"
                        sx={{ position: "absolute" }}
                      />
                    </Zoom>
                  </Box>
                </IconButton>
              </Tooltip>
            </Box>

            {/* Group 3: Reasoning Toggle */}
            {message.reasoning && (
              <Box
                display="flex"
                alignItems="center">
                <Tooltip title={showReasoning ? "Hide Reasoning" : "Show Reasoning"}>
                  <Button
                    size="small"
                    onClick={(): void => setShowReasoning(!showReasoning)}
                    sx={{
                      minWidth: 40,
                      p: "4px",
                      borderRadius: 1.5,
                      display: "flex",
                      gap: 0.25,
                      color: (theme): string =>
                        theme.palette.mode === "dark" ? "rgba(255, 255, 255, 0.7)" : "rgba(0, 0, 0, 0.6)",
                      "&:hover": {
                        bgcolor: (theme): string =>
                          theme.palette.mode === "dark" ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                      },
                    }}>
                    <PsychologyIcon fontSize="small" />
                    {showReasoning ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                  </Button>
                </Tooltip>
              </Box>
            )}
          </Box>
        </Box>

        <Box sx={{ overflowX: "auto" }}>
          {message.type === "aiNote" ? (
            <Typography
              variant="body2"
              fontStyle="italic"
              color="text.secondary">
              {getModelLabel(message.model)} stored a hidden note here.
            </Typography>
          ) : (
            <MarkdownWithCode>{message.content}</MarkdownWithCode>
          )}
        </Box>

        {showReasoning && message.reasoning && (
          <Box
            sx={{
              mt: 1.5,
              mb: 1.5,
              p: 1.5,
              borderRadius: 2,
              bgcolor: (theme): string => (theme.palette.mode === "dark" ? alpha("#fff", 0.05) : alpha("#000", 0.03)),
              borderLeft: (theme): string => `4px solid ${alpha(theme.palette.text.secondary, 0.2)}`,
            }}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontWeight: "bold", mb: 0.5, display: "block", textTransform: "uppercase" }}>
              Reasoning
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ whiteSpace: "pre-wrap", fontStyle: "italic", fontSize: "0.85rem" }}>
              {message.reasoning}
            </Typography>
          </Box>
        )}

        {isAssistant && message.content === "" && (
          <Box mt={1}>
            <TypingIndicator />
          </Box>
        )}

        {message.failed && (
          <Box
            sx={{
              mt: 2,
              p: 2,
              borderRadius: 2,
              bgcolor: (theme) => alpha(theme.palette.error.main, 0.05),
              border: (theme) => `1px dashed ${alpha(theme.palette.error.main, 0.3)}`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 1,
            }}>
            <Typography
              variant="body2"
              color="error"
              sx={{ fontWeight: "bold" }}>
              Message delivery failed
            </Typography>
            <Button
              variant="contained"
              color="error"
              size="small"
              startIcon={<RefreshIcon />}
              onClick={(): void => {
                void sendMessageStream(message.content, message.topicId, message.id);
              }}
              sx={{ textTransform: "none" }}>
              Retry Sending
            </Button>
          </Box>
        )}
      </Box>

      <Dialog
        open={openDeleteDialog}
        onClose={handleCloseDeleteDialog}>
        <DialogTitle>Delete Message</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this message? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDeleteDialog}>Cancel</Button>
          <Button
            onClick={(): void => {
              void handleConfirmDelete();
            }}
            color="error"
            variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
});

export default MessageBubble;
