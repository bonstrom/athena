import { JSX, KeyboardEvent, useEffect, useState } from 'react';
import { Box, Button, Collapse, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, TextField, Tooltip, Typography } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import StopIcon from '@mui/icons-material/Stop';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import MarkdownWithCode from './MarkdownWithCode';

interface ChecklistComposerProps {
  editing: boolean;
  streamingContent: string;
  lastEditSummary: string;
  toolLog: string;
  lastToolLog: string;
  canEdit: boolean;
  onSend: (content: string) => void;
  onStop: () => void;
}

const ChecklistComposer = ({
  editing,
  streamingContent,
  lastEditSummary,
  toolLog,
  lastToolLog,
  canEdit,
  onSend,
  onStop,
}: ChecklistComposerProps): JSX.Element => {
  const [value, setValue] = useState('');
  const [summaryCollapsed, setSummaryCollapsed] = useState(false);
  const [toolLogOpen, setToolLogOpen] = useState(false);

  const displayToolLog = editing ? toolLog : lastToolLog;
  const hasToolIssue = editing ? toolLog.includes('Error:') : !lastToolLog || lastToolLog.includes('Error:');

  useEffect(() => {
    if (streamingContent || lastEditSummary) setSummaryCollapsed(false);
  }, [streamingContent, lastEditSummary]);

  const handleSend = (): void => {
    const trimmed = value.trim();
    if (!trimmed || editing || !canEdit) return;
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
      px={2}
      py={1.5}
      sx={{ borderTop: (theme) => `1px solid ${theme.palette.divider}`, flexShrink: 0 }}>
      {(streamingContent || lastEditSummary) && (
        <Box
          sx={{
            bgcolor: 'assistant.main',
            borderRadius: 2,
            mb: 1,
            overflow: 'hidden',
          }}>
          <Box
            display="flex"
            alignItems="center"
            justifyContent="space-between"
            px={1.5}
            py={0.5}>
            <Typography
              variant="caption"
              color="text.secondary"
              fontWeight="bold">
              {streamingContent ? 'AI is working…' : 'Last edit'}
            </Typography>
            <Box display="flex" alignItems="center">
              <Tooltip title={hasToolIssue ? 'Something went wrong — view tool calls' : 'View tool calls'}>
                <IconButton
                  size="small"
                  aria-label="Show tool calls"
                  onClick={(): void => setToolLogOpen(true)}
                  sx={{ p: 0.25 }}>
                  {hasToolIssue ? (
                    <WarningAmberIcon sx={{ fontSize: 16, color: 'warning.main' }} />
                  ) : (
                    <InfoOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                  )}
                </IconButton>
              </Tooltip>
              <IconButton
                size="small"
                aria-label={summaryCollapsed ? 'Show last edit' : 'Hide last edit'}
                onClick={(): void => setSummaryCollapsed((v) => !v)}
                sx={{ p: 0.25 }}>
                {summaryCollapsed ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
              </IconButton>
            </Box>
          </Box>
          <Collapse in={!summaryCollapsed}>
            <Box
              sx={{
                px: 1.5,
                pb: 1,
                maxHeight: 160,
                overflow: 'auto',
              }}>
              <MarkdownWithCode>{streamingContent || lastEditSummary}</MarkdownWithCode>
            </Box>
          </Collapse>
        </Box>
      )}
      <Box
        display="flex"
        alignItems="flex-end"
        gap={1}>
        <TextField
          fullWidth
          multiline
          maxRows={5}
          placeholder="Ask the AI to change this checklist… (e.g. 'add a packing section', 'mark the venue as done')"
          value={value}
          onChange={(e): void => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={editing || !canEdit}
          size="small"
          inputProps={{ 'aria-label': 'Checklist instruction' }}
        />
        {editing ? (
          <IconButton
            aria-label="Stop editing"
            color="error"
            onClick={onStop}>
            <StopIcon />
          </IconButton>
        ) : (
          <IconButton
            aria-label="Send checklist instruction"
            color="primary"
            onClick={handleSend}
            disabled={!value.trim() || !canEdit}>
            <SendIcon />
          </IconButton>
        )}
      </Box>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ mt: 0.5, display: 'block' }}>
        {canEdit
          ? 'Tip: both you and the AI can add, remove, check, and reorder tasks.'
          : 'This model does not support editing checklists. Select a model with tool support to use this.'}
      </Typography>

      <Dialog open={toolLogOpen} onClose={(): void => setToolLogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Tool calls</DialogTitle>
        <DialogContent dividers>
          {displayToolLog ? (
            <MarkdownWithCode>{displayToolLog}</MarkdownWithCode>
          ) : (
            <Typography variant="body2" color={editing ? 'text.secondary' : 'warning.main'}>
              {editing
                ? 'No tool calls yet.'
                : 'No tool calls were made — the model only wrote text and did not modify the checklist.'}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={(): void => setToolLogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ChecklistComposer;
