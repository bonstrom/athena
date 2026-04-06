import React, { useEffect, useState, useMemo } from 'react';
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
  Stack,
  Chip,
  Tooltip,
  Divider,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

import { useChatStore, ContextEntry } from '../store/ChatStore';
import { estimateTokens } from '../services/estimateTokens';
import { useNotificationStore } from '../store/NotificationStore';

interface TopicContextDialogProps {
  open: boolean;
  topicId: string | null;
  onClose: () => void;
  userMessagePreview?: string;
}

const TopicContextDialog: React.FC<TopicContextDialogProps> = ({ open, topicId, onClose, userMessagePreview }) => {
  const [entries, setEntries] = useState<ContextEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const { buildFullContext, updateMessageContext } = useChatStore();
  const { addNotification } = useNotificationStore();

  const reload = (): void => {
    if (!topicId) return;
    setLoading(true);
    buildFullContext(topicId, userMessagePreview)
      .then((result) => setEntries(result))
      .catch((err) => {
        console.error('Failed to build context', err);
        const message = err instanceof Error ? err.message : String(err);
        addNotification('Failed to load context', message);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!open || !topicId) return;
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, topicId, userMessagePreview]);

  const tokenCount = useMemo(() => {
    if (entries.length === 0) return 0;
    return estimateTokens(entries.map((e) => e.message)).promptTokens;
  }, [entries]);

  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return entries;
    const q = searchQuery.toLowerCase();
    return entries.filter((e) => {
      const content = typeof e.message.content === 'string' ? e.message.content : '';
      return content.toLowerCase().includes(q) || e.sourceLabel.toLowerCase().includes(q);
    });
  }, [entries, searchQuery]);

  const counts = useMemo(() => {
    const system = entries.filter((e) => e.message.role === 'system').length;
    const conversation = entries.filter((e) => e.isConversationMessage).length;
    const aiNotes = entries.filter((e) => e.messageType === 'aiNote').length;
    const pinned = entries.filter((e) => e.isConversationMessage && e.sourceLabel.startsWith('Pinned')).length;
    return { system, conversation, aiNotes, pinned };
  }, [entries]);

  const togglePin = async (entry: ContextEntry): Promise<void> => {
    if (!entry.messageId) return;
    const isPinned = entry.sourceLabel.startsWith('Pinned');
    try {
      await updateMessageContext(entry.messageId, !isPinned);
      reload();
    } catch (err) {
      console.error('Failed to update pin:', err);
      const message = err instanceof Error ? err.message : String(err);
      addNotification('Failed to update pin', message);
    }
  };

  const toggleExpanded = (index: number): void => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleCopyJson = (): void => {
    const payload = entries.map((e) => e.message);
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).catch(() => {
      addNotification('Copy failed', 'Could not copy to clipboard.');
    });
  };

  const getRoleColor = (role: string, messageType?: string): 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' => {
    if (messageType === 'aiNote') return 'warning';
    if (role === 'system') return 'error';
    if (role === 'user') return 'primary';
    return 'default';
  };

  const getContentPreview = (entry: ContextEntry, expanded: boolean): string => {
    const raw = typeof entry.message.content === 'string' ? entry.message.content : '[attachment]';
    if (expanded || raw.length <= 300) return raw;
    return raw.slice(0, 300) + '...';
  };

  const formatRole = (role: string, messageType?: string): string => {
    if (messageType === 'aiNote') return 'AI Note';
    return role.charAt(0).toUpperCase() + role.slice(1);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { borderRadius: 3, bgcolor: 'background.paper', backgroundImage: 'none' },
      }}
    >
      <DialogTitle sx={{ pb: 1, fontWeight: 'bold' }}>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <span>Context Inspector</span>
          {!loading && (
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip label={`~${tokenCount.toLocaleString()} tokens`} size="small" variant="outlined" color="info" />
              <Chip label={`${entries.length} messages`} size="small" variant="outlined" />
            </Stack>
          )}
        </Box>
      </DialogTitle>

      {!loading && entries.length > 0 && (
        <Box px={3} pb={1}>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip label={`${counts.system} system`} size="small" color="error" variant="outlined" sx={{ fontSize: '0.7rem' }} />
            <Chip label={`${counts.conversation} conversation`} size="small" color="primary" variant="outlined" sx={{ fontSize: '0.7rem' }} />
            {counts.pinned > 0 && (
              <Chip label={`${counts.pinned} pinned`} size="small" color="secondary" variant="outlined" sx={{ fontSize: '0.7rem' }} />
            )}
            {counts.aiNotes > 0 && (
              <Chip label={`${counts.aiNotes} AI notes`} size="small" color="warning" variant="outlined" sx={{ fontSize: '0.7rem' }} />
            )}
          </Stack>
        </Box>
      )}

      <Box px={3} pb={2} pt={1}>
        <TextField
          size="small"
          fullWidth
          placeholder="Search content or source labels..."
          value={searchQuery}
          onChange={(e): void => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
      </Box>

      <Divider />

      <DialogContent sx={{ minHeight: 400, px: { xs: 2, sm: 3 } }}>
        {loading ? (
          <Box display="flex" justifyContent="center" alignItems="center" height={300}>
            <CircularProgress />
          </Box>
        ) : filteredEntries.length === 0 ? (
          <Box display="flex" justifyContent="center" alignItems="center" height={200} color="text.secondary">
            <Typography>No entries match your search.</Typography>
          </Box>
        ) : (
          <List disablePadding>
            {filteredEntries.map((entry, index) => {
              const globalIndex = entries.indexOf(entry);
              const isExpanded = expandedIds.has(globalIndex);
              const isPinned = entry.isConversationMessage && entry.sourceLabel.startsWith('Pinned');
              const isPreview = entry.sourceLabel.startsWith('Current User Message');
              const rawContent = typeof entry.message.content === 'string' ? entry.message.content : '';
              const isTruncated = rawContent.length > 300;

              return (
                <ListItem key={index} disableGutters sx={{ mb: 1.5 }}>
                  <Paper
                    elevation={0}
                    sx={{
                      width: '100%',
                      p: 2,
                      borderRadius: 2,
                      border: (theme): string =>
                        `1px solid ${isPreview ? theme.palette.info.main : isPinned ? theme.palette.primary.main : theme.palette.divider}`,
                      bgcolor: (theme): string => {
                        if (isPreview) return theme.palette.mode === 'dark' ? 'rgba(33,150,243,0.06)' : 'rgba(33,150,243,0.04)';
                        if (entry.message.role === 'system') return theme.palette.mode === 'dark' ? 'rgba(244,67,54,0.05)' : 'rgba(244,67,54,0.03)';
                        if (entry.messageType === 'aiNote') return theme.palette.mode === 'dark' ? 'rgba(255,167,38,0.07)' : 'rgba(255,167,38,0.05)';
                        if (entry.message.role === 'assistant') return theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)';
                        return 'transparent';
                      },
                      ...(isPinned && {
                        boxShadow: (theme): string => `0 0 0 1px ${theme.palette.primary.main}`,
                      }),
                    }}
                  >
                    <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
                      <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                        <Chip
                          label={formatRole(entry.message.role, entry.messageType)}
                          size="small"
                          color={getRoleColor(entry.message.role, entry.messageType)}
                          sx={{ height: 20, fontSize: '0.7rem', fontWeight: 'bold' }}
                        />
                        <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                          {entry.sourceLabel}
                        </Typography>
                      </Stack>

                      {entry.isConversationMessage && entry.messageId && (
                        <Tooltip title={isPinned ? 'Unpin from context' : 'Pin to always include in context'}>
                          <Checkbox
                            icon={<PushPinOutlinedIcon fontSize="small" />}
                            checkedIcon={<PushPinIcon fontSize="small" />}
                            checked={isPinned}
                            onChange={(): void => {
                              void togglePin(entry);
                            }}
                            tabIndex={-1}
                            color="primary"
                            size="small"
                            sx={{ p: 0.5 }}
                          />
                        </Tooltip>
                      )}
                    </Box>

                    <Typography
                      variant="body2"
                      color="text.primary"
                      sx={{
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        overflowWrap: 'anywhere',
                        lineHeight: 1.5,
                      }}
                    >
                      {getContentPreview(entry, isExpanded)}
                    </Typography>

                    {isTruncated && (
                      <Button
                        size="small"
                        onClick={(): void => toggleExpanded(globalIndex)}
                        sx={{ mt: 0.5, p: 0, textTransform: 'none', fontSize: '0.75rem' }}
                      >
                        {isExpanded ? 'Show less' : `Show all (${rawContent.length.toLocaleString()} chars)`}
                      </Button>
                    )}
                  </Paper>
                </ListItem>
              );
            })}
          </List>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, justifyContent: 'space-between' }}>
        <Tooltip title="Copy the full context payload as JSON">
          <span>
            <Button
              startIcon={<ContentCopyIcon fontSize="small" />}
              onClick={handleCopyJson}
              variant="outlined"
              color="inherit"
              size="small"
              disabled={loading || entries.length === 0}
            >
              Copy as JSON
            </Button>
          </span>
        </Tooltip>
        <Button onClick={onClose} variant="outlined" color="inherit">
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TopicContextDialog;
