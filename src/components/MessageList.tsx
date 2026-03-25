import React, { JSX, useEffect, useRef } from "react";
import { ListItem, Button, Fab, Box, Typography } from "@mui/material";
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

const Pane: React.FC<{
  groups: { msg: Message; versions?: Message[] }[];
  maxContextMessages: number;
  showAllMessages: boolean;
}> = ({ groups, maxContextMessages, showAllMessages }) => {
  const scrollToBottom = useScrollToBottom();
  const [sticky] = useSticky();

  const lastGroup = groups.length > 0 ? groups[groups.length - 1] : undefined;
  const last = lastGroup?.msg;
  const sig = last ? `${last.id}:${last.content.length}` : "";

  const prevSigRef = useRef(sig);
  const wasStickyRef = useRef<boolean>(true);

  useEffect(() => {
    if (sig !== prevSigRef.current && wasStickyRef.current) {
      scrollToBottom({ behavior: "smooth" });
    }

    prevSigRef.current = sig;
    wasStickyRef.current = sticky;
  }, [sig, sticky, scrollToBottom]);

  // For the context window indicator, we need the active sequence
  const contextMessages = groups.map((g) => g.msg).filter((m) => m.type === "user" || m.type === "assistant");
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
              <ListItem sx={{ py: 1, px: 2, display: "flex", alignItems: "center", gap: 2 }}>
                <Box sx={{ flex: 1, height: "1px", bgcolor: "divider", opacity: 0.3 }} />
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ opacity: 0.5, whiteSpace: "nowrap", userSelect: "none" }}>
                  Context Window
                </Typography>
                <Box sx={{ flex: 1, height: "1px", bgcolor: "divider", opacity: 0.3 }} />
              </ListItem>
            )}
            <ListItem
              disableGutters
              sx={{ px: 2 }}>
              <MessageBubble
                message={
                  m.type === "aiNote" && !showAllMessages
                    ? { ...m, content: "⚠️ Assistant stored a hidden note here." }
                    : m
                }
                versions={versions}
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
}

const ROOT_CLASS = css({ height: "100%" });
const FOLLOW_BUTTON_CLASS = css({ display: "none" });

const MessageList: React.FC<Props> = ({ messages, maxContextMessages }) => {
  const { topicId } = useParams();
  const { visibleMessageCount, increaseVisibleMessageCount } = useChatStore();
  const { showAllMessages } = useUiStore();

  // 1. Filter deleted and sort
  const all = messages
    .filter((m) => !m.isDeleted)
    .sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime());

  // 2. Group versions
  const processedGroups: { msg: Message; versions?: Message[] }[] = [];
  const processedIds = new Set<string>();

  // Pre-index assistant messages by parentId for O(N) grouping
  const assistantByParent = new Map<string, Message[]>();
  for (const m of all) {
    if (m.type === "assistant" && m.parentMessageId) {
      const existing = assistantByParent.get(m.parentMessageId) ?? [];
      existing.push(m);
      assistantByParent.set(m.parentMessageId, existing);
    }
  }

  for (const m of all) {
    if (processedIds.has(m.id)) continue;

    if (m.type === "user") {
      processedIds.add(m.id);
      processedGroups.push({ msg: m });

      const versions = assistantByParent.get(m.id);
      if (versions && versions.length > 0) {
        const activeId = m.activeResponseId ?? versions[versions.length - 1].id;
        const activeVersion = versions.find((v) => v.id === activeId) ?? versions[versions.length - 1];
        processedGroups.push({ msg: activeVersion, versions });
        versions.forEach((v) => processedIds.add(v.id));
      }
    } else {
      // Standalone assistant, aiNote, system, etc.
      processedGroups.push({ msg: m });
      processedIds.add(m.id);
    }
  }

  // 3. Slice the groups based on visible count
  const visibleGroups = processedGroups.slice(-visibleMessageCount);

  return (
    <ScrollToBottom
      key={topicId}
      className={ROOT_CLASS}
      initialScrollBehavior="auto"
      scrollViewClassName="my-scroll-view"
      followButtonClassName={FOLLOW_BUTTON_CLASS}>
      {processedGroups.length > visibleGroups.length && (
        <ListItem>
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
      />
    </ScrollToBottom>
  );
};

export default MessageList;
