import React, { JSX, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import type { Topic, ChecklistGroup, ChecklistItem, ChecklistTab } from '../database/AthenaDb';
import { useChecklistStore } from '../store/ChecklistStore';
import { useChatStore } from '../store/ChatStore';
import ChecklistComposer from './ChecklistComposer';
import MarkdownWithCode from './MarkdownWithCode';

function useDndSensors(): ReturnType<typeof useSensors> {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

interface SortableItemProps {
  item: ChecklistItem;
  isMobile: boolean;
  index: number;
  count: number;
  onToggle: (item: ChecklistItem) => void;
  onEdit: (item: ChecklistItem) => void;
  onDelete: (itemId: string) => void;
  onMoveItem: (fromIndex: number, toIndex: number) => void;
}

const SortableItem = React.memo(function SortableItem({
  item,
  isMobile,
  index,
  count,
  onToggle,
  onEdit,
  onDelete,
  onMoveItem,
}: SortableItemProps): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const [expanded, setExpanded] = useState(false);
  const detailsId = `checklist-item-details-${item.id}`;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Box
      ref={setNodeRef}
      style={style}
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 0.5,
        py: 0.5,
        px: 0.5,
        borderRadius: 2,
        '&:hover': {
          bgcolor: (theme) => (theme.palette.mode === 'dark' ? alpha('#fff', 0.04) : alpha('#000', 0.03)),
        },
      }}
    >
      {isMobile ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', mt: 0.25 }}>
          <IconButton
            size="small"
            aria-label={`Move task ${item.content} up`}
            disabled={index === 0}
            onClick={(): void => onMoveItem(index, index - 1)}
            sx={{ p: 0, color: 'text.secondary' }}
          >
            <KeyboardArrowUpIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            aria-label={`Move task ${item.content} down`}
            disabled={index === count - 1}
            onClick={(): void => onMoveItem(index, index + 1)}
            sx={{ p: 0, color: 'text.secondary' }}
          >
            <KeyboardArrowDownIcon fontSize="small" />
          </IconButton>
        </Box>
      ) : (
        <IconButton
          size="small"
          {...attributes}
          {...listeners}
          aria-label={`Reorder task ${item.content}`}
          sx={{ cursor: isDragging ? 'grabbing' : 'grab', mt: 0.25, p: 0.25, color: 'text.secondary' }}
        >
          <DragIndicatorIcon fontSize="small" />
        </IconButton>
      )}

      <Checkbox
        size="small"
        checked={item.checked}
        onChange={(): void => onToggle(item)}
        inputProps={{ 'aria-label': `Toggle task ${item.content}` }}
        sx={{ p: 0.5, mt: 0.25 }}
      />

      <Box sx={{ flexGrow: 1, minWidth: 0, mt: 0.25 }}>
        <Typography
          variant="body2"
          sx={{
            textDecoration: item.checked ? 'line-through' : 'none',
            color: item.checked ? 'text.secondary' : 'text.primary',
            wordBreak: 'break-word',
          }}
        >
          {item.content}
        </Typography>
        {item.details && (
          <>
            <Button
              size="small"
              aria-controls={detailsId}
              aria-expanded={expanded}
              onClick={(): void => setExpanded((v) => !v)}
              sx={{ p: 0, minWidth: 0, fontSize: '0.7rem', textTransform: 'none', color: 'primary.main' }}
              endIcon={<ExpandMoreIcon sx={{ fontSize: 16, transform: expanded ? 'rotate(180deg)' : 'none' }} />}
            >
              {expanded ? 'Hide details' : 'Details'}
            </Button>
            <Collapse in={expanded}>
              <Box
                id={detailsId}
                sx={{
                  mt: 0.5,
                  px: 1,
                  py: 0.5,
                  borderRadius: 1,
                  bgcolor: (theme) => (theme.palette.mode === 'dark' ? alpha('#fff', 0.04) : alpha('#000', 0.03)),
                }}
              >
                <MarkdownWithCode>{item.details}</MarkdownWithCode>
              </Box>
            </Collapse>
          </>
        )}
      </Box>

      <IconButton size="small" aria-label={`Edit task ${item.content}`} onClick={(): void => onEdit(item)} sx={{ color: 'text.secondary' }}>
        <EditOutlinedIcon fontSize="small" />
      </IconButton>
      <IconButton size="small" aria-label={`Delete task ${item.content}`} onClick={(): void => onDelete(item.id)} sx={{ color: 'text.secondary' }}>
        <DeleteOutlineIcon fontSize="small" />
      </IconButton>
    </Box>
  );
});

interface SortableGroupProps {
  group: ChecklistGroup;
  items: ChecklistItem[];
  isMobile: boolean;
  groupIndex: number;
  groupCount: number;
  onToggleItem: (item: ChecklistItem) => void;
  onEditItem: (item: ChecklistItem) => void;
  onDeleteItem: (itemId: string) => void;
  onAddItem: (groupId: string, content: string) => Promise<boolean>;
  onRenameGroup: (group: ChecklistGroup) => void;
  onDeleteGroup: (groupId: string) => void;
  onReorderItems: (groupId: string, fromIndex: number, toIndex: number) => void;
  onMoveGroup: (fromIndex: number, toIndex: number) => void;
}

const SortableGroup = React.memo(function SortableGroup({
  group,
  items,
  isMobile,
  groupIndex,
  groupCount,
  onToggleItem,
  onEditItem,
  onDeleteItem,
  onAddItem,
  onRenameGroup,
  onDeleteGroup,
  onReorderItems,
  onMoveGroup,
}: SortableGroupProps): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: group.id });
  const sensors = useDndSensors();
  const [adding, setAdding] = useState(false);
  const [newItemText, setNewItemText] = useState('');
  const [addingItem, setAddingItem] = useState(false);

  const itemIds = useMemo(() => items.map((i) => i.id), [items]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent): void => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const fromIndex = itemIds.indexOf(String(active.id));
      const toIndex = itemIds.indexOf(String(over.id));
      if (fromIndex === -1 || toIndex === -1) return;
      onReorderItems(group.id, fromIndex, toIndex);
    },
    [itemIds, group.id, onReorderItems],
  );

  const commitNewItem = async (): Promise<void> => {
    const trimmed = newItemText.trim();
    if (!trimmed || addingItem) return;
    setAddingItem(true);
    const created = await onAddItem(group.id, trimmed);
    setAddingItem(false);
    if (created) {
      setNewItemText('');
      setAdding(false);
    }
  };

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Box
      ref={setNodeRef}
      style={style}
      sx={{
        mb: 2,
        borderRadius: 2,
        border: (theme) => `1px solid ${theme.palette.divider}`,
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1,
          py: 0.75,
          bgcolor: (theme) => (theme.palette.mode === 'dark' ? alpha(theme.palette.primary.main, 0.12) : alpha(theme.palette.primary.main, 0.08)),
        }}
      >
        {!isMobile && (
          <IconButton
            size="small"
            {...attributes}
            {...listeners}
            aria-label={`Reorder list ${group.title}`}
            sx={{ cursor: isDragging ? 'grabbing' : 'grab', p: 0.25, color: 'text.secondary' }}
          >
            <DragIndicatorIcon fontSize="small" />
          </IconButton>
        )}
        {isMobile && (
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            <IconButton
              size="small"
              aria-label={`Move list ${group.title} up`}
              disabled={groupIndex === 0}
              onClick={(): void => onMoveGroup(groupIndex, groupIndex - 1)}
              sx={{ p: 0, color: 'text.secondary' }}
            >
              <KeyboardArrowUpIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              aria-label={`Move list ${group.title} down`}
              disabled={groupIndex === groupCount - 1}
              onClick={(): void => onMoveGroup(groupIndex, groupIndex + 1)}
              sx={{ p: 0, color: 'text.secondary' }}
            >
              <KeyboardArrowDownIcon fontSize="small" />
            </IconButton>
          </Box>
        )}
        <Typography variant="subtitle2" fontWeight="bold" sx={{ flexGrow: 1, wordBreak: 'break-word' }}>
          {group.title}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {items.filter((i) => i.checked).length}/{items.length}
        </Typography>
        <IconButton
          size="small"
          aria-label={`Rename list ${group.title}`}
          onClick={(): void => onRenameGroup(group)}
          sx={{ color: 'text.secondary' }}
        >
          <EditOutlinedIcon fontSize="small" />
        </IconButton>
        <IconButton
          size="small"
          aria-label={`Delete list ${group.title}`}
          onClick={(): void => onDeleteGroup(group.id)}
          sx={{ color: 'text.secondary' }}
        >
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>
      </Box>

      <Box px={1} py={0.5}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} modifiers={[restrictToVerticalAxis]}>
          <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
            {items.map((item, index) => (
              <SortableItem
                key={item.id}
                item={item}
                isMobile={isMobile}
                index={index}
                count={items.length}
                onToggle={onToggleItem}
                onEdit={onEditItem}
                onDelete={onDeleteItem}
                onMoveItem={(from, to): void => onReorderItems(group.id, from, to)}
              />
            ))}
          </SortableContext>
        </DndContext>

        {items.length === 0 && !adding && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', py: 0.5 }}>
            No tasks yet.
          </Typography>
        )}

        {adding ? (
          <Box display="flex" alignItems="center" gap={1} py={0.5}>
            <TextField
              fullWidth
              size="small"
              placeholder="New task"
              value={newItemText}
              onChange={(e): void => setNewItemText(e.target.value)}
              onKeyDown={(e): void => {
                if (e.key === 'Enter') void commitNewItem();
                if (e.key === 'Escape') setAdding(false);
              }}
              inputProps={{ 'aria-label': 'New task text' }}
            />
            <Button size="small" variant="contained" onClick={(): void => void commitNewItem()} disabled={!newItemText.trim() || addingItem}>
              Add
            </Button>
            <Button size="small" onClick={(): void => setAdding(false)} disabled={addingItem}>
              Cancel
            </Button>
          </Box>
        ) : (
          <Button size="small" startIcon={<AddIcon />} onClick={(): void => setAdding(true)} sx={{ textTransform: 'none', fontSize: '0.75rem' }}>
            Add task
          </Button>
        )}
      </Box>
    </Box>
  );
});

interface ChecklistViewProps {
  topic: Topic;
}

const ChecklistView = ({ topic }: ChecklistViewProps): JSX.Element => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const {
    tabs,
    activeTabId,
    groups,
    items,
    loading,
    loadError,
    generating,
    editing,
    streamingContent,
    lastEditSummary,
    toolLog,
    lastToolLog,
    loadChecklist,
    createTab,
    renameTab,
    deleteTab,
    switchTab,
    createGroup,
    renameGroup,
    deleteGroup,
    reorderGroup,
    addItem,
    updateItem,
    toggleItem,
    deleteItem,
    reorderItem,
    generateChecklist,
    applyLlmEdit,
    stopEdit,
  } = useChecklistStore();

  const selectedModel = useChatStore((s) => s.selectedModel);
  const canEdit = selectedModel.supportsTools;

  const sensors = useDndSensors();
  const [prompt, setPrompt] = useState('');
  const [creatingList, setCreatingList] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');
  const [editingItem, setEditingItem] = useState<ChecklistItem | null>(null);
  const [itemForm, setItemForm] = useState({ content: '', details: '' });
  const [renamingGroup, setRenamingGroup] = useState<ChecklistGroup | null>(null);
  const [groupForm, setGroupForm] = useState({ title: '' });
  const [deletingGroup, setDeletingGroup] = useState<ChecklistGroup | null>(null);
  const [pendingAction, setPendingAction] = useState<'create' | 'edit' | 'rename' | 'delete' | null>(null);
  const [tabDialog, setTabDialog] = useState<'create' | 'rename' | null>(null);
  const [tabName, setTabName] = useState('');
  const [deletingTab, setDeletingTab] = useState<ChecklistTab | null>(null);
  const [tabActionPending, setTabActionPending] = useState(false);

  useEffect(() => {
    void loadChecklist(topic.id);
  }, [topic.id, loadChecklist]);

  const groupIds = useMemo(() => groups.map((g) => g.id), [groups]);
  const isEmpty = groups.length === 0 && !loading && !generating;

  const handleGenerate = (): void => {
    if (!prompt.trim()) return;
    setPrompt('');
    void generateChecklist(topic.id, prompt);
  };

  const handleGroupDragEnd = (event: DragEndEvent): void => {
    if (editing) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = groupIds.indexOf(String(active.id));
    const toIndex = groupIds.indexOf(String(over.id));
    if (fromIndex === -1 || toIndex === -1) return;
    void reorderGroup(fromIndex, toIndex);
  };

  const commitNewList = async (): Promise<void> => {
    const trimmed = newListTitle.trim();
    if (!trimmed || pendingAction || editing) return;
    setPendingAction('create');
    const created = await createGroup(topic.id, trimmed);
    setPendingAction(null);
    if (created) {
      setNewListTitle('');
      setCreatingList(false);
    }
  };

  const openItemEdit = (item: ChecklistItem): void => {
    setEditingItem(item);
    setItemForm({ content: item.content, details: item.details ?? '' });
  };

  const saveItemEdit = async (): Promise<void> => {
    if (!editingItem) return;
    const content = itemForm.content.trim();
    if (!content || pendingAction || editing) return;
    setPendingAction('edit');
    const updated = await updateItem(editingItem.id, { content, details: itemForm.details.trim() || undefined });
    setPendingAction(null);
    if (updated) setEditingItem(null);
  };

  const openGroupRename = (group: ChecklistGroup): void => {
    setRenamingGroup(group);
    setGroupForm({ title: group.title });
  };

  const saveGroupRename = async (): Promise<void> => {
    if (!renamingGroup) return;
    const title = groupForm.title.trim();
    if (!title || pendingAction || editing) return;
    setPendingAction('rename');
    const renamed = await renameGroup(renamingGroup.id, title);
    setPendingAction(null);
    if (renamed) setRenamingGroup(null);
  };

  const requestDeleteGroup = (groupId: string): void => {
    const group = groups.find((g) => g.id === groupId);
    if (group) setDeletingGroup(group);
  };

  const confirmDeleteGroup = async (): Promise<void> => {
    if (!deletingGroup || pendingAction || editing) return;
    setPendingAction('delete');
    const deleted = await deleteGroup(deletingGroup.id);
    setPendingAction(null);
    if (deleted) setDeletingGroup(null);
  };

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;

  const openRenameTab = (): void => {
    if (!activeTab) return;
    setTabName(activeTab.name);
    setTabDialog('rename');
  };

  const saveTab = async (): Promise<void> => {
    const name = tabName.trim();
    if (!name || tabActionPending) return;
    setTabActionPending(true);
    const succeeded = tabDialog === 'create' ? Boolean(await createTab(topic.id, name)) : activeTab ? await renameTab(activeTab.id, name) : false;
    setTabActionPending(false);
    if (succeeded) {
      setTabDialog(null);
      setTabName('');
    }
  };

  const confirmDeleteTab = async (): Promise<void> => {
    if (!deletingTab || tabActionPending) return;
    setTabActionPending(true);
    const deleted = await deleteTab(deletingTab.id);
    setTabActionPending(false);
    if (deleted) setDeletingTab(null);
  };

  if (loading) {
    return (
      <Box display="flex" alignItems="center" justifyContent="center" height="100%">
        <CircularProgress />
      </Box>
    );
  }

  if (loadError) {
    return (
      <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" gap={2} height="100%" px={2} textAlign="center">
        <Typography variant="h6">Couldn&apos;t load checklist</Typography>
        <Typography variant="body2" color="text.secondary">
          {loadError}
        </Typography>
        <Button variant="contained" onClick={(): void => void loadChecklist(topic.id)}>
          Retry
        </Button>
      </Box>
    );
  }

  return (
    <Box display="flex" flexDirection="column" height="100%" overflow="hidden">
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          borderBottom: 1,
          borderColor: 'divider',
          px: { xs: 0.5, md: 1.5 },
          minHeight: 44,
        }}
      >
        <Tabs
          value={activeTabId ?? false}
          onChange={(_event, tabId: string): void => void switchTab(tabId)}
          variant="scrollable"
          scrollButtons="auto"
          aria-label="Checklist tabs"
          sx={{ flexGrow: 1, minWidth: 0, minHeight: 44, '& .MuiTab-root': { minHeight: 44, textTransform: 'none' } }}
        >
          {tabs.map((tab) => (
            <Tab key={tab.id} value={tab.id} label={tab.name} disabled={editing || generating} />
          ))}
        </Tabs>
        <Tooltip title="Create tab">
          <span>
            <IconButton
              size="small"
              aria-label="Create tab"
              disabled={editing || generating}
              onClick={(): void => {
                setTabName('');
                setTabDialog('create');
              }}
            >
              <AddIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Rename active tab">
          <span>
            <IconButton size="small" aria-label="Rename active tab" disabled={!activeTab || editing || generating} onClick={openRenameTab}>
              <EditOutlinedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={tabs.length <= 1 ? 'At least one tab is required' : 'Delete active tab'}>
          <span>
            <IconButton
              size="small"
              aria-label="Delete active tab"
              disabled={!activeTab || tabs.length <= 1 || editing || generating}
              onClick={(): void => setDeletingTab(activeTab)}
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
      <Box flexGrow={1} minHeight={0} overflow="auto" px={{ xs: 1.5, md: 2 }} py={1.5}>
        <Box aria-busy={editing} sx={{ maxWidth: 720, mx: 'auto', pointerEvents: editing ? 'none' : 'auto', opacity: editing ? 0.65 : 1 }}>
          {generating ? (
            <Box sx={{ mt: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <CircularProgress />
              <Typography variant="body2" color="text.secondary">
                Generating your checklist…
              </Typography>
            </Box>
          ) : isEmpty ? (
            <Box
              sx={{
                mt: 8,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                textAlign: 'center',
              }}
            >
              <FormatListBulletedIcon sx={{ fontSize: 48, color: 'primary.main' }} />
              <Typography variant="h6" fontWeight="bold">
                Create a checklist
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Describe what you need a checklist for, and the AI will generate organized sections and tasks you can both edit.
              </Typography>
              <TextField
                fullWidth
                multiline
                maxRows={4}
                placeholder="e.g. Plan my vacation to Japan"
                value={prompt}
                onChange={(e): void => setPrompt(e.target.value)}
                onKeyDown={(e): void => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleGenerate();
                  }
                }}
                inputProps={{ 'aria-label': 'Checklist prompt' }}
                sx={{ maxWidth: 480 }}
              />
              <Button variant="contained" onClick={handleGenerate} disabled={!prompt.trim()}>
                Generate checklist
              </Button>
            </Box>
          ) : (
            <>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleGroupDragEnd} modifiers={[restrictToVerticalAxis]}>
                <SortableContext items={groupIds} strategy={verticalListSortingStrategy}>
                  {groups.map((group, groupIndex) => (
                    <SortableGroup
                      key={group.id}
                      group={group}
                      items={items.filter((i) => i.groupId === group.id)}
                      isMobile={isMobile}
                      groupIndex={groupIndex}
                      groupCount={groups.length}
                      onToggleItem={(item): void => {
                        void toggleItem(item.id);
                      }}
                      onEditItem={openItemEdit}
                      onDeleteItem={(itemId): void => void deleteItem(itemId)}
                      onAddItem={async (groupId, content): Promise<boolean> => Boolean(await addItem(groupId, content))}
                      onRenameGroup={openGroupRename}
                      onDeleteGroup={requestDeleteGroup}
                      onReorderItems={(groupId, from, to): void => void reorderItem(groupId, from, to)}
                      onMoveGroup={(from, to): void => void reorderGroup(from, to)}
                    />
                  ))}
                </SortableContext>
              </DndContext>

              {creatingList ? (
                <Box display="flex" alignItems="center" gap={1} mb={2}>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="New list title"
                    value={newListTitle}
                    onChange={(e): void => setNewListTitle(e.target.value)}
                    onKeyDown={(e): void => {
                      if (e.key === 'Enter') void commitNewList();
                      if (e.key === 'Escape') setCreatingList(false);
                    }}
                    inputProps={{ 'aria-label': 'New list title' }}
                  />
                  <Button
                    size="small"
                    variant="contained"
                    onClick={(): void => void commitNewList()}
                    disabled={!newListTitle.trim() || pendingAction === 'create' || editing}
                  >
                    Add
                  </Button>
                  <Button size="small" onClick={(): void => setCreatingList(false)} disabled={pendingAction === 'create'}>
                    Cancel
                  </Button>
                </Box>
              ) : (
                <Button
                  variant="outlined"
                  startIcon={<AddIcon />}
                  onClick={(): void => setCreatingList(true)}
                  sx={{ textTransform: 'none', mt: 0.5 }}
                >
                  Create new list
                </Button>
              )}
            </>
          )}
        </Box>
      </Box>

      <ChecklistComposer
        editing={editing}
        streamingContent={streamingContent}
        lastEditSummary={lastEditSummary}
        toolLog={toolLog}
        lastToolLog={lastToolLog}
        canEdit={canEdit}
        onSend={(content): void => {
          void applyLlmEdit(topic.id, content);
        }}
        onStop={stopEdit}
      />

      <Dialog
        open={tabDialog !== null}
        onClose={(): void => {
          if (!tabActionPending) setTabDialog(null);
        }}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>{tabDialog === 'create' ? 'Create tab' : 'Rename tab'}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Tab name"
            margin="dense"
            value={tabName}
            onChange={(event): void => setTabName(event.target.value)}
            onKeyDown={(event): void => {
              if (event.key === 'Enter') void saveTab();
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={(): void => setTabDialog(null)} disabled={tabActionPending}>
            Cancel
          </Button>
          <Button onClick={(): void => void saveTab()} variant="contained" disabled={!tabName.trim() || tabActionPending}>
            {tabDialog === 'create' ? 'Create' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(deletingTab)}
        onClose={(): void => {
          if (!tabActionPending) setDeletingTab(null);
        }}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Delete tab</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Delete &quot;{deletingTab?.name}&quot; and all of its lists, tasks, and AI edit history? This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={(): void => setDeletingTab(null)} disabled={tabActionPending}>
            Cancel
          </Button>
          <Button onClick={(): void => void confirmDeleteTab()} variant="contained" color="error" disabled={tabActionPending}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(editingItem)}
        onClose={(): void => {
          if (pendingAction !== 'edit') setEditingItem(null);
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Edit task</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Task"
            margin="dense"
            value={itemForm.content}
            onChange={(e): void => setItemForm((f) => ({ ...f, content: e.target.value }))}
          />
          <TextField
            fullWidth
            label="Details (optional)"
            margin="dense"
            multiline
            maxRows={6}
            value={itemForm.details}
            onChange={(e): void => setItemForm((f) => ({ ...f, details: e.target.value }))}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={(): void => setEditingItem(null)} disabled={pendingAction === 'edit'}>
            Cancel
          </Button>
          <Button
            onClick={(): void => void saveItemEdit()}
            variant="contained"
            disabled={!itemForm.content.trim() || pendingAction === 'edit' || editing}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(renamingGroup)}
        onClose={(): void => {
          if (pendingAction !== 'rename') setRenamingGroup(null);
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Rename list</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="List title"
            margin="dense"
            value={groupForm.title}
            onChange={(e): void => setGroupForm((f) => ({ ...f, title: e.target.value }))}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={(): void => setRenamingGroup(null)} disabled={pendingAction === 'rename'}>
            Cancel
          </Button>
          <Button
            onClick={(): void => void saveGroupRename()}
            variant="contained"
            disabled={!groupForm.title.trim() || pendingAction === 'rename' || editing}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(deletingGroup)}
        onClose={(): void => {
          if (pendingAction !== 'delete') setDeletingGroup(null);
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Delete list</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete &quot;{deletingGroup?.title}&quot;? This will also remove{' '}
            {items.filter((i) => i.groupId === deletingGroup?.id).length} task(s). This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={(): void => setDeletingGroup(null)} disabled={pendingAction === 'delete' || editing}>
            Cancel
          </Button>
          <Button onClick={(): void => void confirmDeleteGroup()} variant="contained" color="error" disabled={pendingAction === 'delete'}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ChecklistView;
