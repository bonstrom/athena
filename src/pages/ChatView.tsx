import React, { useEffect, useState } from "react";
import { Box, useMediaQuery, useTheme, Fade } from "@mui/material";
import { useParams } from "react-router-dom";
import { useAuthStore } from "../store/AuthStore";
import { useChatStore } from "../store/ChatStore";
import { useTopicStore } from "../store/TopicStore";
import MessageList from "../components/MessageList";
import Composer from "../components/Composer";
import ForkTabs from "../components/ForkTabs";

const ChatView: React.FC = () => {
  const { topicId } = useParams<{ topicId: string }>();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const { chatWidth } = useAuthStore();
  const { messagesByTopic, sending, sendMessageStream, fetchMessages } = useChatStore();
  const [displayTopicId, setDisplayTopicId] = useState<string | undefined>(topicId);
  const [isVisible, setIsVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const topic = useTopicStore((state) => state.topics.find((t) => t.id === displayTopicId));
  const maxContextMessages = topic?.maxContextMessages ?? 10;

  const messages = displayTopicId ? (messagesByTopic[displayTopicId] ?? []) : [];

  useEffect(() => {
    setError(null);

    const fetchPromise = topicId ? fetchMessages(topicId) : Promise.resolve();

    void fetchPromise.then(() => {
      const topicStoreState = useTopicStore.getState();
      const exists = topicId ? topicStoreState.topics.some((t) => t.id === topicId) : true;

      if (!exists && topicStoreState.topics.length > 0) {
        setError("Topic not found");
      } else {
        setDisplayTopicId(topicId);
        setIsVisible(true);
      }
    });
  }, [fetchMessages, topicId]);

  return (
    <Box
      display="flex"
      flexDirection="column"
      height="100%"
      width="100%">
      <Box
        sx={{
          flexGrow: 1,
          overflowY: "auto",
          overflowX: "hidden",
          display: "flex",
          justifyContent: "center",
          pt: 2,
        }}>
        <Box
          width="100%"
          maxWidth={{ xs: "100%", md: chatWidth === "full" ? "100%" : chatWidth }}
          px={{ xs: 1, md: 2 }}
          mx="auto">
          {error ? (
            <Box
              display="flex"
              alignItems="center"
              justifyContent="center"
              height="50vh"
              color="text.secondary">
              {error}
            </Box>
          ) : (
            <Fade
              key={displayTopicId}
              in={isVisible}
              timeout={{ enter: 150, exit: 0 }}>
              <Box width="100%">
                {displayTopicId && <ForkTabs topicId={displayTopicId} />}
                <MessageList
                  messages={messages}
                  maxContextMessages={maxContextMessages}
                />
              </Box>
            </Fade>
          )}
        </Box>
      </Box>

      <Composer
        sending={sending}
        onSend={(content, attachments): void => {
          if (!topicId) return;
          void sendMessageStream(content, topicId, undefined, attachments);
        }}
        isMobile={isMobile}
      />
    </Box>
  );
};

export default ChatView;
