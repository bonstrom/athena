import React, { useEffect, useState } from 'react';
import { Box, useMediaQuery, useTheme, Fade } from '@mui/material';
import { useParams } from 'react-router-dom';
import { useAuthStore } from '../store/AuthStore';
import { useChatStore } from '../store/ChatStore';
import { useTopicStore } from '../store/TopicStore';
import { Attachment } from '../database/AthenaDb';
import MessageList from '../components/MessageList';
import Composer from '../components/Composer';
import ForkTabs from '../components/ForkTabs';
import DebateView from '../components/DebateView';

const ChatView: React.FC = () => {
  const { topicId } = useParams<{ topicId: string }>();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const { chatWidth, defaultMaxContextMessages } = useAuthStore();
  const { messagesByTopic, sending, sendMessageStream, fetchMessages, pendingSuggestions, clearSuggestions, isSuggestionsLoading } = useChatStore();
  const [displayTopicId, setDisplayTopicId] = useState<string | undefined>(topicId);
  const [isVisible, setIsVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const topic = useTopicStore((state) => state.topics.find((t) => t.id === displayTopicId));
  const maxContextMessages = topic?.maxContextMessages ?? defaultMaxContextMessages;

  const messages = displayTopicId ? (messagesByTopic[displayTopicId] ?? []) : [];

  useEffect(() => {
    setError(null);
    clearSuggestions();

    const fetchPromise = topicId ? fetchMessages(topicId) : Promise.resolve();

    void fetchPromise.then(() => {
      const topicStoreState = useTopicStore.getState();
      const exists = topicId ? topicStoreState.topics.some((t) => t.id === topicId) : true;

      if (!exists && topicStoreState.topics.length > 0) {
        setError('Topic not found');
      } else {
        setDisplayTopicId(topicId);
        setIsVisible(true);
      }
    });
  }, [fetchMessages, topicId, clearSuggestions]);

  return (
    <Box display="flex" flexDirection="column" height="100%" width="100%" sx={{ overflow: 'hidden' }}>
      <Box
        sx={{
          flexGrow: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          alignItems: 'center',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            width: '100%',
            maxWidth: { xs: '100%', md: chatWidth === 'full' ? '100%' : chatWidth },
            flexGrow: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            px: { xs: 1, md: 2 },
          }}
        >
          {error ? (
            <Box display="flex" alignItems="center" justifyContent="center" height="100%" color="text.secondary">
              {error}
            </Box>
          ) : (
            <Fade key={displayTopicId} in={isVisible} timeout={{ enter: 150, exit: 0 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minHeight: 0 }}>
                {topic?.mode === 'debate' ? (
                  <DebateView topic={topic} messages={messages} />
                ) : (
                  <>
                    {displayTopicId && <ForkTabs topicId={displayTopicId} />}
                    <MessageList
                      messages={messages}
                      maxContextMessages={maxContextMessages}
                      suggestions={!sending ? (pendingSuggestions ?? []) : []}
                      isSuggestionsLoading={isSuggestionsLoading && !sending && !pendingSuggestions}
                      onSuggestionSelect={(suggestion): void => {
                        clearSuggestions();
                        if (!topicId) return;
                        void sendMessageStream(suggestion, topicId);
                      }}
                    />
                  </>
                )}
              </Box>
            </Fade>
          )}
        </Box>
      </Box>

      {topic?.mode !== 'debate' && (
        <Composer
          sending={sending}
          onSend={(content: string, attachments?: Attachment[]): void => {
            if (!topicId) return;
            void sendMessageStream(content, topicId, undefined, attachments);
          }}
          isMobile={isMobile}
        />
      )}
    </Box>
  );
};

export default ChatView;
