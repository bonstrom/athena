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
import { useState, useRef } from "react";
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

interface MessageBubbleProps {
  message: Message;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const { updateMessageContext, deleteMessage, sendMessage, regenerateResponse } = useChatStore();
  const { forkTopic } = useTopicStore();
  const { addNotification } = useNotificationStore();
  const { userName } = useAuthStore();

  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [copied, setCopied] = useState(false);
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

        {isAssistant && message.content === "" && (
          <Box mt={1}>
            <TypingIndicator />
          </Box>
        )}

        {message.failed && (
          <Tooltip title="Retry">
            <IconButton
              onClick={(): void => {
                void sendMessage(message.content, message.topicId, message.id);
              }}
              color="inherit">
              <RefreshIcon />
            </IconButton>
          </Tooltip>
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
};

export default MessageBubble;
