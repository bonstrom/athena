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
import { useCuratorStore } from '../store/CuratorStore';
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
  const [inProgressIds, setInProgressIds] = useState<Set<string>>(new Set());

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
    useCuratorStore
      .getState()
      .getUnfinishedTopicIds()
      .then((ids) => {
        setInProgressIds((prev) => {
          if (prev.size === ids.size && [...prev].every((id) => ids.has(id))) return prev;
          return ids;
        });
      })
      .catch(() => {
        setInProgressIds((prev) => (prev.size === 0 ? prev : new Set()));
      });
  }, [topics]);

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
  const inProgressTopics = visibleTopics.filter((t) => inProgressIds.has(t.id));
  const normalTopics = visibleTopics.filter((t) => !inProgressIds.has(t.id));
  const grouped = groupTopicsByDate(normalTopics);

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
        <Box px={1} py={0.5} bgcolor="action.selected">
          <Typography variant="body2" sx={{ textAlign: 'center', py: 0.5 }}>
            {selectionCount} selected
          </Typography>
          <Box display="flex" alignItems="center" justifyContent="space-evenly">
            {selectionCount < visibleTopics.length && (
              <Button size="small" sx={{ minWidth: 0, px: 1, whiteSpace: 'nowrap' }} onClick={handleSelectAll}>
                Select All
              </Button>
            )}
            <Button size="small" sx={{ minWidth: 0, px: 1 }} onClick={clearTopicSelection}>
              Cancel
            </Button>
            <Button
              size="small"
              color="error"
              startIcon={<DeleteIcon />}
              sx={{ minWidth: 0, px: 1, whiteSpace: 'nowrap' }}
              onClick={(): void => setBulkDeleteConfirmOpen(true)}
            >
              Delete
            </Button>
          </Box>
        </Box>
      )}

      <List>
        {inProgressTopics.length > 0 && (
          <React.Fragment key="in-progress">
            <ListSubheader
              disableSticky
              sx={{
                fontSize: '0.65rem',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'primary.main',
                lineHeight: '2.5rem',
                bgcolor: 'transparent',
                fontWeight: 700,
              }}
            >
              In Progress
            </ListSubheader>
            {inProgressTopics.map((topic) => (
              <TopicListItem key={topic.id} topic={topic} />
            ))}
          </React.Fragment>
        )}
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

      <Dialog open={bulkDeleteConfirmOpen} onClose={(): void => setBulkDeleteConfirmOpen(false)}>
        <DialogTitle>Delete {selectionCount} Topics?</DialogTitle>

        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete {selectionCount} topics? All messages within these topics will also be deleted. This cannot be undone.
          </DialogContentText>
        </DialogContent>

        <DialogActions>
          <Button onClick={(): void => setBulkDeleteConfirmOpen(false)}>Cancel</Button>

          <Button
            onClick={(): void => {
              void handleBulkDelete();
            }}
            color="error"
          >
            Delete All
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
