import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  List,
  ListItem,
  Checkbox,
  Box,
  CircularProgress,
  Paper,
} from "@mui/material";

import { useChatStore } from "../store/ChatStore";
import { Message } from "../database/AthenaDb";
import { useNotificationStore } from "../store/NotificationStore";
import { useTopicStore } from "../store/TopicStore";

interface TopicContextDialogProps {
  open: boolean;
  topicId: string | null;
  onClose: () => void;
}

const TopicContextDialog: React.FC<TopicContextDialogProps> = ({ open, topicId, onClose }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const { updateMessageContext } = useChatStore();

  const { addNotification } = useNotificationStore();

  useEffect(() => {
    if (!open || !topicId) return;

    setLoading(true);

    useTopicStore.getState().getTopicContext(topicId)
      .then((contextMessages) => {
        setMessages(contextMessages);
        const pinned = contextMessages.filter((m) => m.includeInContext).map((m) => m.id);
        setSelectedIds(new Set(pinned));
      })
      .catch((err) => {
        console.error("Failed to load context", err);
        const message = err instanceof Error ? err.message : String(err);
        addNotification("Failed to load context", message);
      })
      .finally(() => setLoading(false));
  }, [addNotification, open, topicId]);

  const toggleMessage = (id: string): void => {
    const isSelected = selectedIds.has(id);
    const newValue = !isSelected;

    try {
      void updateMessageContext(id, newValue);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (newValue) {
          next.add(id);
        } else {
          next.delete(id);
        }
        return next;
      });
    } catch (err) {
      console.error("Failed to update context pin:", err);
      const message = err instanceof Error ? err.message : String(err);
      addNotification("Failed to update context pin", message);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth>
      <DialogTitle>Edit Topic Context</DialogTitle>

      <DialogContent dividers>
        {loading ? (
          <Box
            display="flex"
            justifyContent="center"
            py={4}>
            <CircularProgress />
          </Box>
        ) : (
          <List>
            {messages.map((msg) => (
              <ListItem
                key={msg.id}
                disableGutters
                sx={{ mb: 1 }}>
                <Paper
                  sx={{
                    position: "relative",
                    width: "100%",
                    p: 2,
                    borderRadius: 3,
                    bgcolor: (theme): string => {
                      if (msg.type === "assistant") return theme.palette.assistant.main;
                      if (msg.type === "aiNote") return theme.palette.aiNote.main;
                      if (msg.type === "system") return theme.palette.grey[900];
                      return theme.palette.background.paper;
                    },
                    color: (theme): string => {
                      if (msg.type === "assistant") return theme.palette.assistant.contrastText;
                      if (msg.type === "aiNote") return theme.palette.aiNote.contrastText;
                      return theme.palette.text.primary;
                    },
                  }}>
                  <Checkbox
                    checked={selectedIds.has(msg.id)}
                    onChange={(): void => { toggleMessage(msg.id); }}
                    tabIndex={-1}
                    disableRipple
                    sx={{
                      position: "absolute",
                      top: 8,
                      right: 8,
                    }}
                  />

                  <Typography
                    variant="body2"
                    sx={{
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      overflowWrap: "anywhere",
                      lineHeight: 1,
                    }}>
                    {msg.content.length > 100 ? msg.content.slice(0, 100) + "..." : msg.content}
                  </Typography>
                </Paper>
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default TopicContextDialog;
