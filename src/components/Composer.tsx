import React, { useEffect, useRef, useState } from "react";
import { Box, IconButton, TextField, Menu, MenuItem, Tooltip, ListSubheader, Divider } from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import TuneIcon from "@mui/icons-material/Tune";
import { useChatStore } from "../store/ChatStore";

interface ComposerProps {
  sending: boolean;
  onSend: (content: string) => void;
  isMobile: boolean;
}

const Composer: React.FC<ComposerProps> = ({ sending, onSend, isMobile }) => {
  const textFieldRef = useRef<HTMLInputElement>(null);
  const questionRef = useRef("");
  const { selectedModel, temperature, setTemperature } = useChatStore();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
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
          <Menu
            anchorEl={anchorEl}
            open={openTempMenu}
            onClose={handleTempClose}>
            <ListSubheader sx={{ lineHeight: "32px" }}>
              Temperature
              {!selectedModel.supportsTemperature && " (Not supported)"}
            </ListSubheader>
            <MenuItem
              onClick={(): void => handleTempSelect(0.0)}
              selected={temperature === 0.0}
              disabled={!selectedModel.supportsTemperature}>
              Coding / Math (0.0)
            </MenuItem>
            <MenuItem
              onClick={(): void => handleTempSelect(1.0)}
              selected={temperature === 1.0}
              disabled={!selectedModel.supportsTemperature}>
              Data Cleaning / Data Analysis (1.0)
            </MenuItem>
            <MenuItem
              onClick={(): void => handleTempSelect(1.3)}
              selected={temperature === 1.3}
              disabled={!selectedModel.supportsTemperature}>
              General Conversation / Translation (1.3)
            </MenuItem>
            <MenuItem
              onClick={(): void => handleTempSelect(1.5)}
              selected={temperature === 1.5}
              disabled={!selectedModel.supportsTemperature}>
              Creative Writing / Poetry (1.5)
            </MenuItem>
            <Divider />
            <ListSubheader sx={{ lineHeight: "32px" }}>Other</ListSubheader>
            <MenuItem disabled>More features coming soon...</MenuItem>
          </Menu>
        </Box>

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
