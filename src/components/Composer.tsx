import React, { useEffect, useRef } from "react";
import { Box, IconButton, TextField } from "@mui/material";
import SendIcon from "@mui/icons-material/Send";

interface ComposerProps {
  sending: boolean;
  onSend: (content: string) => void;
  isMobile: boolean;
}

const Composer: React.FC<ComposerProps> = ({ sending, onSend, isMobile }) => {
  const textFieldRef = useRef<HTMLInputElement>(null);
  const questionRef = useRef("");

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
        <TextField
          inputRef={textFieldRef}
          fullWidth
          multiline
          inputProps={{ maxLength: 2000 }}
          maxRows={15}
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
