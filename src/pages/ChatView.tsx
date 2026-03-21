import React, { useEffect } from "react";
import { Box, useMediaQuery, useTheme } from "@mui/material";
import { useParams } from "react-router-dom";
import { useChatStore } from "../store/ChatStore";
import { Message } from "../database/AthenaDb";
import MessageList from "../components/MessageList";
import Composer from "../components/Composer";

const ChatView: React.FC = () => {
  const { topicId } = useParams<{ topicId: string }>();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const { messagesByTopic, currentTopicId, sending, sendMessage, fetchMessages } = useChatStore();

  const messages = currentTopicId ? ((messagesByTopic[currentTopicId] as Message[] | undefined) ?? []) : [];

  useEffect(() => {
    if (topicId) {
      void fetchMessages(topicId);
    }
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
          maxWidth={{ xs: "100%", md: "md" }}
          px={{ xs: 1, md: 2 }}
          mx="auto">
          <MessageList messages={messages} />
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
