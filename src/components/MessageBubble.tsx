import {
  Box,
  IconButton,
  Paper,
  Tooltip,
  Popover,
  Typography,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Zoom,
  alpha,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  CircularProgress,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import DownloadIcon from '@mui/icons-material/Download';
import { useState, memo, useEffect, useRef } from 'react';
import { useAuthStore } from '../store/AuthStore';
import MarkdownWithCode from './MarkdownWithCode';
import TypingIndicator from './TypingIndicator';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteIcon from '@mui/icons-material/Delete';
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import PsychologyIcon from '@mui/icons-material/Psychology';
import { useChatStore } from '../store/ChatStore';
import { useProviderStore } from '../store/ProviderStore';
import { Message } from '../database/AthenaDb';
import { useNotificationStore } from '../store/NotificationStore';
import { useTopicStore } from '../store/TopicStore';
import { useUiStore } from '../store/UiStore';
import AltRouteIcon from '@mui/icons-material/AltRoute';

import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SummarizeIcon from '@mui/icons-material/Summarize';

interface MessageBubbleProps {
  message: Message;
  versions?: Message[];
}

const MessageBubble: React.FC<MessageBubbleProps> = memo(function MessageBubble({ message, versions }) {
  const {
    updateMessageContext,
    deleteMessage,
    sendMessageStream,
    regenerateResponse,
    switchMessageVersion,
    maybeSummarize,
    summarizingMessageIds,
    failedSummaryMessageIds,
  } = useChatStore();
  const { forkTopic } = useTopicStore();
  const { addNotification } = useNotificationStore();
  const { userName, chatFontSize, messageTruncateChars, aiSummaryEnabled } = useAuthStore();
  const { isMobile } = useUiStore();

  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showReasoning, setShowReasoning] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [infoAnchorEl, setInfoAnchorEl] = useState<null | HTMLElement>(null);
  const [isExpanded, setIsExpanded] = useState(() => messageTruncateChars === 0 || message.content.length <= messageTruncateChars);
  const [expandedImage, setExpandedImage] = useState<{ url: string; name: string; data: string } | null>(null);

  const isAssistant = message.type === 'assistant';
  const isLong = messageTruncateChars > 0 && message.content.length > messageTruncateChars;
  const displayContent = isLong && !isExpanded ? message.content.slice(0, messageTruncateChars) + '\u2026' : message.content;

  const wasReasoningAutoShownRef = useRef(false);

  // Keep expanded while the message is being streamed/generated
  useEffect(() => {
    if (isAssistant) {
      if (message.content === '') {
        setIsExpanded(true);
        if (message.reasoning && !wasReasoningAutoShownRef.current) {
          setShowReasoning(true);
          wasReasoningAutoShownRef.current = true;
        }
      } else {
        // Once content starts, if we auto-showed reasoning, hide it auto
        if (wasReasoningAutoShownRef.current) {
          setShowReasoning(false);
          wasReasoningAutoShownRef.current = false;
        }
      }
    }
  }, [isAssistant, message.content, message.reasoning]);

  const togglePin = async (): Promise<void> => {
    try {
      await updateMessageContext(message.id, !message.includeInContext);
    } catch (err) {
      console.error('Failed to update context pin:', err);
      const message = err instanceof Error ? err.message : String(err);
      addNotification('Failed to update context pin', message);
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
      console.error('Failed to delete message:', err);
      const message = err instanceof Error ? err.message : String(err);
      addNotification('Failed to delete message', message);
    }
  };

  const getModelLabel = (id?: string): string => {
    if (!id) return 'Unknown model';
    const { models } = useProviderStore.getState();
    if (id.includes(' - ')) {
      const parts = id.split(' - ');
      return parts.map((p) => models.find((m) => m.apiModelId === p || m.id === p)?.label ?? p).join(' - ');
    }
    return models.find((m) => m.apiModelId === id || m.id === id)?.label ?? id;
  };

  const handleInfoClick = (event: React.MouseEvent<HTMLElement>): void => {
    setInfoAnchorEl(infoAnchorEl ? null : event.currentTarget);
  };

  const handleInfoClose = (): void => {
    setInfoAnchorEl(null);
  };

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    } catch (err) {
      console.error('Failed to copy message:', err);
      addNotification('Error', 'Failed to copy message');
    }
  };

  const handleFork = async (): Promise<void> => {
    try {
      await forkTopic(message.topicId, message.id);
    } catch (err) {
      console.error('Failed to fork conversation:', err);
      const message = err instanceof Error ? err.message : String(err);
      addNotification('Failed to fork conversation', message);
    }
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>): void => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = (): void => {
    setAnchorEl(null);
  };

  const handleRegenerateMenu = (): void => {
    void regenerateResponse(message.id);
    handleMenuClose();
  };

  const handleForkMenu = (): void => {
    void handleFork();
    handleMenuClose();
  };

  const handleDeleteMenu = (): void => {
    handleDeleteClick();
    handleMenuClose();
  };

  return (
    <Paper
      sx={{
        p: 2,
        pl: message.type === 'user' ? { xs: 2, sm: 6 } : undefined,
        width: '100%',
        borderRadius: 3,
        border: message.failed ? (theme): string => `1px solid ${theme.palette.error.main}` : 'none',
        borderLeft: !message.failed && message.type === 'assistant' ? (theme): string => `3px solid ${theme.palette.primary.main}` : undefined,
        bgcolor: (theme): string | undefined => {
          if (message.failed) return alpha(theme.palette.error.main, 0.1);
          if (message.type === 'assistant') return theme.palette.assistant.main;
          if (message.type === 'aiNote') return theme.palette.aiNote.main;
          return undefined;
        },
        color: (theme): string | undefined => {
          if (message.failed) return theme.palette.text.primary;
          if (message.type === 'assistant') return theme.palette.assistant.contrastText;
          if (message.type === 'aiNote') return theme.palette.aiNote.contrastText;
          return undefined;
        },
        '&:hover .message-actions': {
          opacity: 1,
        },
      }}
    >
      <Box sx={{ width: '100%' }}>
        <Box display="flex" justifyContent="space-between" mb={0.5}>
          <Box display="flex" alignItems="center">
            <>
              <Box
                onClick={handleInfoClick}
                sx={{
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  userSelect: 'none',
                  '&:hover': { opacity: 0.7 },
                }}
              >
                <Typography variant="subtitle2" color="text.secondary" sx={{ transition: 'color 0.2s', display: 'inline-block' }}>
                  {message.type === 'user' ? userName : getModelLabel(message.model)}
                </Typography>
              </Box>
              <Popover
                open={Boolean(infoAnchorEl)}
                anchorEl={infoAnchorEl}
                onClose={handleInfoClose}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                slotProps={{ paper: { sx: { p: 1.5, maxWidth: 300, userSelect: 'text' } } }}
              >
                <Typography variant="caption" display="block">
                  {new Intl.DateTimeFormat('sv-SE', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                  }).format(new Date(message.created))}
                </Typography>
                <Typography variant="caption" display="block">
                  {`${message.totalCost.toFixed(3)} kr`}
                </Typography>
                {message.latencyMs && (
                  <>
                    <Typography variant="caption" display="block">
                      {`Time: ${(message.latencyMs / 1000).toFixed(1)} s`}
                    </Typography>
                    <Typography variant="caption" display="block">
                      {`Speed: ${((message.promptTokens + message.completionTokens) / (message.latencyMs / 1000)).toFixed(1)} TPS`}
                    </Typography>
                  </>
                )}
                {message.summary && (
                  <Box mt={1} pt={1} sx={{ borderTop: (theme): string => `1px solid ${alpha(theme.palette.divider, 0.2)}` }}>
                    <Typography variant="caption" sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                      <SummarizeIcon sx={{ fontSize: '0.8rem' }} /> Summary
                    </Typography>
                    <Typography variant="caption" display="block" sx={{ fontStyle: 'italic', whiteSpace: 'pre-wrap', lineHeight: 1.3 }}>
                      {message.summary}
                    </Typography>
                  </Box>
                )}
              </Popover>
            </>

            {(aiSummaryEnabled || message.summary || failedSummaryMessageIds.has(message.id)) &&
              (message.type === 'user' || message.type === 'assistant') &&
              (message.content.length > 250 ||
                message.content.includes('[TRUNCATED:') ||
                !!message.summary ||
                failedSummaryMessageIds.has(message.id)) && (
                <Tooltip
                  title={
                    failedSummaryMessageIds.has(message.id)
                      ? 'Summary failed — click to retry'
                      : message.summary
                        ? 'Regenerate summary'
                        : 'Generate summary'
                  }
                  disableTouchListener={isMobile}
                >
                  <IconButton
                    size="small"
                    disabled={summarizingMessageIds.has(message.id)}
                    onClick={(): void => {
                      void maybeSummarize(message.id, message.content, true);
                    }}
                    sx={{
                      ml: 0.5,
                      p: 0.4,
                      color: failedSummaryMessageIds.has(message.id) ? 'error.main' : message.summary ? 'primary.main' : 'text.disabled',
                      '&:hover': {
                        color: failedSummaryMessageIds.has(message.id) ? 'error.main' : 'primary.main',
                        bgcolor: (theme): string =>
                          failedSummaryMessageIds.has(message.id) ? alpha(theme.palette.error.main, 0.1) : alpha(theme.palette.primary.main, 0.1),
                      },
                    }}
                  >
                    {summarizingMessageIds.has(message.id) ? (
                      <CircularProgress size={16} color="inherit" />
                    ) : (
                      <AutoAwesomeIcon sx={{ fontSize: '1rem' }} />
                    )}
                  </IconButton>
                </Tooltip>
              )}

            {isAssistant && versions && versions.length > 1 && (
              <Box
                display="flex"
                alignItems="center"
                ml={1.5}
                sx={{
                  bgcolor: (theme): string => (theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)'),
                  borderRadius: 1.5,
                  px: 0.5,
                  height: 24,
                }}
              >
                <IconButton
                  size="small"
                  aria-label="Previous version"
                  disabled={versions.findIndex((v) => v.id === message.id) === 0}
                  onClick={(): void => {
                    const currentIndex = versions.findIndex((v) => v.id === message.id);
                    if (currentIndex > 0 && message.parentMessageId) {
                      void switchMessageVersion(message.parentMessageId, versions[currentIndex - 1].id);
                    }
                  }}
                  sx={{ p: 0.25, color: 'text.secondary' }}
                >
                  <ChevronLeftIcon sx={{ fontSize: '1.1rem' }} />
                </IconButton>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ mx: 0.5, fontWeight: 'bold', minWidth: '2.5em', textAlign: 'center', fontSize: '0.7rem' }}
                >
                  {`${versions.findIndex((v) => v.id === message.id) + 1} / ${versions.length}`}
                </Typography>
                <IconButton
                  size="small"
                  aria-label="Next version"
                  disabled={versions.findIndex((v) => v.id === message.id) === versions.length - 1}
                  onClick={(): void => {
                    const currentIndex = versions.findIndex((v) => v.id === message.id);
                    if (currentIndex < versions.length - 1 && message.parentMessageId) {
                      void switchMessageVersion(message.parentMessageId, versions[currentIndex + 1].id);
                    }
                  }}
                  sx={{ p: 0.25, color: 'text.secondary' }}
                >
                  <ChevronRightIcon sx={{ fontSize: '1.1rem' }} />
                </IconButton>
              </Box>
            )}
          </Box>

          <Box
            className="message-actions"
            display="flex"
            alignItems="center"
            gap={1}
            sx={{
              opacity: isMobile || Boolean(anchorEl) ? 1 : 0,
              transition: 'opacity 0.15s ease',
            }}
          >
            {/* High-frequency actions: Copy and Pin */}
            <Box display="flex" alignItems="center" gap={0.5}>
              <Tooltip title={copied ? 'Copied!' : 'Copy message'} disableTouchListener={isMobile}>
                <IconButton
                  size="small"
                  aria-label={copied ? 'Copied!' : 'Copy message'}
                  onClick={(): void => {
                    void handleCopy();
                  }}
                  sx={{
                    color: 'text.secondary',
                    '&:hover': {
                      bgcolor: (theme): string => (theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'),
                    },
                  }}
                >
                  <Box position="relative" display="flex" alignItems="center" justifyContent="center" sx={{ width: 20, height: 20 }}>
                    <Zoom in={!copied} timeout={200} unmountOnExit>
                      <ContentCopyIcon fontSize="small" sx={{ position: 'absolute' }} />
                    </Zoom>
                    <Zoom in={copied} timeout={200} unmountOnExit>
                      <CheckIcon fontSize="small" color="success" sx={{ position: 'absolute' }} />
                    </Zoom>
                  </Box>
                </IconButton>
              </Tooltip>

              <Tooltip title={message.includeInContext ? 'Unpin from context' : 'Pin to context'} disableTouchListener={isMobile}>
                <IconButton
                  size="small"
                  aria-label={message.includeInContext ? 'Unpin from context' : 'Pin to context'}
                  onClick={(): void => {
                    void togglePin();
                  }}
                  sx={{
                    color: 'text.secondary',
                    '&:hover': {
                      bgcolor: (theme): string => (theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'),
                    },
                  }}
                >
                  <Box position="relative" display="flex" alignItems="center" justifyContent="center" sx={{ width: 20, height: 20 }}>
                    <Zoom in={!message.includeInContext} timeout={200} unmountOnExit>
                      <PushPinOutlinedIcon fontSize="small" sx={{ position: 'absolute' }} />
                    </Zoom>
                    <Zoom in={message.includeInContext} timeout={200} unmountOnExit>
                      <PushPinIcon fontSize="small" sx={{ position: 'absolute' }} />
                    </Zoom>
                  </Box>
                </IconButton>
              </Tooltip>
            </Box>

            {/* More Actions Menu */}
            <Box>
              <Tooltip title="More actions">
                <IconButton
                  size="small"
                  aria-label="More actions"
                  onClick={handleMenuOpen}
                  sx={{
                    color: 'text.secondary',
                    '&:hover': {
                      bgcolor: (theme): string => (theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'),
                    },
                  }}
                >
                  <MoreVertIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleMenuClose}
                transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
              >
                {isAssistant && message.content !== '' && !message.failed && (
                  <MenuItem onClick={handleRegenerateMenu}>
                    <ListItemIcon>
                      <RefreshIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Regenerate</ListItemText>
                  </MenuItem>
                )}
                {isAssistant && message.content !== '' && !message.failed && (
                  <MenuItem onClick={handleForkMenu}>
                    <ListItemIcon>
                      <AltRouteIcon fontSize="small" sx={{ transform: 'rotate(90deg)' }} />
                    </ListItemIcon>
                    <ListItemText>Fork</ListItemText>
                  </MenuItem>
                )}
                <MenuItem onClick={handleDeleteMenu}>
                  <ListItemIcon>
                    <DeleteIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>Delete</ListItemText>
                </MenuItem>
              </Menu>
            </Box>
          </Box>
        </Box>

        <Box sx={{ overflowX: 'auto', fontSize: `${chatFontSize}px` }}>
          {message.type === 'aiNote' ? (
            <Typography variant="body2" fontStyle="italic" color="text.secondary" sx={{ fontSize: 'inherit' }}>
              {getModelLabel(message.model)} stored a hidden note here.
            </Typography>
          ) : (
            <>
              <MarkdownWithCode fontSize={chatFontSize}>{displayContent}</MarkdownWithCode>
              {(isLong || message.reasoning) && (
                <Box mt={0.5} display="flex" alignItems="center" gap={1}>
                  {isLong && (
                    <Button
                      size="small"
                      variant="text"
                      startIcon={isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      onClick={(): void => setIsExpanded((v) => !v)}
                      sx={{ textTransform: 'none', color: 'text.secondary', fontSize: '0.75rem', px: 0.5 }}
                    >
                      {isExpanded ? 'Show less' : 'Show more'}
                    </Button>
                  )}
                  {message.reasoning && (
                    <Tooltip title={showReasoning ? 'Hide thoughts' : 'Show thoughts'}>
                      <IconButton
                        size="small"
                        onClick={(): void => setShowReasoning(!showReasoning)}
                        sx={{
                          color: showReasoning ? 'primary.main' : 'text.secondary',
                          p: 0.5,
                          '&:hover': {
                            bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                          },
                        }}
                      >
                        <PsychologyIcon sx={{ fontSize: '1.2rem' }} />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
              )}
            </>
          )}
        </Box>

        {message.attachments && message.attachments.length > 0 && (
          <Box display="flex" flexWrap="wrap" gap={1} mt={2} mb={1}>
            {message.attachments.map((att) => (
              <Box
                key={att.id}
                sx={{
                  position: 'relative',
                  borderRadius: 2,
                  overflow: 'hidden',
                  border: (theme) => `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                  bgcolor: (theme) => alpha(theme.palette.action.hover, 0.05),
                }}
              >
                {att.previewUrl ? (
                  <>
                    <Box
                      component="img"
                      src={att.previewUrl}
                      alt={att.name}
                      sx={{
                        maxWidth: '100%',
                        maxHeight: 300,
                        display: 'block',
                        cursor: 'pointer',
                        transition: 'opacity 0.2s',
                        '&:hover': { opacity: 0.9 },
                      }}
                      onClick={(): void => {
                        setExpandedImage({ url: att.previewUrl!, name: att.name, data: att.data });
                      }}
                    />
                    <IconButton
                      size="small"
                      onClick={(e): void => {
                        e.stopPropagation();
                        const link = document.createElement('a');
                        link.href = att.data;
                        link.download = att.name;
                        link.click();
                      }}
                      sx={{
                        position: 'absolute',
                        bottom: 8,
                        right: 8,
                        backgroundColor: 'rgba(0,0,0,0.5)',
                        color: 'white',
                        '&:hover': {
                          backgroundColor: 'rgba(0,0,0,0.7)',
                        },
                      }}
                    >
                      <DownloadIcon fontSize="small" />
                    </IconButton>
                  </>
                ) : att.name?.toLowerCase().match(/\.(mp3|wav|ogg)$/) ? (
                  <>
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <audio controls src={att.data} style={{ display: 'block', outline: 'none' }} />
                  </>
                ) : (
                  <Button
                    startIcon={<AttachFileIcon />}
                    endIcon={<DownloadIcon />}
                    size="small"
                    variant="outlined"
                    component="a"
                    href={att.data}
                    download={att.name}
                    sx={{
                      textTransform: 'none',
                      color: 'text.primary',
                      borderColor: 'divider',
                      '&:hover': {
                        borderColor: 'primary.main',
                        bgcolor: 'action.hover',
                      },
                    }}
                  >
                    <Typography variant="caption" noWrap sx={{ maxWidth: 150 }}>
                      {att.name}
                    </Typography>
                  </Button>
                )}
              </Box>
            ))}
          </Box>
        )}

        {isAssistant && message.content === '' && !message.failed && (
          <Box
            sx={{
              mt: 1,
              mb: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            <TypingIndicator />
            {message.reasoning && (
              <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic', animation: 'pulse 2s infinite' }}>
                Thinking...
              </Typography>
            )}
          </Box>
        )}

        {showReasoning && message.reasoning && (
          <Box
            sx={{
              mt: 1.5,
              mb: 1.5,
              p: 1.5,
              borderRadius: 2,
              bgcolor: (theme): string => (theme.palette.mode === 'dark' ? alpha('#fff', 0.05) : alpha('#000', 0.03)),
              borderLeft: (theme): string => `4px solid ${alpha(theme.palette.text.secondary, 0.2)}`,
              maxHeight: '400px',
              overflowY: 'auto',
            }}
          >
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontWeight: 'bold', mb: 0.5, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}
            >
              Thought Process
            </Typography>
            <Box sx={{ fontSize: `${Math.max(11, chatFontSize - 2)}px` }}>
              <MarkdownWithCode fontSize={Math.max(11, chatFontSize - 2)}>{message.reasoning}</MarkdownWithCode>
            </Box>
          </Box>
        )}

        {message.failed && (
          <Box
            sx={{
              mt: 2,
              p: 2,
              borderRadius: 2,
              bgcolor: (theme) => alpha(theme.palette.error.main, 0.05),
              border: (theme) => `1px dashed ${alpha(theme.palette.error.main, 0.3)}`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 1,
            }}
          >
            <Typography variant="body2" color="error" sx={{ fontWeight: 'bold' }}>
              Message delivery failed
            </Typography>
            <Button
              variant="contained"
              color="error"
              size="small"
              startIcon={<RefreshIcon />}
              onClick={(): void => {
                void sendMessageStream(message.content, message.topicId, message.id);
              }}
              sx={{ textTransform: 'none' }}
            >
              Retry Sending
            </Button>
          </Box>
        )}
      </Box>

      <Dialog open={openDeleteDialog} onClose={handleCloseDeleteDialog}>
        <DialogTitle>Delete Message</DialogTitle>
        <DialogContent>
          <DialogContentText>Are you sure you want to delete this message? This action cannot be undone.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDeleteDialog}>Cancel</Button>
          <Button
            onClick={(): void => {
              void handleConfirmDelete();
            }}
            color="error"
            variant="contained"
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(expandedImage)} onClose={(): void => setExpandedImage(null)} maxWidth="xl">
        <Box sx={{ position: 'relative' }}>
          <Box component="img" src={expandedImage?.url} alt={expandedImage?.name} sx={{ maxWidth: '100%', maxHeight: '90vh', display: 'block' }} />
          <IconButton
            onClick={(): void => {
              if (expandedImage) {
                const link = document.createElement('a');
                link.href = expandedImage.data;
                link.download = expandedImage.name;
                link.click();
              }
            }}
            sx={{
              position: 'absolute',
              bottom: 16,
              right: 16,
              backgroundColor: 'rgba(0,0,0,0.5)',
              color: 'white',
              '&:hover': {
                backgroundColor: 'rgba(0,0,0,0.7)',
              },
            }}
          >
            <DownloadIcon />
          </IconButton>
        </Box>
      </Dialog>
    </Paper>
  );
});

export default MessageBubble;
