import React, { useState, useCallback, useMemo } from 'react';
import {
  Tabs,
  Tab,
  Box,
  Paper,
  alpha,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  TextField,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers';
import { useTopicStore } from '../store/TopicStore';
import { useChatStore } from '../store/ChatStore';
import { useAuthStore } from '../store/AuthStore';
import type { Fork } from '../database/AthenaDb';

interface ForkTabsProps {
  topicId: string;
}

interface SortableForkTabProps {
  fork: Fork;
  onRename: (forkId: string, name: string) => void;
  onDelete: (forkId: string) => void;
  chatFontSize: number;
  canRename: boolean;
  canDelete: boolean;
  [key: string]: unknown;
}

const SortableForkTab: React.FC<SortableForkTabProps> = ({
  fork,
  onRename,
  onDelete,
  chatFontSize,
  canRename,
  canDelete,
  ...muiProps
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: fork.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 100 : undefined,
    position: 'relative',
  };

  return (
    <Tab
      {...listeners}
      {...muiProps}
      ref={setNodeRef}
      value={fork.id}
      aria-roledescription={attributes['aria-roledescription']}
      aria-describedby={attributes['aria-describedby']}
      style={style}
      label={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {fork.name}
          {canRename && (
            <IconButton
              component="span"
              size="small"
              aria-label={`Rename branch ${fork.name}`}
              onClick={(e): void => {
                e.stopPropagation();
                onRename(fork.id, fork.name);
              }}
              sx={{
                p: 0.2,
                ml: 0.25,
                opacity: 0.5,
                '&:hover': { opacity: 1, bgcolor: 'rgba(0,0,0,0.1)' },
              }}
            >
              <EditIcon sx={{ fontSize: '0.7rem' }} />
            </IconButton>
          )}
          {canDelete && (
            <IconButton
              component="span"
              size="small"
              aria-label={`Delete branch ${fork.name}`}
              onClick={(e): void => {
                e.stopPropagation();
                onDelete(fork.id);
              }}
              sx={{
                p: 0.2,
                ml: 0.5,
                opacity: 0.5,
                '&:hover': { opacity: 1, bgcolor: 'rgba(0,0,0,0.1)' },
              }}
            >
              <CloseIcon sx={{ fontSize: '0.75rem' }} />
            </IconButton>
          )}
        </Box>
      }
      sx={{
        textTransform: 'none',
        fontWeight: 500,
        fontSize: `${Math.max(13, chatFontSize * 0.9)}px`,
        minWidth: 100,
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
    />
  );
};

const ForkTabs: React.FC<ForkTabsProps> = ({ topicId }) => {
  const { topics, switchFork, deleteFork, renameFork, reorderFork } = useTopicStore();
  const { fetchMessages } = useChatStore();
  const { chatFontSize } = useAuthStore();
  const [forkToDelete, setForkToDelete] = useState<string | null>(null);
  const [forkToRename, setForkToRename] = useState<{ id: string; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const topic = useMemo(() => topics.find((t) => t.id === topicId), [topics, topicId]);
  const forkIds = useMemo(() => topic?.forks?.map((f) => f.id) ?? [], [topic?.forks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent): void => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = forkIds.indexOf(String(active.id));
      const newIndex = forkIds.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return;

      void (async (): Promise<void> => {
        await reorderFork(topicId, oldIndex, newIndex);
      })();
    },
    [topicId, forkIds, reorderFork],
  );

  const handleChange = useCallback(
    (_event: React.SyntheticEvent, newValue: string): void => {
      if (newValue === (topic?.activeForkId ?? 'main')) return;
      void (async (): Promise<void> => {
        await switchFork(topicId, newValue);
        await fetchMessages(topicId, newValue);
      })();
    },
    [topicId, topic?.activeForkId, switchFork, fetchMessages],
  );

  const handleRenameClick = useCallback((forkId: string, name: string): void => {
    setForkToRename({ id: forkId, name });
    setRenameValue(name);
  }, []);

  const handleDeleteClick = useCallback((forkId: string): void => {
    setForkToDelete(forkId);
  }, []);

  const handleConfirmRename = useCallback((): void => {
    if (!forkToRename || !renameValue.trim()) return;
    void (async (): Promise<void> => {
      await renameFork(topicId, forkToRename.id, renameValue.trim());
      setForkToRename(null);
    })();
  }, [forkToRename, renameValue, renameFork, topicId]);

  const handleConfirmDelete = useCallback((): void => {
    if (!forkToDelete) return;
    void (async (): Promise<void> => {
      await deleteFork(topicId, forkToDelete);
      const updatedTopic = useTopicStore.getState().topics.find((t) => t.id === topicId);
      if (updatedTopic) {
        await fetchMessages(topicId, updatedTopic.activeForkId ?? 'main');
      }
      setForkToDelete(null);
    })();
  }, [forkToDelete, deleteFork, fetchMessages, topicId]);

  if (!topic || (topic.forks?.length ?? 0) <= 1) {
    return null;
  }

  const activeForkId = topic.activeForkId ?? 'main';
  const forkCount = topic.forks?.length ?? 0;

  return (
    <Paper
      elevation={0}
      sx={{
        borderBottom: 1,
        borderColor: 'divider',
        bgcolor: (theme) => alpha(theme.palette.background.paper, 0.8),
        backdropFilter: 'blur(8px)',
        position: 'sticky',
        top: 0,
        zIndex: 10,
        mb: 2,
        borderRadius: 0,
      }}
    >
      <Box sx={{ maxWidth: 'md', mx: 'auto', px: 2 }}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          modifiers={[restrictToHorizontalAxis]}
        >
          <SortableContext items={forkIds} strategy={horizontalListSortingStrategy}>
            <Tabs
              value={activeForkId}
              onChange={handleChange}
              variant="scrollable"
              scrollButtons="auto"
              sx={{ minHeight: 48 }}
            >
              {topic.forks?.map((fork) => (
                <SortableForkTab
                  key={fork.id}
                  value={fork.id}
                  fork={fork}
                  onRename={handleRenameClick}
                  onDelete={handleDeleteClick}
                  chatFontSize={chatFontSize}
                  canRename={forkCount > 1}
                  canDelete={forkCount > 1}
                />
              ))}
            </Tabs>
          </SortableContext>
        </DndContext>
      </Box>

      <Dialog open={Boolean(forkToDelete)} onClose={(): void => setForkToDelete(null)}>
        <DialogTitle>Delete Conversation Branch</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this branch? All messages unique to this branch will be permanently removed.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={(): void => setForkToDelete(null)}>Cancel</Button>
          <Button onClick={handleConfirmDelete} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(forkToRename)} onClose={(): void => setForkToRename(null)}>
        <DialogTitle>Rename Branch</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Branch name"
            value={renameValue}
            onChange={(e): void => setRenameValue(e.target.value)}
            onKeyDown={(e): void => {
              if (e.key === 'Enter') handleConfirmRename();
            }}
            sx={{ mt: 1, minWidth: 280 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={(): void => setForkToRename(null)}>Cancel</Button>
          <Button onClick={handleConfirmRename} variant="contained" disabled={!renameValue.trim()}>
            Rename
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default ForkTabs;
