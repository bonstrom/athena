import {
  IconButton,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  TextField,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Button,
  Box,
  Typography,
  Checkbox,
  Tooltip,
} from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import { useUiStore } from '../store/UiStore';
import { useAuthStore } from '../store/AuthStore';
import { JSX, memo, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTopicStore } from '../store/TopicStore';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import TopicContextDialog from './TopicContextDialog';
import MenuBookOutlined from '@mui/icons-material/MenuBookOutlined';
import AltRouteIcon from '@mui/icons-material/AltRoute';
import ModeBadge from './ModeBadge';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import { Topic } from '../database/AthenaDb';

export const TopicListItem = memo(function TopicListItem({ topic }: { topic: Topic }): JSX.Element {
  const { topicId } = useParams();
  const navigate = useNavigate();
  const { isMobile, closeDrawer, isSelecting, isSelected, toggleTopicSelection } = useUiStore(useShallow((state) => ({
    isMobile: state.isMobile,
    closeDrawer: state.closeDrawer,
    isSelecting: state.selectedTopicIds.size > 0,
    isSelected: state.selectedTopicIds.has(topic.id),
    toggleTopicSelection: state.toggleTopicSelection,
  })));
  const chatFontSize = useAuthStore((state) => state.chatFontSize);
  const renameTopic = useTopicStore((state) => state.renameTopic);
  const deleteTopic = useTopicStore((state) => state.deleteTopic);
  const [showContextDialog, setShowContextDialog] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(topic.name);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const optionsButtonRef = useRef<HTMLButtonElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const cancelDeleteRef = useRef<HTMLButtonElement>(null);
  const pendingMenuAction = useRef<(() => void) | null>(null);
  const deletingRef = useRef(false);
  const topicName = topic.name || topic.id;
  const topicNameRef = useRef<HTMLSpanElement>(null);
  const [isTopicNameOverflowing, setIsTopicNameOverflowing] = useState(false);

  useEffect(() => {
    if (isEditing) renameInputRef.current?.focus();
  }, [isEditing]);

  useEffect(() => {
    const topicNameElement = topicNameRef.current;
    if (!topicNameElement) return;
    const updateOverflow = (): void => {
      setIsTopicNameOverflowing(topicNameElement.scrollWidth > topicNameElement.clientWidth);
    };
    updateOverflow();
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateOverflow);
    resizeObserver?.observe(topicNameElement);
    window.addEventListener('resize', updateOverflow);
    return (): void => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateOverflow);
    };
  }, [topicName]);

  const save = async (): Promise<void> => {
    await renameTopic(topic.id, editedName);
    setIsEditing(false);
  };

  const handleDelete = async (): Promise<void> => {
    deletingRef.current = true;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setConfirmOpen(false);
    await deleteTopic(topic.id);
    if (topic.id === topicId) void navigate('/');
  };

  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const openMenu = Boolean(menuAnchorEl);

  const handleMenuOpen = (e: React.MouseEvent<HTMLElement>): void => {
    // MUI hides the app root before moving focus into the portal.
    // Release the trigger first so it cannot remain inside an aria-hidden root.
    e.currentTarget.blur();
    setMenuAnchorEl(e.currentTarget);
  };

  const handleMenuClose = (action?: () => void): void => {
    pendingMenuAction.current = action ?? null;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setMenuAnchorEl(null);
  };

  const handleMenuExited = (): void => {
    const action = pendingMenuAction.current;
    pendingMenuAction.current = null;
    // Open the next dialog only after the menu has released its focus trap.
    if (action) action();
    else optionsButtonRef.current?.focus();
  };

  const closeConfirmation = (): void => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setConfirmOpen(false);
  };

  return (
    <>
      <ListItem component="div" disablePadding>
        {isEditing ? (
          <Box
            display="flex"
            alignItems="center"
            width="100%"
            pl={2}
            pr={1}>
            <TextField
              inputRef={renameInputRef}
              value={editedName}
              onChange={(e): void => setEditedName(e.target.value)}
              size="small"
              fullWidth
              inputProps={{ 'aria-label': 'Topic name' }}
            />

            <IconButton
              aria-label="Save topic name"
              onClick={(): void => {
                void save();
              }}>
              <SaveIcon />
            </IconButton>

            <IconButton
              aria-label="Cancel editing"
              onClick={(): void => setIsEditing(false)}>
              <CloseIcon />
            </IconButton>
          </Box>
        ) : (
          <Box
            display="flex"
            alignItems="center"
            width="100%"
            py={0.5}
            sx={{
              '&:hover .morevert-btn': { opacity: 1 },
            }}>
            {isSelecting && (
              <Checkbox
                checked={isSelected}
                onChange={(): void => toggleTopicSelection(topic.id)}
                size="small"
                sx={{ ml: 0.5 }}
                inputProps={{ 'aria-label': `Select topic ${topic.name || topic.id}` }}
              />
            )}
            <ListItemButton
              selected={topic.id === topicId}
              data-active-topic={topic.id === topicId ? 'true' : undefined}
              aria-current={topic.id === topicId ? 'page' : undefined}
              onClick={(): void => {
                if (isSelecting) {
                  toggleTopicSelection(topic.id);
                  return;
                }
                if (isMobile) closeDrawer();
                void navigate(`/chat/${topic.id}`);
              }}
              sx={{
                flexGrow: 1,
                minHeight: 40,
                borderRadius: 2,
                mx: 1,
              }}>
              <ListItemText
                primary={
                  <Box
                    display="flex"
                    alignItems="center"
                    gap={1}>
                    <Tooltip
                      title={isTopicNameOverflowing ? topicName : ''}
                      disableInteractive>
                      <Box
                        ref={topicNameRef}
                        component="span"
                        sx={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                        {topicName}
                      </Box>
                    </Tooltip>
                    {topic.mode && topic.mode !== 'topic' && (
                      <ModeBadge
                        mode={topic.mode}
                        compact
                      />
                    )}
                    {(topic.forks?.length ?? 0) > 1 && (
                      <Box
                        display="flex"
                        alignItems="center"
                        sx={{ opacity: 0.6, ml: 'auto', flexShrink: 0 }}>
                        <AltRouteIcon
                          sx={{
                            fontSize: '0.85rem',
                            mr: 0.3,
                            transform: 'rotate(90deg)',
                          }}
                        />
                        <Typography
                          variant="caption"
                          sx={{
                            fontSize: `${Math.max(11, chatFontSize * 0.7)}px`,
                            fontWeight: 'bold',
                            lineHeight: 1,
                          }}>
                          {(topic.forks?.length ?? 1) - 1}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                }
                slotProps={{
                  primary: {
                    noWrap: false, // Changed to false because we wrap the name in a box with ellipsis
                    fontSize: `${Math.max(12, chatFontSize * 0.8)}px`,
                  },
                }}
              />
            </ListItemButton>

            <IconButton
              ref={optionsButtonRef}
              className="morevert-btn"
              size="small"
              aria-label="Topic options"
              onClick={handleMenuOpen}
              aria-controls={openMenu ? `menu-${topic.id}` : undefined}
              aria-haspopup="true"
              aria-expanded={openMenu ? 'true' : undefined}
              sx={{ opacity: isMobile ? 1 : 0, transition: 'opacity 0.15s ease' }}>
              <MoreVertIcon fontSize="small" />
            </IconButton>

            <Menu
              id={`menu-${topic.id}`}
              anchorEl={menuAnchorEl}
              open={openMenu}
              onClose={(): void => handleMenuClose()}
              disableRestoreFocus
              slotProps={{ transition: { onExited: handleMenuExited } }}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
              <MenuItem
                onClick={(): void => {
                  handleMenuClose(() => setShowContextDialog(true));
                }}>
                <ListItemIcon sx={{ minWidth: 28 }}>
                  <MenuBookOutlined fontSize="small" />
                </ListItemIcon>
                Edit Context
              </MenuItem>

              <MenuItem
                onClick={(): void => {
                  handleMenuClose(() => setIsEditing(true));
                }}>
                <ListItemIcon sx={{ minWidth: 28 }}>
                  <EditIcon fontSize="small" />
                </ListItemIcon>
                Rename
              </MenuItem>

              <MenuItem
                onClick={(): void => {
                  handleMenuClose(() => {
                    deletingRef.current = false;
                    setConfirmOpen(true);
                  });
                }}>
                <ListItemIcon sx={{ minWidth: 28 }}>
                  <DeleteIcon fontSize="small" />
                </ListItemIcon>
                Delete
              </MenuItem>

              <MenuItem
                onClick={(): void => {
                  handleMenuClose(() => {
                    toggleTopicSelection(topic.id);
                    optionsButtonRef.current?.focus();
                  });
                }}>
                <ListItemIcon sx={{ minWidth: 28 }}>
                  <DeleteSweepIcon fontSize="small" />
                </ListItemIcon>
                Multi Delete
              </MenuItem>
            </Menu>
          </Box>
        )}
      </ListItem>

      <Dialog
        open={confirmOpen}
        onClose={closeConfirmation}
        disableRestoreFocus
        slotProps={{
          transition: {
            onEntered: (): void => cancelDeleteRef.current?.focus(),
            onExited: (): void => {
              if (!deletingRef.current) optionsButtonRef.current?.focus();
            },
          },
        }}>
        <DialogTitle>Delete Topic</DialogTitle>

        <DialogContent>
          <DialogContentText>Are you sure you want to delete this topic? This cannot be undone.</DialogContentText>
        </DialogContent>

        <DialogActions>
          <Button ref={cancelDeleteRef} onClick={closeConfirmation}>Cancel</Button>

          <Button
            onClick={(): void => {
              void handleDelete();
            }}
            color="error">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {showContextDialog && (
        <TopicContextDialog
          open
          topicId={topic.id}
          onClose={(): void => setShowContextDialog(false)}
        />
      )}
    </>
  );
});
