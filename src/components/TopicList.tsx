import {
  Box,
  CircularProgress,
  List,
  ListSubheader,
  Button,
  Typography,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';
import { useTopicStore } from '../store/TopicStore';
import { useChatStore } from '../store/ChatStore';
import { useAuthStore } from '../store/AuthStore';
import { useUiStore } from '../store/UiStore';
import { TopicListItem } from './TopicListItem';
import React, { JSX, useEffect, useState } from 'react';
import { groupTopicsByDate } from '../utils/groupTopicsByDate';
import { useNavigate, useParams } from 'react-router-dom';
import DeleteIcon from '@mui/icons-material/Delete';

export const TopicList = (): JSX.Element => {
  const { topics, loading, loadTopics, visibleTopicCount, increaseVisibleTopicCount, deleteTopics } = useTopicStore();
  const preloadTopics = useChatStore((state) => state.preloadTopics);
  const topicPreloadCount = useAuthStore((state) => state.topicPreloadCount);
  const { selectedTopicIds, selectAllTopics, clearTopicSelection } = useUiStore();
  const { topicId } = useParams();
  const navigate = useNavigate();
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    void loadTopics().then(() => {
      const recentIds = useTopicStore
        .getState()
        .topics.slice(0, topicPreloadCount)
        .map((t) => t.id);
      void preloadTopics(recentIds);
    });
  }, [loadTopics, preloadTopics, topicPreloadCount]);

  const topTopicUpdatedOn = topics[0]?.updatedOn;
  const topTopicId = topics[0]?.id;

  useEffect(() => {
    // If the top element's time or ID shifts (e.g. bumped to top), smoothly scroll into view
    const container = document.getElementById('sidebar-scroll-container');
    if (container) {
      container.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [topTopicUpdatedOn, topTopicId]);

  const visibleTopics = topics.slice(0, visibleTopicCount);
  const grouped = groupTopicsByDate(visibleTopics);

  const hasMoreToShow = visibleTopicCount < topics.length;
  const selectionCount = selectedTopicIds.size;
  const isSelecting = selectionCount > 0;

  const handleSelectAll = (): void => {
    const visibleIds = visibleTopics.map((t) => t.id);
    selectAllTopics(visibleIds);
  };

  const handleBulkDelete = async (): Promise<void> => {
    setBulkDeleteConfirmOpen(false);
    const ids = Array.from(selectedTopicIds);
    await deleteTopics(ids);
    clearTopicSelection();
    if (topicId && ids.includes(topicId)) {
      void navigate('/');
    }
  };

  return (
    <>
      {isSelecting && (
        <Box
          display="flex"
          alignItems="center"
          gap={1}
          px={2}
          py={1}
          bgcolor="action.selected">
          <Typography
            variant="body2"
            sx={{ flexGrow: 1 }}>
            {selectionCount} selected
          </Typography>
          {selectionCount < visibleTopics.length && (
            <Button
              size="small"
              onClick={handleSelectAll}>
              Select All
            </Button>
          )}
          <Button
            size="small"
            onClick={clearTopicSelection}>
            Clear
          </Button>
          <Button
            size="small"
            color="error"
            startIcon={<DeleteIcon />}
            onClick={(): void => setBulkDeleteConfirmOpen(true)}>
            Delete
          </Button>
        </Box>
      )}

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
              }}>
              {group.label}
            </ListSubheader>
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

      <Dialog
        open={bulkDeleteConfirmOpen}
        onClose={(): void => setBulkDeleteConfirmOpen(false)}>
        <DialogTitle>Delete {selectionCount} Topics?</DialogTitle>

        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete {selectionCount} topics? All messages within these topics will also be
            deleted. This cannot be undone.
          </DialogContentText>
        </DialogContent>

        <DialogActions>
          <Button onClick={(): void => setBulkDeleteConfirmOpen(false)}>Cancel</Button>

          <Button
            onClick={(): void => {
              void handleBulkDelete();
            }}
            color="error">
            Delete All
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
