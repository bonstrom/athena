import React, { useState } from "react";
import {
  Tabs,
  Tab,
  Box,
  Paper,
  alpha,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useTopicStore } from "../store/TopicStore";
import { useChatStore } from "../store/ChatStore";
import { useAuthStore } from "../store/AuthStore";

interface ForkTabsProps {
  topicId: string;
}

const ForkTabs: React.FC<ForkTabsProps> = ({ topicId }) => {
  const { topics, switchFork, deleteFork } = useTopicStore();
  const { fetchMessages } = useChatStore();
  const { chatFontSize } = useAuthStore();
  const [forkToDelete, setForkToDelete] = useState<string | null>(null);

  const topic = topics.find((t) => t.id === topicId);
  if (!topic || (topic.forks?.length ?? 0) <= 1) {
    return null;
  }

  const activeForkId = topic.activeForkId ?? "main";

  const handleChange = (_event: React.SyntheticEvent, newValue: string): void => {
    void (async (): Promise<void> => {
      await switchFork(topicId, newValue);
      await fetchMessages(topicId, newValue);
    })();
  };

  const handleDeleteClick = (e: React.MouseEvent, forkId: string): void => {
    e.stopPropagation();
    setForkToDelete(forkId);
  };

  const handleConfirmDelete = (): void => {
    if (!forkToDelete) return;
    void (async (): Promise<void> => {
      await deleteFork(topicId, forkToDelete);
      const updatedTopic = useTopicStore.getState().topics.find((t) => t.id === topicId);
      if (updatedTopic) {
        await fetchMessages(topicId, updatedTopic.activeForkId ?? "main");
      }
      setForkToDelete(null);
    })();
  };

  return (
    <Paper
      elevation={0}
      sx={{
        borderBottom: 1,
        borderColor: "divider",
        bgcolor: (theme) => alpha(theme.palette.background.paper, 0.8),
        backdropFilter: "blur(8px)",
        position: "sticky",
        top: 0,
        zIndex: 10,
        mb: 2,
        borderRadius: 0,
      }}>
      <Box sx={{ maxWidth: "md", mx: "auto", px: 2 }}>
        <Tabs
          value={activeForkId}
          onChange={handleChange}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            minHeight: 48,
            "& .MuiTab-root": {
              textTransform: "none",
              fontWeight: 500,
              fontSize: `${Math.max(13, chatFontSize * 0.9)}px`,
              minWidth: 100,
            },
          }}>
          {topic.forks?.map((fork) => (
            <Tab
              key={fork.id}
              value={fork.id}
              label={
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  {fork.name}
                  {topic.forks && topic.forks.length > 1 && (
                    <IconButton
                      component="span"
                      size="small"
                      onClick={(e): void => handleDeleteClick(e, fork.id)}
                      sx={{
                        p: 0.2,
                        ml: 0.5,
                        opacity: 0.5,
                        "&:hover": { opacity: 1, bgcolor: "rgba(0,0,0,0.1)" },
                      }}>
                      <CloseIcon sx={{ fontSize: "0.75rem" }} />
                    </IconButton>
                  )}
                </Box>
              }
            />
          ))}
        </Tabs>
      </Box>

      <Dialog
        open={Boolean(forkToDelete)}
        onClose={(): void => setForkToDelete(null)}>
        <DialogTitle>Delete Conversation Branch</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this branch? All messages unique to this branch will be permanently removed.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={(): void => setForkToDelete(null)}>Cancel</Button>
          <Button
            onClick={handleConfirmDelete}
            color="error"
            variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default ForkTabs;
