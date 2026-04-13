import { Box, CircularProgress, List, ListSubheader, Button } from '@mui/material';
import { useTopicStore } from '../store/TopicStore';
import { useChatStore } from '../store/ChatStore';
import { useAuthStore } from '../store/AuthStore';
import { TopicListItem } from './TopicListItem';
import React, { JSX, useEffect } from 'react';
import { groupTopicsByDate } from '../utils/groupTopicsByDate';

export const TopicList = (): JSX.Element => {
  const { topics, loading, loadTopics, visibleTopicCount, increaseVisibleTopicCount } = useTopicStore();
  const preloadTopics = useChatStore((state) => state.preloadTopics);
  const topicPreloadCount = useAuthStore((state) => state.topicPreloadCount);

  useEffect(() => {
    void loadTopics().then(() => {
      const recentIds = useTopicStore
        .getState()
        .topics.slice(0, topicPreloadCount)
        .map((t) => t.id);
      void preloadTopics(recentIds);
    });
  }, [loadTopics, preloadTopics, topicPreloadCount]);

  useEffect(() => {
    // If the top element's time or ID shifts (e.g. bumped to top), smoothly scroll into view
    const container = document.getElementById('sidebar-scroll-container');
    if (container) {
      container.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [topics[0]?.updatedOn, topics[0]?.id]);

  const visibleTopics = topics.slice(0, visibleTopicCount);
  const grouped = groupTopicsByDate(visibleTopics);

  const hasMoreToShow = visibleTopicCount < topics.length;

  return (
    <>
      <List>
        {grouped.map((group) => (
          <React.Fragment key={group.label}>
            <ListSubheader
              disableSticky
              sx={{
                fontSize: '0.65rem',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'text.secondary',
                lineHeight: '2.5rem',
                bgcolor: 'transparent',
              }}
            >
              {group.label}
            </ListSubheader>
            {group.topics.map((topic) => (
              <TopicListItem key={topic.id} topic={topic} />
            ))}
          </React.Fragment>
        ))}
      </List>

      <Box p={2} textAlign="center">
        {loading ? (
          <CircularProgress size={24} />
        ) : (
          hasMoreToShow && (
            <Button onClick={increaseVisibleTopicCount} variant="outlined">
              Load Older Topics
            </Button>
          )
        )}
      </Box>
    </>
  );
};
