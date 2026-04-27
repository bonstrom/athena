import {
  IconButton,
  ListItem,
  ListItemButton,
  ListItemText,
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
} from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import { useUiStore } from '../store/UiStore';
import { useAuthStore } from '../store/AuthStore';
import { JSX, useState } from 'react';
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
import { Topic } from '../database/AthenaDb';

export const TopicListItem = ({ topic }: { topic: Topic }): JSX.Element => {
  const { topicId } = useParams();
  const navigate = useNavigate();
  const { isMobile, closeDrawer, selectedTopicIds, toggleTopicSelection } = useUiStore();
  const { chatFontSize } = useAuthStore();
  const { renameTopic, deleteTopic } = useTopicStore();
  const isSelecting = selectedTopicIds.size > 0;
  const [showContextDialog, setShowContextDialog] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(topic.name);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const save = async (): Promise<void> => {
    await renameTopic(topic.id, editedName);
    setIsEditing(false);
  };

  const handleDelete = async (): Promise<void> => {
    setConfirmOpen(false);
    await deleteTopic(topic.id);
    if (topic.id === topicId) void navigate('/');
  };

  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const openMenu = Boolean(menuAnchorEl);

  const handleMenuOpen = (e: React.MouseEvent<HTMLElement>): void => {
    setMenuAnchorEl(e.currentTarget);
  };

  const handleMenuClose = (): void => {
    setMenuAnchorEl(null);
  };

  return (
    <>
      <ListItem disablePadding>
        {isEditing ? (
          <Box
            display="flex"
            alignItems="center"
            width="100%"
            pl={2}
            pr={1}>
            <TextField
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
                checked={selectedTopicIds.has(topic.id)}
                onChange={(): void => toggleTopicSelection(topic.id)}
                size="small"
                sx={{ ml: 0.5 }}
                inputProps={{ 'aria-label': `Select topic ${topic.name || topic.id}` }}
              />
            )}
            <ListItemButton
              selected={topic.id === topicId}
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
                '&.Mui-selected': {
                  boxShadow: (theme) => `inset 3px 0 0 ${theme.palette.primary.main}`,
                },
              }}>
              <ListItemText
                primary={
                  <Box
                    display="flex"
                    alignItems="center"
                    gap={1}>
                    <Box
                      component="span"
                      sx={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                      {topic.name || topic.id}
                    </Box>
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
              anchorEl={menuAnchorEl}
              open={openMenu}
              onClose={handleMenuClose}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
              <MenuItem
                onClick={(): void => {
                  toggleTopicSelection(topic.id);
                  handleMenuClose();
                }}>
                <Checkbox
                  checked={selectedTopicIds.has(topic.id)}
                  size="small"
                  sx={{ p: 0, mr: 1 }}
                />
                Select
              </MenuItem>

              <MenuItem
                onClick={(): void => {
                  setShowContextDialog(true);
                  handleMenuClose();
                }}>
                <MenuBookOutlined
                  fontSize="small"
                  sx={{ mr: 1 }}
                />
                Edit Context
              </MenuItem>

              <MenuItem
                onClick={(): void => {
                  setIsEditing(true);
                  handleMenuClose();
                }}>
                <EditIcon
                  fontSize="small"
                  sx={{ mr: 1 }}
                />
                Rename
              </MenuItem>

              <MenuItem
                onClick={(): void => {
                  setConfirmOpen(true);
                  handleMenuClose();
                }}>
                <DeleteIcon
                  fontSize="small"
                  sx={{ mr: 1 }}
                />
                Delete
              </MenuItem>
            </Menu>
          </Box>
        )}
      </ListItem>

      <Dialog
        open={confirmOpen}
        onClose={(): void => setConfirmOpen(false)}>
        <DialogTitle>Delete Topic</DialogTitle>

        <DialogContent>
          <DialogContentText>Are you sure you want to delete this topic? This cannot be undone.</DialogContentText>
        </DialogContent>

        <DialogActions>
          <Button onClick={(): void => setConfirmOpen(false)}>Cancel</Button>

          <Button
            onClick={(): void => {
              void handleDelete();
            }}
            color="error">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <TopicContextDialog
        open={showContextDialog}
        topicId={topic.id}
        onClose={(): void => setShowContextDialog(false)}
      />
    </>
  );
};
