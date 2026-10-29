import React, { JSX, useEffect, useRef } from 'react';
import { ListItem, Button, Fab, Box, Typography, CircularProgress, Collapse, useMediaQuery } from '@mui/material';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ScrollToBottom, { useScrollToBottom, useSticky } from 'react-scroll-to-bottom';
import { css } from '@emotion/css';
import { useParams } from 'react-router-dom';

// Suppress noisy internal warning from react-scroll-to-bottom about missing "behavior"
const _origWarn = console.warn.bind(console);
console.warn = (...args: unknown[]): void => {
  if (typeof args[0] === 'string' && args[0].includes('react-scroll-to-bottom') && args[0].includes('behavior')) return;
  _origWarn(...args);
};

import { useChatStore } from '../store/ChatStore';
import { useUiStore } from '../store/UiStore';
import MessageBubble from './MessageBubble';
import SuggestedReplies from './SuggestedReplies';
import { Message } from '../database/AthenaDb';
import ChatWelcome from './ChatWelcome';

const FollowFab = (): JSX.Element | null => {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const scrollToBottom = useScrollToBottom();
  const [sticky] = useSticky();
  if (sticky) return null;

  return (
    <Fab
      color="primary"
      size="small"
      sx={{
        position: 'absolute',
        right: 20,
        bottom: 10,
        zIndex: 10,
        minHeight: 32,
        height: 32,
        width: 32,
        p: 0,
        bgcolor: 'transparent',
        boxShadow: 'none',
        color: 'primary.main',
        '&:hover': {
          bgcolor: 'primary.main',
          color: '#fff',
          boxShadow: 3,
        },
      }}
      onClick={(): void => scrollToBottom({ behavior: reducedMotion ? 'auto' : 'smooth' })}>
      <ArrowDownwardIcon fontSize="small" />
    </Fab>
  );
};

const MessageItem: React.FC<{ message: Message; versions?: Message[]; showAllMessages: boolean; animate: boolean }> = ({
  message,
  versions,
  showAllMessages,
  animate,
}) => {
  const [enter] = React.useState(animate);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const entranceDelay = enter && !reducedMotion && message.type === 'assistant' ? 400 : 0;
  const [visible, setVisible] = React.useState(entranceDelay === 0);
  useEffect(() => {
    if (entranceDelay === 0) {
      setVisible(true);
      return;
    }
    // Visual staging only: the message stays mounted and tokens keep streaming.
    const timer = window.setTimeout(() => setVisible(true), entranceDelay);
    return (): void => window.clearTimeout(timer);
  }, [entranceDelay]);
  const scrollToBottom = useScrollToBottom();
  const [sticky] = useSticky();

  const isStreamingThis = useChatStore((s) => s.streaming?.assistantMessageId === message.id);
  const streamedContent = useChatStore((s) =>
    s.streaming?.assistantMessageId === message.id ? s.streaming.content : message.content,
  );
  const streamedReasoning = useChatStore((s) =>
    s.streaming?.assistantMessageId === message.id ? s.streaming.reasoning : message.reasoning,
  );

  useEffect(() => {
    if (isStreamingThis && sticky && streamedContent.length > 0) {
      scrollToBottom({ behavior: 'auto' });
    }
  }, [isStreamingThis, sticky, streamedContent.length, scrollToBottom]);

  const rendered: Message = {
    ...message,
    content: streamedContent,
    reasoning: streamedReasoning,
  };

  const displayMessage =
    message.type === 'aiNote' && !showAllMessages
      ? { ...rendered, content: '⚠️ Assistant stored a hidden note here.' }
      : rendered;

  return (
    <Collapse
      in={visible}
      appear={enter && !reducedMotion}
      timeout={enter && !reducedMotion ? 360 : 0}
      sx={{ width: '100%', flexShrink: 0 }}>
      <Box
        className={
          enter
            ? `athena-message-enter${message.type === 'assistant' ? ' athena-message-answer-enter' : ''}`
            : undefined
        }
        sx={{ width: '100%', minWidth: 0 }}>
        <MessageBubble
          message={displayMessage}
          versions={versions}
        />
      </Box>
    </Collapse>
  );
};

const Pane: React.FC<{
  groups: { msg: Message; versions?: Message[] }[];
  maxContextMessages: number;
  showAllMessages: boolean;
  entranceIds: ReadonlySet<string>;
}> = ({ groups, maxContextMessages, showAllMessages, entranceIds }) => {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const scrollToBottom = useScrollToBottom();
  const [sticky] = useSticky();

  const lastGroup = groups.length > 0 ? groups[groups.length - 1] : undefined;
  const last = lastGroup?.msg;
  const lastId = last?.id ?? '';
  const lastLength = last?.content.length ?? 0;

  const prevIdRef = useRef(lastId);

  useEffect(() => {
    const isNewMessage = lastId !== prevIdRef.current;
    const isStreaming = lastId === prevIdRef.current && lastLength > 0;

    if (isNewMessage) {
      scrollToBottom({ behavior: reducedMotion ? 'auto' : 'smooth' });
    } else if (isStreaming && sticky) {
      scrollToBottom({ behavior: 'auto' });
    }

    prevIdRef.current = lastId;
  }, [lastId, lastLength, sticky, scrollToBottom, reducedMotion]);

  // For the context window indicator, we need the active sequence
  const contextMessages = groups.map((g) => g.msg).filter((m) => m.type === 'user' || m.type === 'assistant');
  const firstInWindowId =
    contextMessages.length > maxContextMessages
      ? contextMessages[contextMessages.length - maxContextMessages].id
      : null;

  return (
    <>
      {groups.map(({ msg: m, versions }) => {
        const isFirstInWindow = m.id === firstInWindowId;
        return (
          <React.Fragment key={m.id}>
            {isFirstInWindow && (
              <ListItem
                component="div"
                sx={{ py: 1, px: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box sx={{ flex: 1, height: '1px', bgcolor: 'divider', opacity: 0.3 }} />
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ whiteSpace: 'nowrap', userSelect: 'none' }}>
                  Context Window
                </Typography>
                <Box sx={{ flex: 1, height: '1px', bgcolor: 'divider', opacity: 0.3 }} />
              </ListItem>
            )}
            <ListItem
              id={`msg-${m.id}`}
              component="div"
              disableGutters
              sx={{ px: 2 }}>
              <MessageItem
                message={m}
                versions={versions}
                showAllMessages={showAllMessages}
                animate={entranceIds.has(m.id)}
              />
            </ListItem>
          </React.Fragment>
        );
      })}

      <FollowFab />
    </>
  );
};

interface Props {
  messages: Message[];
  maxContextMessages: number;
  /** Overrides the route's topic id when rendered outside /chat/:topicId. */
  topicId?: string;
  suggestions?: string[];
  isSuggestionsLoading?: boolean;
  onSuggestionSelect?: (suggestion: string) => void;
}

const ROOT_CLASS = css({ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' });
const FOLLOW_BUTTON_CLASS = css({ display: 'none' });

const MessageList: React.FC<Props> = ({
  messages,
  maxContextMessages,
  topicId: topicIdProp,
  suggestions = [],
  isSuggestionsLoading = false,
  onSuggestionSelect,
}) => {
  const { topicId: routeTopicId } = useParams();
  const scrollKey = topicIdProp ?? routeTopicId;
  const visibleMessageCount = useChatStore((s) => s.visibleMessageCount);
  const increaseVisibleMessageCount = useChatStore((s) => s.increaseVisibleMessageCount);
  const highlightedMessageId = useChatStore((s) => s.highlightedMessageId);
  const setHighlightedMessageId = useChatStore((s) => s.setHighlightedMessageId);
  const showAllMessages = useUiStore((s) => s.showAllMessages);
  const request = useChatStore((s) => s.currentRequestMessageIds);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const contextKey = `${scrollKey ?? ''}:${messages[0]?.forkId ?? ''}`;
  const baselineIds = new Set([
    ...messages.map((message) => message.id),
    ...(request ? [request.userMessageId, request.assistantMessageId] : []),
  ]);
  const baseline = useRef({
    key: scrollKey,
    messages,
    ids: baselineIds,
    entrances: new Set<string>(),
  });
  if (baseline.current.key !== scrollKey) {
    baseline.current = {
      key: scrollKey,
      messages,
      ids: baselineIds,
      entrances: new Set<string>(),
    };
  } else if (baseline.current.messages !== messages) {
    const entrances = new Set(
      messages
        .filter(
          (message) =>
            !baseline.current.ids.has(message.id) &&
            (request?.userMessageId === message.id || request?.assistantMessageId === message.id),
        )
        .map((message) => message.id),
    );
    baseline.current = {
      key: scrollKey,
      messages,
      ids: new Set([...baseline.current.ids, ...messages.map((message) => message.id)]),
      entrances,
    };
  }

  // 1. Filter, Sort, and Group
  const processedGroups = React.useMemo(() => {
    // 1.1 Filter deleted and sort
    const all = messages
      .filter((m) => !m.isDeleted)
      .sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime());

    // 1.2 Group versions
    const groups: { msg: Message; versions?: Message[] }[] = [];
    const processedIds = new Set<string>();

    // Pre-index assistant messages by parentId for O(N) grouping
    const assistantByParent = new Map<string, Message[]>();
    for (const m of all) {
      if (m.type === 'assistant' && m.parentMessageId) {
        const existing = assistantByParent.get(m.parentMessageId) ?? [];
        existing.push(m);
        assistantByParent.set(m.parentMessageId, existing);
      }
    }

    // Assistant replies that belong to a user message present in this list are
    // "claimed" by that user. When `created` timestamps are out of order (a
    // reply timestamped before its question), the reply is encountered first;
    // deferring it here prevents the same message from being rendered twice —
    // once as a standalone bubble and again as the user's active response.
    const userIds = new Set(all.filter((m) => m.type === 'user').map((m) => m.id));
    const claimedAssistantIds = new Set<string>();
    for (const [parentId, versions] of assistantByParent) {
      if (userIds.has(parentId)) {
        for (const v of versions) claimedAssistantIds.add(v.id);
      }
    }

    for (const m of all) {
      if (processedIds.has(m.id)) continue;

      if (m.type === 'user') {
        processedIds.add(m.id);
        groups.push({ msg: m });

        const versions = assistantByParent.get(m.id);
        if (versions && versions.length > 0) {
          const activeId = m.activeResponseId ?? versions[versions.length - 1].id;
          const activeVersion = versions.find((v) => v.id === activeId) ?? versions[versions.length - 1];
          groups.push({ msg: activeVersion, versions });
          versions.forEach((v) => processedIds.add(v.id));
        }
      } else if (m.type === 'assistant' && claimedAssistantIds.has(m.id)) {
        // Reply deferred to its parent's grouping (out-of-order timestamps).
        processedIds.add(m.id);
      } else {
        // Standalone assistant, aiNote, system, etc.
        groups.push({ msg: m });
        processedIds.add(m.id);
      }
    }
    return groups;
  }, [messages]);

  // 2. Slice the groups based on visible count
  const visibleGroups = React.useMemo(() => {
    return processedGroups.slice(-visibleMessageCount);
  }, [processedGroups, visibleMessageCount]);

  // Scroll to highlighted message from search
  useEffect(() => {
    if (!highlightedMessageId) return;

    const el = document.getElementById(`msg-${highlightedMessageId}`);
    if (el) {
      el.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
      setHighlightedMessageId(null);
      return;
    }

    // Message not yet visible — expand visible count and try again on next render
    const targetIndex = processedGroups.findIndex(
      (g) => g.msg.id === highlightedMessageId || g.versions?.some((v) => v.id === highlightedMessageId),
    );
    if (targetIndex === -1) {
      setHighlightedMessageId(null);
      return;
    }

    const neededCount = processedGroups.length - targetIndex;
    if (neededCount > visibleMessageCount) {
      const rounds = Math.ceil((neededCount - visibleMessageCount) / 10);
      const store = useChatStore.getState();
      for (let i = 0; i < rounds; i++) {
        store.increaseVisibleMessageCount();
      }
    }
  }, [highlightedMessageId, processedGroups, visibleMessageCount, setHighlightedMessageId, reducedMotion]);

  if (processedGroups.length === 0) {
    return (
      <Box
        className={ROOT_CLASS}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
        }}>
        <ChatWelcome />
      </Box>
    );
  }

  return (
    <ScrollToBottom
      key={contextKey}
      className={ROOT_CLASS}
      initialScrollBehavior="auto"
      scrollViewClassName="my-scroll-view"
      followButtonClassName={FOLLOW_BUTTON_CLASS}>
      {processedGroups.length > visibleGroups.length && (
        <ListItem component="div">
          <Button
            onClick={increaseVisibleMessageCount}
            fullWidth
            variant="outlined">
            Load older messages ({processedGroups.length - visibleGroups.length} more)
          </Button>
        </ListItem>
      )}

      <Pane
        groups={visibleGroups}
        maxContextMessages={maxContextMessages}
        showAllMessages={showAllMessages}
        entranceIds={baseline.current.entrances}
      />
      {suggestions.length > 0 && onSuggestionSelect && (
        <SuggestedReplies
          suggestions={suggestions}
          onSelect={onSuggestionSelect}
        />
      )}
      {isSuggestionsLoading && (
        <Box
          display="flex"
          alignItems="center"
          gap={1}
          px={2}
          py={0.5}
          justifyContent="flex-end">
          <CircularProgress size={12} />
          <Typography
            variant="caption"
            color="text.secondary">
            Generating suggestions...
          </Typography>
        </Box>
      )}
    </ScrollToBottom>
  );
};

export default MessageList;
