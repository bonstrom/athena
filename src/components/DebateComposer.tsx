import { JSX, KeyboardEvent, useState } from 'react';
import { Box, IconButton, TextField, ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import StopIcon from '@mui/icons-material/Stop';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { useAuthStore } from '../store/AuthStore';

interface DebateComposerProps {
  sending: boolean;
  canContinue: boolean;
  onSend: (content: string) => void;
  onStop: () => void;
  onContinue: () => void;
}

const DebateComposer = ({ sending, canContinue, onSend, onStop, onContinue }: DebateComposerProps): JSX.Element => {
  const [value, setValue] = useState('');
  const { chatWidth, setChatWidth } = useAuthStore();

  const handleSend = (): void => {
    const trimmed = value.trim();
    if (!trimmed || sending) return;
    setValue('');
    onSend(trimmed);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Box
      display="flex"
      alignItems="flex-end"
      gap={1}
      px={2}
      py={1.5}
      sx={{ borderTop: (theme) => `1px solid ${theme.palette.divider}`, flexShrink: 0 }}
    >
      <ToggleButtonGroup
        value={chatWidth}
        exclusive
        onChange={(_, v: 'sm' | 'md' | 'lg' | 'xl' | 'full' | null): void => {
          if (v) setChatWidth(v);
        }}
        size="small"
        sx={{
          '& .MuiToggleButton-root': {
            border: 'none',
            borderRadius: '6px !important',
            px: 0.75,
            py: 0.25,
            fontSize: '0.65rem',
            fontWeight: 'bold',
            minWidth: 24,
            color: 'text.secondary',
            '&.Mui-selected': {
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              '&:hover': { bgcolor: 'primary.dark' },
            },
          },
        }}
      >
        <ToggleButton value="sm">S</ToggleButton>
        <ToggleButton value="md">M</ToggleButton>
        <ToggleButton value="lg">L</ToggleButton>
        <ToggleButton value="xl">XL</ToggleButton>
        <ToggleButton value="full">Full</ToggleButton>
      </ToggleButtonGroup>
      <TextField
        fullWidth
        multiline
        maxRows={6}
        placeholder="Ask your debate question…"
        value={value}
        onChange={(e): void => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={sending}
        size="small"
        inputProps={{ 'aria-label': 'Debate question' }}
      />
      {sending ? (
        <IconButton aria-label="Stop debate" color="error" onClick={onStop}>
          <StopIcon />
        </IconButton>
      ) : (
        <>
          {canContinue && (
            <Tooltip title="Continue incomplete debate">
              <IconButton aria-label="Continue debate" color="success" onClick={onContinue}>
                <PlayArrowIcon />
              </IconButton>
            </Tooltip>
          )}
          <IconButton aria-label="Send debate question" color="primary" onClick={handleSend} disabled={!value.trim()}>
            <SendIcon />
          </IconButton>
        </>
      )}
    </Box>
  );
};

export default DebateComposer;
