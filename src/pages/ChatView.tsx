import React, { useEffect, useState } from "react";
import { Box, useMediaQuery, useTheme, Fade } from "@mui/material";
import { useParams } from "react-router-dom";
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

  const { messagesByTopic, sending, sendMessage, fetchMessages } = useChatStore();
  const [displayTopicId, setDisplayTopicId] = useState<string | undefined>(topicId);
  const [isVisible, setIsVisible] = useState(false);

  // Sync state during render to ensure the fade-out starts instantly on topic change
  if (topicId !== displayTopicId && isVisible) {
    setIsVisible(false);
  }

  const topic = useTopicStore((state) => state.topics.find((t) => t.id === displayTopicId));
  const maxContextMessages = topic?.maxContextMessages ?? 10;

  const messages = displayTopicId ? ((messagesByTopic[displayTopicId] as Message[] | undefined) ?? []) : [];

  useEffect(() => {
    if (topicId !== displayTopicId) {
      // Start fetching data immediately
      const fetchPromise = topicId ? fetchMessages(topicId) : Promise.resolve();

      // Wait for both the fade out and data fetching to finish
      const timer = setTimeout(() => {
        void fetchPromise.then(() => {
          setDisplayTopicId(topicId);
          // Fade in as soon as content is swapped
          setIsVisible(true);
        });
      }, 200); // Shorter exit duration for snappier feel

      return () => clearTimeout(timer);
    } else if (topicId && !isVisible) {
      // Initial load
      void fetchMessages(topicId).then(() => {
        setIsVisible(true);
      });
    }
  }, [fetchMessages, topicId, displayTopicId, isVisible]);

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
          maxWidth={{ xs: "100%", md: "md" }}
          px={{ xs: 1, md: 2 }}
          mx="auto">
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
        </Box>
      </Box>

      <Composer
        sending={sending}
        onSend={(content): void => {
          if (!topicId) return;
          void sendMessage(content, topicId);
        }}
        isMobile={isMobile}
      />
    </Box>
  );
};

export default ChatView;
