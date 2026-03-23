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

  const topic = useTopicStore((state) => state.topics.find((t) => t.id === displayTopicId));
  const maxContextMessages = topic?.maxContextMessages ?? 10;

  const messages = displayTopicId ? ((messagesByTopic[displayTopicId] as Message[] | undefined) ?? []) : [];

  useEffect(() => {
    if (topicId !== displayTopicId) {
      // Step 1: Fade out current content
      setIsVisible(false);

      // Step 2: Wait for fade out to complete before swapping content
      const timer = setTimeout(() => {
        setDisplayTopicId(topicId);
        if (topicId) {
          void fetchMessages(topicId).then(() => {
            // Step 3: Fade in new content
            setIsVisible(true);
          });
        }
      }, 300); // Matches the Fade timeout

      return () => clearTimeout(timer);
    } else if (topicId && !isVisible) {
      // Handle initial load or direct navigation
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
            timeout={300}>
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
