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
  useMediaQuery,
} from '@mui/material';
import { useTopicStore } from '../store/TopicStore';
import { usePixelStore } from '../store/PixelStore';
import { useChatStore } from '../store/ChatStore';
import { useAuthStore } from '../store/AuthStore';
import { useUiStore } from '../store/UiStore';
import { useCuratorStore } from '../store/CuratorStore';
import { TopicListItem } from './TopicListItem';
import React, { JSX, useEffect, useRef, useState } from 'react';
import { groupTopicsByDate } from '../utils/groupTopicsByDate';
import { useNavigate, useParams } from 'react-router-dom';
import DeleteIcon from '@mui/icons-material/Delete';
import { TransitionGroup } from 'react-transition-group';
import TopicListTransition, { TopicListTransitionProps } from './TopicListTransition';
import TopicSelectionMarker from './TopicSelectionMarker';
import { useShallow } from 'zustand/react/shallow';

export const TopicList = (): JSX.Element => {
  const {
    topics,
    loading,
    topicsLoaded = true,
    loadTopics,
    visibleTopicCount,
    increaseVisibleTopicCount,
    deleteTopics,
  } = useTopicStore(useShallow((state) => ({
    topics: state.topics,
    loading: state.loading,
    topicsLoaded: state.topicsLoaded,
    loadTopics: state.loadTopics,
    visibleTopicCount: state.visibleTopicCount,
    increaseVisibleTopicCount: state.increaseVisibleTopicCount,
    deleteTopics: state.deleteTopics,
  })));
  const preloadTopics = useChatStore((state) => state.preloadTopics);
  const topicPreloadCount = useAuthStore((state) => state.topicPreloadCount);
  const pixelDocuments = usePixelStore((state) => state.documents);
  const { selectedTopicIds, selectAllTopics, clearTopicSelection, sidebarFilter } = useUiStore(useShallow((state) => ({
    selectedTopicIds: state.selectedTopicIds,
    selectAllTopics: state.selectAllTopics,
    clearTopicSelection: state.clearTopicSelection,
    sidebarFilter: state.sidebarFilter,
  })));
  const { topicId } = useParams();
  const navigate = useNavigate();
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [inProgressIds, setInProgressIds] = useState<Set<string>>(new Set());
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const listRef = useRef<HTMLUListElement>(null);
  const liveTopicIds = new Set(topics.map((topic) => topic.id));
  const snapshot = useRef({ topics, ids: liveTopicIds, ready: topicsLoaded });
  const enteringIds = useRef(new Set<string>());
  if (snapshot.current.topics !== topics) {
    if (snapshot.current.ready && topicsLoaded && !loading) {
      for (const id of liveTopicIds) {
        if (!snapshot.current.ids.has(id)) enteringIds.current.add(id);
      }
    }
    snapshot.current = { topics, ids: liveTopicIds, ready: topicsLoaded };
  } else {
    snapshot.current.ready = topicsLoaded;
  }

  const courseRevision = topics.filter((topic) => topic.mode === 'curator').map((topic) => `${topic.id}:${topic.updatedOn}`).join('|');
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
  }, [courseRevision]);

  const topTopicUpdatedOn = topics[0]?.updatedOn;
  const topTopicId = topics[0]?.id;

  useEffect(() => {
    // If the top element's time or ID shifts (e.g. bumped to top), smoothly scroll into view
    const container = document.getElementById('sidebar-scroll-container');
    if (container) {
      container.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
    }
  }, [topTopicUpdatedOn, topTopicId, reducedMotion]);

  const filteredTopics = React.useMemo(() => {
    // Sprite chats live in the Pixel Art view; listing them as ordinary topics
    // would show a conversation with no canvas next to it.
    const spriteChatIds = new Set(
      pixelDocuments.map((document) => document.chatTopicId).filter((id): id is string => Boolean(id)),
    );
    const visible = topics.filter((topic) => !spriteChatIds.has(topic.id));

    if (sidebarFilter === 'courses') return visible.filter((t) => t.mode === 'curator');
    if (sidebarFilter === 'debates') return visible.filter((t) => t.mode === 'debate');
    if (sidebarFilter === 'checklists') return visible.filter((t) => t.mode === 'checklist');
    if (sidebarFilter === 'topics') return visible.filter((t) => !t.mode || t.mode === 'topic');
    return visible;
  }, [topics, sidebarFilter, pixelDocuments]);

  const visibleTopics = React.useMemo(
    () => filteredTopics.slice(0, visibleTopicCount),
    [filteredTopics, visibleTopicCount],
  );

  const sections = React.useMemo(() => {
    const inProgressTopics = visibleTopics.filter((t) => inProgressIds.has(t.id));
    const normalTopics = visibleTopics.filter((t) => !inProgressIds.has(t.id));
    return [
      ...(inProgressTopics.length > 0 ? [{ label: 'In Progress', topics: inProgressTopics, inProgress: true }] : []),
      ...groupTopicsByDate(normalTopics).map((group) => ({ ...group, inProgress: false })),
    ];
  }, [visibleTopics, inProgressIds]);

  const hasMoreToShow = visibleTopicCount < filteredTopics.length;
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
          px={1}
          py={0.5}
          bgcolor="action.selected">
          <Typography
            variant="body2"
            sx={{ textAlign: 'center', py: 0.5 }}>
            {selectionCount} selected
          </Typography>
          <Box
            display="flex"
            alignItems="center"
            justifyContent="space-evenly">
            {selectionCount < visibleTopics.length && (
              <Button
                size="small"
                sx={{ minWidth: 0, px: 1, whiteSpace: 'nowrap' }}
                onClick={handleSelectAll}>
                Select All
              </Button>
            )}
            <Button
              size="small"
              sx={{ minWidth: 0, px: 1 }}
              onClick={clearTopicSelection}>
              Cancel
            </Button>
            <Button
              size="small"
              color="error"
              startIcon={<DeleteIcon />}
              sx={{ minWidth: 0, px: 1, whiteSpace: 'nowrap' }}
              onClick={(): void => setBulkDeleteConfirmOpen(true)}>
              Delete
            </Button>
          </Box>
        </Box>
      )}

      <List
        ref={listRef}
        sx={{ position: 'relative' }}>
        <TopicSelectionMarker listRef={listRef} />
        <TransitionGroup
          component={null}
          childFactory={
            (child: React.ReactElement<TopicListTransitionProps>): React.ReactElement<TopicListTransitionProps> =>
              React.cloneElement(child, {
                animateExit: topicsLoaded && !loading && child.props.topicIds.every((id) => !liveTopicIds.has(id)),
              })
          }>
          {sections.flatMap((group) => [
            <TopicListTransition
              key={`header:${group.label}`}
              topicIds={group.topics.map((topic) => topic.id)}
              reducedMotion={reducedMotion}>
              <ListSubheader
                component="div"
                disableSticky
                sx={{
                  fontSize: '0.65rem',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: group.inProgress ? 'primary.main' : 'text.secondary',
                  lineHeight: '2.5rem',
                  bgcolor: 'transparent',
                  fontWeight: group.inProgress ? 700 : undefined,
                }}>
                {group.label}
              </ListSubheader>
            </TopicListTransition>,
            ...group.topics.map((topic) => (
              <TopicListTransition
                key={`topic:${topic.id}`}
                topicIds={[topic.id]}
                animateEnter={enteringIds.current.has(topic.id)}
                reducedMotion={reducedMotion}
                onEntered={(): void => {
                  enteringIds.current.delete(topic.id);
                }}>
                <TopicListItem topic={topic} />
              </TopicListTransition>
            )),
          ])}
        </TransitionGroup>
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
