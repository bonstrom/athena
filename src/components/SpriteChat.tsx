import { JSX, useEffect, useState } from 'react';
import { Box, Button, IconButton, Stack, Tooltip, Typography, useMediaQuery, useTheme } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import MessageList from './MessageList';
import Composer from './Composer';
import { PixelDocument } from '../pixel/types';
import { useChatStore } from '../store/ChatStore';
import { useTopicStore } from '../store/TopicStore';
import { useAuthStore } from '../store/AuthStore';
import { usePixelStore } from '../store/PixelStore';
import { formatCost } from '../utils/currency';

/** 1,240 -> 1.2k, so the header stays compact. */
function formatTokens(value: number): string {
  if (value < 1000) return String(value);
  if (value < 1_000_000) return `${(value / 1000).toFixed(1)}k`;
  return `${(value / 1_000_000).toFixed(2)}M`;
}

interface SpriteChatProps {
  sprite: PixelDocument;
  onClose: () => void;
}

/**
 * Chat for a single sprite, rendered on the pixel page.
 *
 * Each sprite owns one topic, created the first time you start chatting and
 * remembered on the document, so the conversation is still there next session
 * (and reachable from the sidebar like any other topic).
 */
const SpriteChat = ({ sprite, onClose }: SpriteChatProps): JSX.Element => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const messagesByTopic = useChatStore((state) => state.messagesByTopic);
  const sending = useChatStore((state) => state.sending);
  const sendMessageStream = useChatStore((state) => state.sendMessageStream);
  const fetchMessages = useChatStore((state) => state.fetchMessages);
  const defaultMaxContextMessages = useAuthStore((state) => state.defaultMaxContextMessages);
  const createTopic = useTopicStore((state) => state.createTopic);
  const renameTopic = useTopicStore((state) => state.renameTopic);
  const attachChatTopic = usePixelStore((state) => state.attachChatTopic);
  const currency = useAuthStore((state) => state.currency);

  const [starting, setStarting] = useState(false);
  const topicId = sprite.chatTopicId ?? null;
  const topic = useTopicStore((state) => state.topics.find((candidate) => candidate.id === topicId));
  const topicsLoaded = useTopicStore((state) => state.topicsLoaded);
  const maxContextMessages = topic?.maxContextMessages ?? defaultMaxContextMessages;
  // The topic can be deleted from the sidebar; fall back to "Start chat" then.
  const hasChat = topicId !== null && (!topicsLoaded || topic !== undefined);
  const messages = hasChat && topicId ? (messagesByTopic[topicId] ?? []) : [];

  const usage = messages.reduce(
    (totals, message) => ({
      promptTokens: totals.promptTokens + message.promptTokens,
      completionTokens: totals.completionTokens + message.completionTokens,
      cachedTokens: totals.cachedTokens + (message.cachedTokens ?? 0),
      cost: totals.cost + message.totalCost + (message.summaryCost ?? 0),
    }),
    { promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0 },
  );
  const totalTokens = usage.promptTokens + usage.completionTokens;

  useEffect((): void => {
    // fetchMessages also points currentTopicId at this topic, which is what the
    // composer checks before allowing a send.
    if (topicId && hasChat) void fetchMessages(topicId);
  }, [topicId, hasChat, fetchMessages]);

  const handleStart = async (): Promise<void> => {
    setStarting(true);
    try {
      const created = await createTopic();
      if (!created) return;
      await renameTopic(created.id, sprite.name);
      await attachChatTopic(sprite.id, created.id);
    } finally {
      setStarting(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          px: 1.5,
          py: 0.5,
          borderBottom: 1,
          borderColor: 'divider',
          flexShrink: 0,
        }}>
        <Stack
          direction="row"
          spacing={1}
          alignItems="baseline"
          sx={{ minWidth: 0 }}>
          <Typography
            variant="subtitle2"
            noWrap>
            {hasChat ? `Chat · ${sprite.name}` : 'Sprite chat'}
          </Typography>
          {totalTokens > 0 && (
            <Tooltip
              title={`Prompt ${usage.promptTokens.toLocaleString()} · Completion ${usage.completionTokens.toLocaleString()}${
                usage.cachedTokens > 0 ? ` · Cached ${usage.cachedTokens.toLocaleString()}` : ''
              } · total ${formatCost(usage.cost, currency, 4)}`}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ whiteSpace: 'nowrap', flexShrink: 0, cursor: 'default' }}>
                {formatTokens(totalTokens)} tok · {formatCost(usage.cost, currency, 3)}
              </Typography>
            </Tooltip>
          )}
        </Stack>
        <Stack
          direction="row"
          spacing={0.5}
          alignItems="center">
          <IconButton
            size="small"
            onClick={onClose}
            aria-label="Hide sprite chat">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      </Box>

      {hasChat && topicId ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minHeight: 0 }}>
          <MessageList
            topicId={topicId}
            messages={messages}
            maxContextMessages={maxContextMessages}
          />
          <Composer
            sending={sending}
            onSend={(content, attachments): void => {
              void sendMessageStream(content, topicId, undefined, attachments);
            }}
            isMobile={isMobile}
          />
        </Box>
      ) : (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1,
            p: 2,
            flexGrow: 1,
          }}>
          <Typography
            variant="body2"
            color="text.secondary"
            textAlign="center">
            Chat with the model about {sprite.name}. It can read the sprite with tools and edit it directly.
          </Typography>
          <Button
            variant="contained"
            size="small"
            disabled={starting}
            onClick={(): void => void handleStart()}>
            Start chat
          </Button>
        </Box>
      )}
    </Box>
  );
};

export default SpriteChat;
