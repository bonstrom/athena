import React, { JSX, useEffect, useRef } from "react";
import { ListItem, Button, Fab } from "@mui/material";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ScrollToBottom, { useScrollToBottom, useSticky } from "react-scroll-to-bottom";
import { css } from "@emotion/css";
import { useParams } from "react-router-dom";

import { useChatStore } from "../store/ChatStore";
import { useUiStore } from "../store/UiStore";
import MessageBubble from "./MessageBubble";
import { Message } from "../database/AthenaDb";

const FollowFab = (): JSX.Element | null => {
  const scrollToBottom = useScrollToBottom();
  const [sticky] = useSticky();
  if (sticky) return null;

  return (
    <Fab
      color="primary"
      size="small"
      sx={{
        position: "absolute",
        right: 20,
        bottom: 10,
        zIndex: 10,
        minHeight: 32,
        height: 32,
        width: 32,
        p: 0,
        bgcolor: "transparent",
        boxShadow: "none",
        color: "primary.main",
        "&:hover": {
          bgcolor: "primary.main",
          color: "#fff",
          boxShadow: 3,
        },
      }}
      onClick={(): void => scrollToBottom({ behavior: "smooth" })}>
      <ArrowDownwardIcon fontSize="small" />
    </Fab>
  );
};

const Pane: React.FC<{ messages: Message[] }> = ({ messages }) => {
  const { showAllMessages } = useUiStore();

  const scrollToBottom = useScrollToBottom();
  const [sticky] = useSticky();

  const last = messages.length > 0 ? messages[messages.length - 1] : undefined;
  const sig = last ? `${last.id}:${last.content.length}` : "";

  const prevSigRef = useRef(sig);
  const wasStickyRef = useRef<boolean>(true);

  useEffect(() => {
    if (sig !== prevSigRef.current && wasStickyRef.current) {
      scrollToBottom({ behavior: "smooth" });
    }

    prevSigRef.current = sig;
    wasStickyRef.current = sticky;
  });

  return (
    <>
      {messages.map((m) => (
        <ListItem
          key={m.id}
          disableGutters
          sx={{ px: 2 }}>
          <MessageBubble
            message={
              m.type === "aiNote" && !showAllMessages ? { ...m, content: "⚠️ Assistant stored a hidden note here." } : m
            }
          />
        </ListItem>
      ))}

      <FollowFab />
    </>
  );
};

interface Props {
  messages: Message[];
}

const MessageList: React.FC<Props> = ({ messages }) => {
  const { topicId } = useParams();
  const { visibleMessageCount, increaseVisibleMessageCount } = useChatStore();

  const visible = messages.filter((m) => !m.isDeleted).slice(-visibleMessageCount);

  const ROOT = css({ height: "100%" });

  return (
    <ScrollToBottom
      key={topicId}
      className={ROOT}
      initialScrollBehavior="auto"
      scrollViewClassName="my-scroll-view"
      followButtonClassName={css({ display: "none" })}>
      {messages.length > visible.length && (
        <ListItem>
          <Button
            onClick={increaseVisibleMessageCount}
            fullWidth
            variant="outlined">
            Load older messages
          </Button>
        </ListItem>
      )}

      <Pane messages={visible} />
    </ScrollToBottom>
  );
};

export default MessageList;
