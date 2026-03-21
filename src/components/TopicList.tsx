import { Box, CircularProgress, List, ListSubheader, Button } from "@mui/material";
import { useTopicStore } from "../store/TopicStore";
import { TopicListItem } from "./TopicListItem";
import React, { JSX, useEffect } from "react";
import { groupTopicsByDate } from "../utils/groupTopicsByDate";

export const TopicList = (): JSX.Element => {
  const { topics, loading, loadTopics, visibleTopicCount, increaseVisibleTopicCount } = useTopicStore();

  useEffect(() => {
    void loadTopics();
  }, [loadTopics]);

  const visibleTopics = topics.slice(0, visibleTopicCount);
  const grouped = groupTopicsByDate(visibleTopics);

  const hasMoreToShow = visibleTopicCount < topics.length;

  return (
    <>
      <List>
        {grouped.map((group) => (
          <React.Fragment key={group.label}>
            <ListSubheader>{group.label}</ListSubheader>
            {group.topics.map((topic) => (
              <TopicListItem
                key={topic.id}
                topic={topic}
              />
            ))}
          </React.Fragment>
        ))}
      </List>

      <Box
        p={2}
        textAlign="center">
        {loading ? (
          <CircularProgress size={24} />
        ) : (
          hasMoreToShow && (
            <Button
              onClick={increaseVisibleTopicCount}
              variant="outlined">
              Load Older Topics
            </Button>
          )
        )}
      </Box>
    </>
  );
};
