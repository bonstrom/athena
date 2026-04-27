import React, { JSX, useEffect, useMemo, useRef } from 'react';
import { Alert, Box, Chip, Typography, useTheme } from '@mui/material';
import { Message, Topic } from '../database/AthenaDb';
import { useDebateStore } from '../store/DebateStore';
import ModelSelector from './ModelSelector';
import MessageBubble from './MessageBubble';
import DebateComposer from './DebateComposer';
import MarkdownWithCode from './MarkdownWithCode';
import TypingIndicator from './TypingIndicator';
import { ChatModel } from './ModelSelector';

interface DebateColumnProps {
  side: 'left' | 'right';
  model: ChatModel | null;
  topicId: string;
  messages: Message[];
  streamingContent: string;
  debateSending: boolean;
  currentPhase: 'idle' | 'answer' | 'review' | 'final' | 'consensus';
}

const PHASE_LABELS: Partial<Record<string, string>> = {
  answer: 'Initial Answer',
  review: 'Review',
  final: 'Final Answer',
  consensus: 'Consensus',
};

const DebateColumn = React.memo(function DebateColumn({
  side,
  model,
  topicId,
  messages,
  streamingContent,
  debateSending,
  currentPhase,
}: DebateColumnProps): JSX.Element {
  const { setDebateModelA, setDebateModelB } = useDebateStore();
  const theme = useTheme();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streamingContent]);

  const handleModelChange = (m: ChatModel): void => {
    if (side === 'left') setDebateModelA(m, topicId);
    else setDebateModelB(m, topicId);
  };

  const isStreaming = debateSending && streamingContent !== '';

  return (
    <Box
      display="flex"
      flexDirection="column"
      flexBasis="50%"
      minWidth={0}
      sx={{
        borderRight: side === 'left' ? `1px solid ${theme.palette.divider}` : 'none',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Column header: model selector */}
      <Box px={1.5} py={1} sx={{ borderBottom: `1px solid ${theme.palette.divider}`, flexShrink: 0 }}>
        {model && <ModelSelector selectedModel={model} onChange={handleModelChange} />}
      </Box>

      {/* Message list */}
      <Box flexGrow={1} overflow="auto" px={1} py={1}>
        {messages.map((msg) => (
          <Box key={msg.id} mb={1}>
            {msg.type === 'assistant' && msg.debatePhase && (
              <Box mb={0.5}>
                <Chip
                  label={PHASE_LABELS[msg.debatePhase] ?? msg.debatePhase}
                  size="small"
                  variant="outlined"
                  sx={{ fontSize: '0.7rem', height: 20 }}
                />
              </Box>
            )}
            <MessageBubble message={msg} />
          </Box>
        ))}

        {/* Live streaming content */}
        {isStreaming && (
          <Box mb={1}>
            <Chip
              label={currentPhase !== 'idle' ? (PHASE_LABELS[currentPhase] ?? currentPhase) : ''}
              size="small"
              variant="outlined"
              sx={{ fontSize: '0.7rem', height: 20, mb: 0.5 }}
            />
            <Box
              sx={{
                bgcolor: 'assistant.main',
                borderRadius: 2,
                px: 1.5,
                py: 1,
                fontSize: 'inherit',
              }}
            >
              <MarkdownWithCode>{streamingContent}</MarkdownWithCode>
            </Box>
          </Box>
        )}

        {/* Typing indicator while waiting for first token */}
        {debateSending && !isStreaming && (
          <Box mb={1}>
            <TypingIndicator />
          </Box>
        )}

        <div ref={bottomRef} />
      </Box>
    </Box>
  );
});

interface DebateViewProps {
  topic: Topic;
  messages: Message[];
}

const PHASE_BANNER: Partial<Record<string, string>> = {
  answer: 'Round 1 — Initial Answers',
  review: 'Round 2 — Peer Reviews',
  final: 'Round 3 — Final Answers',
  consensus: 'Round 4 — Consensus',
};

const DebateView = ({ topic, messages }: DebateViewProps): JSX.Element => {
  const {
    debateModelA,
    debateModelB,
    debateSending,
    currentPhase,
    streamingContentA,
    streamingContentB,
    streamingConsensus,
    initDebateModels,
    sendDebateRound,
    continueDebate,
    stopDebate,
  } = useDebateStore();

  useEffect(() => {
    initDebateModels(topic.id);
  }, [topic.id, initDebateModels]);

  const userMessages = messages.filter((m) => m.type === 'user');
  const leftMessages = messages.filter((m) => m.type === 'assistant' && m.debateSide === 'left');
  const rightMessages = messages.filter((m) => m.type === 'assistant' && m.debateSide === 'right');

  // Detect whether the last round is incomplete (can be continued)
  const canContinue = useMemo((): boolean => {
    if (debateSending || userMessages.length === 0) return false;
    const lastUser = userMessages[userMessages.length - 1];
    const lastUserIdx = messages.findIndex((m) => m.id === lastUser.id);
    const roundMsgs = messages.slice(lastUserIdx + 1).filter((m) => m.type === 'assistant');
    const hasFilled = (phase: string, paired: boolean): boolean => {
      const p = roundMsgs.filter((m) => m.debatePhase === phase && m.content.trim() !== '');
      return paired ? p.some((m) => m.debateSide === 'left') && p.some((m) => m.debateSide === 'right') : p.length > 0;
    };
    return !(hasFilled('answer', true) && hasFilled('review', true) && hasFilled('final', true) && hasFilled('consensus', false));
  }, [debateSending, messages, userMessages]);

  // Build interleaved columns: for each user question, show its answers grouped
  // For simplicity we just render all left-side and right-side messages independently
  // plus user messages displayed as a header row between rounds.
  // We'll use a flat approach: show user messages inline in each column too.
  const leftWithUsers: Message[] = [];
  const rightWithUsers: Message[] = [];

  for (const userMsg of userMessages) {
    leftWithUsers.push(userMsg);
    rightWithUsers.push(userMsg);

    const leftForRound = leftMessages.filter((m) => {
      // messages associated to this round are those that appeared after this user message
      // and before the next user message
      const userIdx = messages.findIndex((x) => x.id === userMsg.id);
      const nextUserIdx = messages.findIndex((x) => x.type === 'user' && messages.indexOf(x) > userIdx);
      const msgIdx = messages.findIndex((x) => x.id === m.id);
      return msgIdx > userIdx && (nextUserIdx === -1 || msgIdx < nextUserIdx);
    });

    const rightForRound = rightMessages.filter((m) => {
      const userIdx = messages.findIndex((x) => x.id === userMsg.id);
      const nextUserIdx = messages.findIndex((x) => x.type === 'user' && messages.indexOf(x) > userIdx);
      const msgIdx = messages.findIndex((x) => x.id === m.id);
      return msgIdx > userIdx && (nextUserIdx === -1 || msgIdx < nextUserIdx);
    });

    leftWithUsers.push(...leftForRound);
    rightWithUsers.push(...rightForRound);
  }

  return (
    <Box display="flex" flexDirection="column" height="100%" overflow="hidden">
      {/* Info banner for empty debates */}
      {messages.length === 0 && !debateSending && (
        <Alert severity="info" variant="outlined" sx={{ mx: 2, mt: 1, flexShrink: 0 }}>
          Debates run 4 rounds (answer, review, final, consensus) and cost roughly 8× a single question. This can take a while.
        </Alert>
      )}

      {/* Phase banner */}
      {currentPhase !== 'idle' && (
        <Box
          px={2}
          py={0.75}
          sx={{
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            textAlign: 'center',
            flexShrink: 0,
          }}
        >
          <Typography variant="caption" fontWeight="bold">
            {PHASE_BANNER[currentPhase] ?? currentPhase}
          </Typography>
        </Box>
      )}

      {/* Two columns */}
      <Box display="flex" flexGrow={1} minHeight={0} sx={{ flexDirection: { xs: 'column', md: 'row' } }}>
        <DebateColumn
          side="left"
          model={debateModelA}
          topicId={topic.id}
          messages={leftWithUsers}
          streamingContent={streamingContentA}
          debateSending={debateSending}
          currentPhase={currentPhase}
        />
        <DebateColumn
          side="right"
          model={debateModelB}
          topicId={topic.id}
          messages={rightWithUsers}
          streamingContent={streamingContentB}
          debateSending={debateSending}
          currentPhase={currentPhase}
        />
      </Box>

      {/* Consensus */}
      {(messages.some((m) => m.debatePhase === 'consensus') || currentPhase === 'consensus') && (
        <Box
          px={3}
          py={2}
          sx={{
            borderTop: (t) => `1px solid ${t.palette.divider}`,
            flexShrink: 0,
            maxHeight: '40%',
            overflow: 'auto',
          }}
        >
          <Chip label="Consensus" size="small" color="primary" sx={{ mb: 1, fontSize: '0.75rem' }} />
          {messages
            .filter((m) => m.debatePhase === 'consensus')
            .map((msg) => (
              <Box key={msg.id}>
                <MessageBubble message={msg} />
              </Box>
            ))}
          {currentPhase === 'consensus' && streamingConsensus && (
            <Box sx={{ bgcolor: 'assistant.main', borderRadius: 2, px: 1.5, py: 1 }}>
              <MarkdownWithCode>{streamingConsensus}</MarkdownWithCode>
            </Box>
          )}
          {currentPhase === 'consensus' && !streamingConsensus && debateSending && <TypingIndicator />}
        </Box>
      )}

      {/* Composer */}
      <DebateComposer
        sending={debateSending}
        canContinue={canContinue}
        onSend={(content): void => {
          void sendDebateRound(content, topic.id);
        }}
        onStop={stopDebate}
        onContinue={(): void => {
          void continueDebate(topic.id);
        }}
      />
    </Box>
  );
};

export default DebateView;
