import React, { useState, useCallback, useMemo } from 'react';
import {
  Tabs,
  Tab,
  Box,
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
import type { TabProps } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers';
import { useTopicStore } from '../store/TopicStore';
import { useChatStore } from '../store/ChatStore';
import { useAuthStore } from '../store/AuthStore';
import type { Fork } from '../database/AthenaDb';

type DragIdentifier = string | number;

interface TypedDragEndEvent {
  active: { id: DragIdentifier };
  over: { id: DragIdentifier } | null;
}

interface SortableResult {
  attributes: React.AriaAttributes;
  listeners: {
    onKeyDown?: React.KeyboardEventHandler<HTMLElement>;
    onPointerDown?: React.PointerEventHandler<HTMLElement>;
    onTouchStart?: React.TouchEventHandler<HTMLElement>;
  };
  setNodeRef: (node: HTMLElement | null) => void;
  transform: unknown;
  transition: string | undefined;
  isDragging: boolean;
}

interface DndContextProps {
  children: React.ReactNode;
  sensors: unknown;
  collisionDetection: unknown;
  onDragEnd: (event: TypedDragEndEvent) => void;
  modifiers: unknown[];
}

interface SortableContextProps {
  children: React.ReactNode;
  items: string[];
  strategy: unknown;
}

const typedUseSortable = useSortable as unknown as (options: { id: string }) => SortableResult;
const typedUseSensor = useSensor as unknown as (sensor: unknown, options: Record<string, unknown>) => unknown;
const typedUseSensors = useSensors as unknown as (...sensors: unknown[]) => unknown;
const TypedDndContext = DndContext as unknown as React.ComponentType<DndContextProps>;
const TypedSortableContext = SortableContext as unknown as React.ComponentType<SortableContextProps>;
const pointerSensor = PointerSensor as unknown;
const touchSensor = TouchSensor as unknown;
const keyboardSensor = KeyboardSensor as unknown;
const keyboardCoordinates = sortableKeyboardCoordinates as unknown;
const centerCollisionDetection = closestCenter as unknown;
const horizontalAxisModifier = restrictToHorizontalAxis as unknown;
const horizontalStrategy = horizontalListSortingStrategy as unknown;
const transformToString = (CSS as unknown as { Transform: { toString: (transform: unknown) => string | undefined } }).Transform.toString;

interface ForkTabsProps {
  topicId: string;
  collapsed?: boolean;
}

interface SortableForkTabProps extends Omit<TabProps, 'children' | 'label' | 'onDelete'> {
  fork: Fork;
  onRename: (forkId: string, name: string) => void;
  onDelete: (forkId: string) => void;
  chatFontSize: number;
  canRename: boolean;
  canDelete: boolean;
}

const SortableForkTab: React.FC<SortableForkTabProps> = ({ fork, onRename, onDelete, chatFontSize, canRename, canDelete, ...muiProps }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = typedUseSortable({ id: fork.id });

  const style: React.CSSProperties = {
    transform: transformToString(transform),
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

const ForkTabs: React.FC<ForkTabsProps> = ({ topicId, collapsed = false }) => {
  const { topics, switchFork, deleteFork, renameFork, reorderFork } = useTopicStore();
  const { fetchMessages } = useChatStore();
  const { chatFontSize } = useAuthStore();
  const [forkToDelete, setForkToDelete] = useState<string | null>(null);
  const [forkToRename, setForkToRename] = useState<{ id: string; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const topic = useMemo(() => topics.find((t) => t.id === topicId), [topics, topicId]);
  const forkIds = useMemo(() => topic?.forks?.map((f) => f.id) ?? [], [topic?.forks]);

  const sensors = typedUseSensors(
    typedUseSensor(pointerSensor, { activationConstraint: { distance: 5 } }),
    typedUseSensor(touchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    typedUseSensor(keyboardSensor, { coordinateGetter: keyboardCoordinates }),
  );

  const handleDragEnd = useCallback(
    (event: TypedDragEndEvent): void => {
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

  if (collapsed) {
    return null;
  }

  const activeForkId = topic.activeForkId ?? 'main';
  const forkCount = topic.forks?.length ?? 0;

  return (
    <Box
      sx={{
        zIndex: 10,
        borderTop: 1,
        borderColor: 'divider',
      }}
    >
      <Box
        sx={{
          maxWidth: 'md',
          mx: 'auto',
          px: { xs: 1, md: 2 },
          bgcolor: (theme) => alpha(theme.palette.background.paper, 0.75),
          backdropFilter: 'blur(8px)',
        }}
      >
        <TypedDndContext
          sensors={sensors}
          collisionDetection={centerCollisionDetection}
          onDragEnd={handleDragEnd}
          modifiers={[horizontalAxisModifier]}
        >
          <TypedSortableContext items={forkIds} strategy={horizontalStrategy}>
            <Tabs value={activeForkId} onChange={handleChange} variant="scrollable" scrollButtons="auto" sx={{ minHeight: { xs: 36, md: 48 } }}>
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
          </TypedSortableContext>
        </TypedDndContext>
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
    </Box>
  );
};

export default ForkTabs;
