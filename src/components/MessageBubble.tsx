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
} from "@mui/material";
import { useState } from "react";
import { useAuthStore } from "../store/AuthStore";
import MarkdownWithCode from "./MarkdownWithCode";
import TypingIndicator from "./TypingIndicator";
import RefreshIcon from "@mui/icons-material/Refresh";
import DeleteIcon from "@mui/icons-material/Delete";
import PushPinIcon from "@mui/icons-material/PushPin";
import PushPinOutlinedIcon from "@mui/icons-material/PushPinOutlined";
import { useChatStore } from "../store/ChatStore";
import { chatModels } from "./ModelSelector";
import { Message } from "../database/AthenaDb";
import { useNotificationStore } from "../store/NotificationStore";

interface MessageBubbleProps {
  message: Message;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const { updateMessageContext, deleteMessage, sendMessage, regenerateResponse } = useChatStore();
  const { addNotification } = useNotificationStore();
  const { userName } = useAuthStore();
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);

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

  return (
    <Paper
      sx={{
        p: 2,
        width: "100%",
        borderRadius: 3,
        bgcolor: (theme): string | undefined => {
          if (message.failed) return theme.palette.error.main;
          if (message.type === "assistant") return theme.palette.assistant.main;
          if (message.type === "aiNote") return theme.palette.aiNote.main;
          return undefined;
        },
        color: (theme): string | undefined => {
          if (message.failed) return "white";
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
          <Typography
            variant="subtitle2"
            color="text.secondary">
            {message.type === "user" ? userName : getModelLabel(message.model)}
          </Typography>

          <Box
            display="flex"
            alignItems="center">
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ mr: 1 }}>
              {`${message.totalCost.toFixed(3)} kr • ${new Intl.DateTimeFormat("sv-SE", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              }).format(new Date(message.created))}`}
            </Typography>

            <Tooltip title="Delete message">
              <IconButton
                size="small"
                onClick={handleDeleteClick}>
                <DeleteIcon />
              </IconButton>
            </Tooltip>

            <Tooltip title={message.includeInContext ? "Unpin from context" : "Pin to context"}>
              <IconButton
                size="small"
                onClick={(): void => {
                  void togglePin();
                }}>
                {message.includeInContext ? <PushPinIcon /> : <PushPinOutlinedIcon />}
              </IconButton>
            </Tooltip>
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

        {isAssistant && message.content !== "" && !message.failed && (
          <Box
            display="flex"
            justifyContent="flex-end"
            mt={-1}>
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
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Tooltip>
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
};

export default MessageBubble;
