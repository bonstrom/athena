import React, { useEffect, useState } from "react";
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Typography } from "@mui/material";
import { useTopicStore } from "../store/TopicStore";
import { SCRATCHPAD_LIMIT } from "../store/ChatStore";

interface ScratchpadDialogProps {
  open: boolean;
  topicId: string | null;
  onClose: () => void;
}

const ScratchpadDialog: React.FC<ScratchpadDialogProps> = ({ open, topicId, onClose }) => {
  const topics = useTopicStore((state) => state.topics);
  const updateTopicScratchpad = useTopicStore((state) => state.updateTopicScratchpad);

  const [content, setContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open && topicId) {
      const topic = topics.find((t) => t.id === topicId);
      setContent(topic?.scratchpad ?? "");
    }
  }, [open, topicId, topics]);

  const handleSave = async (): Promise<void> => {
    if (!topicId) return;
    setIsSaving(true);
    try {
      await updateTopicScratchpad(topicId, content);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = (): void => {
    if (window.confirm("Are you sure you want to clear the scratchpad?")) {
      setContent("");
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth>
      <DialogTitle sx={{ fontWeight: "bold" }}>Topic Scratchpad</DialogTitle>
      <DialogContent dividers>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mb: 2 }}>
          This is a persistent memory space for this specific topic. The AI automatically appends notes here when it
          learns important information, and it reads this every time you send a new message. You can also edit it
          manually below.
        </Typography>
        <TextField
          multiline
          fullWidth
          minRows={5}
          maxRows={15}
          value={content}
          onChange={(e): void => {
            if (e.target.value.length <= SCRATCHPAD_LIMIT) {
              setContent(e.target.value);
            }
          }}
          placeholder="No notes stored yet..."
          variant="outlined"
          inputProps={{ maxLength: SCRATCHPAD_LIMIT }}
          sx={{
            "& .MuiInputBase-root": {
              fontFamily: "monospace",
              fontSize: "0.9rem",
            },
          }}
        />
        <Typography
          variant="caption"
          align="right"
          display="block"
          sx={{
            mt: 1,
            color: content.length >= SCRATCHPAD_LIMIT ? "error.main" : "text.secondary",
            fontWeight: content.length >= SCRATCHPAD_LIMIT ? "bold" : "normal",
          }}>
          {content.length} / {SCRATCHPAD_LIMIT} characters
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, justifyContent: "space-between" }}>
        <Button
          onClick={handleClear}
          color="error"
          disabled={!content || isSaving}>
          Clear All
        </Button>
        <div>
          <Button
            onClick={onClose}
            disabled={isSaving}
            sx={{ mr: 1 }}>
            Cancel
          </Button>
          <Button
            onClick={(): void => {
              void handleSave();
            }}
            variant="contained"
            disabled={isSaving}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </div>
      </DialogActions>
    </Dialog>
  );
};

export default ScratchpadDialog;
