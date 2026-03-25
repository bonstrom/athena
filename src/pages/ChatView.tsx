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

  const { messagesByTopic, sending, sendMessageStream, fetchMessages } = useChatStore();
  const [displayTopicId, setDisplayTopicId] = useState<string | undefined>(topicId);
  const [isVisible, setIsVisible] = useState(false);

  const topic = useTopicStore((state) => state.topics.find((t) => t.id === displayTopicId));
  const maxContextMessages = topic?.maxContextMessages ?? 10;

  const messages = displayTopicId ? ((messagesByTopic[displayTopicId] as Message[] | undefined) ?? []) : [];

  useEffect(() => {
    if (topicId !== displayTopicId) {
      // 1. Start fade out
      setIsVisible(false);

      // 2. Start fetching data immediately
      const fetchPromise = topicId ? fetchMessages(topicId) : Promise.resolve();

      // 3. Wait for both the fade out (200ms) and data fetching to finish
      const timer = setTimeout(() => {
        void fetchPromise.then(() => {
          setDisplayTopicId(topicId);
          // 4. Fade in as soon as content is swapped
          setIsVisible(true);
        });
      }, 200);

      return () => clearTimeout(timer);
    } else if (topicId && !isVisible) {
      // Initial load or refresh
      void fetchMessages(topicId).then(() => {
        setIsVisible(true);
      });
    }
    // We intentionally exclude isVisible from dependencies to avoid re-triggering the effect
    // when we toggle it for animations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchMessages, topicId, displayTopicId]);

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
          void sendMessageStream(content, topicId);
        }}
        isMobile={isMobile}
      />
    </Box>
  );
};

export default ChatView;
