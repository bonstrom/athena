import React, { useEffect, useState, useMemo } from "react";
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
  TextField,
  InputAdornment,
  FormControlLabel,
  Switch,
  Pagination,
  Stack,
  Chip,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import PushPinIcon from "@mui/icons-material/PushPin";
import PushPinOutlinedIcon from "@mui/icons-material/PushPinOutlined";

import { useChatStore } from "../store/ChatStore";
import { Message } from "../database/AthenaDb";
import { useNotificationStore } from "../store/NotificationStore";
import { useTopicStore } from "../store/TopicStore";

interface TopicContextDialogProps {
  open: boolean;
  topicId: string | null;
  onClose: () => void;
}

const ITEMS_PER_PAGE = 5;

const TopicContextDialog: React.FC<TopicContextDialogProps> = ({ open, topicId, onClose }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  // New State for search and pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [showOnlyPinned, setShowOnlyPinned] = useState(false);
  const [page, setPage] = useState(1);

  const { updateMessageContext } = useChatStore();

  const { addNotification } = useNotificationStore();

  useEffect(() => {
    if (!open || !topicId) return;

    setLoading(true);

    useTopicStore
      .getState()
      .getTopicContext(topicId)
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

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [searchQuery, showOnlyPinned]);

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

  const filteredMessages = useMemo(() => {
    return messages.filter((msg) => {
      // 1. Text Search Filter
      const matchesSearch = msg.content.toLowerCase().includes(searchQuery.toLowerCase());

      // 2. Pinned Filter
      const matchesPinned = showOnlyPinned ? selectedIds.has(msg.id) : true;

      return matchesSearch && matchesPinned;
    });
  }, [messages, searchQuery, showOnlyPinned, selectedIds]);

  const pageCount = Math.ceil(filteredMessages.length / ITEMS_PER_PAGE);
  const paginatedMessages = filteredMessages.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const formatTime = (dateString: string): string => {
    try {
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(dateString));
    } catch {
      return "";
    }
  };

  const getRoleLabel = (type: string): string => {
    switch (type) {
      case "user":
        return "User";
      case "assistant":
        return "Assistant";
      case "aiNote":
        return "AI Note";
      case "system":
        return "System";
      default:
        return "Unknown";
    }
  };

  // Prevent dialog from growing/shrinking abruptly by keeping a min-height for the content
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          bgcolor: "background.paper",
          backgroundImage: "none",
        },
      }}>
      <DialogTitle sx={{ pb: 1, fontWeight: "bold" }}>Edit Topic Context</DialogTitle>

      <Box
        px={3}
        pb={2}
        display="flex"
        gap={2}
        alignItems="center"
        flexWrap="wrap">
        <TextField
          size="small"
          placeholder="Search items..."
          value={searchQuery}
          onChange={(e): void => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
          sx={{ flexGrow: 1, minWidth: 200 }}
        />
        <FormControlLabel
          control={
            <Switch
              checked={showOnlyPinned}
              onChange={(e): void => setShowOnlyPinned(e.target.checked)}
              color="primary"
            />
          }
          label="Show Pinned Only"
          sx={{ whiteSpace: "nowrap" }}
        />
      </Box>

      <DialogContent
        dividers
        sx={{ minHeight: 400, px: { xs: 2, sm: 3 } }}>
        {loading ? (
          <Box
            display="flex"
            justifyContent="center"
            alignItems="center"
            height="100%">
            <CircularProgress />
          </Box>
        ) : filteredMessages.length === 0 ? (
          <Box
            display="flex"
            justifyContent="center"
            alignItems="center"
            height="100%"
            color="text.secondary">
            <Typography>No messages match your criteria.</Typography>
          </Box>
        ) : (
          <List disablePadding>
            {paginatedMessages.map((msg) => (
              <ListItem
                key={msg.id}
                disableGutters
                sx={{ mb: 2 }}>
                <Paper
                  elevation={0}
                  sx={{
                    position: "relative",
                    width: "100%",
                    p: 2,
                    borderRadius: 3,
                    border: (theme): string => `1px solid ${theme.palette.divider}`,
                    bgcolor: (theme): string => {
                      if (msg.type === "assistant")
                        return theme.palette.mode === "dark" ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.01)";
                      if (msg.type === "aiNote")
                        return theme.palette.mode === "dark" ? "rgba(255, 167, 38, 0.05)" : "rgba(255, 167, 38, 0.05)";
                      if (msg.type === "system")
                        return theme.palette.mode === "dark" ? "rgba(244, 67, 54, 0.05)" : "rgba(244, 67, 54, 0.05)";
                      return "transparent";
                    },
                    transition: "border-color 0.2s, box-shadow 0.2s",
                    ...(selectedIds.has(msg.id) && {
                      borderColor: "primary.main",
                      boxShadow: (theme): string => `0 0 0 1px ${theme.palette.primary.main}`,
                    }),
                  }}>
                  <Box
                    display="flex"
                    justifyContent="space-between"
                    alignItems="center"
                    mb={1}>
                    <Stack
                      direction="row"
                      spacing={1}
                      alignItems="center">
                      <Chip
                        label={getRoleLabel(msg.type)}
                        size="small"
                        color={
                          msg.type === "user"
                            ? "primary"
                            : msg.type === "assistant"
                              ? "default"
                              : msg.type === "aiNote"
                                ? "warning"
                                : "error"
                        }
                        sx={{ height: 20, fontSize: "0.7rem", fontWeight: "bold" }}
                      />
                      <Typography
                        variant="caption"
                        color="text.secondary">
                        {formatTime(msg.created)}
                      </Typography>
                    </Stack>

                    <Checkbox
                      icon={<PushPinOutlinedIcon />}
                      checkedIcon={<PushPinIcon />}
                      checked={selectedIds.has(msg.id)}
                      onChange={(): void => {
                        toggleMessage(msg.id);
                      }}
                      tabIndex={-1}
                      color="primary"
                    />
                  </Box>

                  <Typography
                    variant="body2"
                    color="text.primary"
                    sx={{
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      overflowWrap: "anywhere",
                      lineHeight: 1.5,
                    }}>
                    {msg.content.length > 300 ? msg.content.slice(0, 300) + "..." : msg.content}
                  </Typography>
                </Paper>
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, justifyContent: "space-between" }}>
        <Box>
          {!loading && pageCount > 1 && (
            <Pagination
              count={pageCount}
              page={page}
              onChange={(_, val): void => setPage(val)}
              color="primary"
              size="small"
            />
          )}
        </Box>
        <Button
          onClick={onClose}
          variant="outlined"
          color="inherit">
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TopicContextDialog;
