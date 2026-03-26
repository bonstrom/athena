import React, { useEffect, useState } from "react";
import { Box, useMediaQuery, useTheme, Fade } from "@mui/material";
import { useParams } from "react-router-dom";
import { useAuthStore } from "../store/AuthStore";
import { useChatStore } from "../store/ChatStore";
import { useTopicStore } from "../store/TopicStore";
import { Message } from "../database/AthenaDb";
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

  const messages = displayTopicId ? ((messagesByTopic[displayTopicId] as Message[] | undefined) ?? []) : [];

  useEffect(() => {
    if (topicId !== displayTopicId) {
      setIsVisible(false);
      const fetchPromise = topicId ? fetchMessages(topicId) : Promise.resolve();

      const timer = setTimeout(() => {
        void fetchPromise.then(() => {
          const exists = topicId ? useTopicStore.getState().topics.some((t) => t.id === topicId) : true;
          if (!exists) {
            setError("Topic not found");
          } else {
            setError(null);
            setDisplayTopicId(topicId);
            setIsVisible(true);
          }
        });
      }, 200);

      return () => clearTimeout(timer);
    }
  }, [fetchMessages, topicId, displayTopicId]);

  useEffect(() => {
    if (topicId && topicId === displayTopicId && !isVisible && !error) {
      // Initial load or refresh when displayTopicId is already correct but not visible
      void fetchMessages(topicId).then(() => {
        const exists = useTopicStore.getState().topics.some((t) => t.id === topicId);
        if (!exists) {
          setError("Topic not found");
        } else {
          setError(null);
          setIsVisible(true);
        }
      });
    }
  }, [fetchMessages, topicId, displayTopicId, isVisible, error]);

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
              in={isVisible}
              timeout={{ enter: 300, exit: 200 }}>
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
        onSend={(content): void => {
          if (!topicId) return;
          void sendMessageStream(content, topicId);
        }}
        isMobile={isMobile}
      />
    </Box>
  );
};

export default ChatView;
