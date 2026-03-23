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
  Tooltip,
} from "@mui/material";
import { useNavigate, useParams } from "react-router-dom";
import { useUiStore } from "../store/UiStore";
import { JSX, useState, useEffect } from "react";
import { useTopicStore } from "../store/TopicStore";
import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import DeleteIcon from "@mui/icons-material/Delete";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import TopicContextDialog from "./TopicContextDialog";
import MenuBookOutlined from "@mui/icons-material/MenuBookOutlined";
import { Topic } from "../database/AthenaDb";

export const TopicListItem = ({ topic }: { topic: Topic }): JSX.Element => {
  const { topicId } = useParams();
  const navigate = useNavigate();
  const { isMobile, closeDrawer } = useUiStore();
  const { renameTopic, deleteTopic } = useTopicStore();
  const [showContextDialog, setShowContextDialog] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(topic.name);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [tokenCount, setTokenCount] = useState<number | null>(null);
  const [totalCost, setTotalCost] = useState<number | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [isHovering, setIsHovering] = useState(false);

  useEffect(() => {
    setTokenCount(null);
    setTotalCost(null);
  }, [topic.activeForkId, topic.updatedOn]);

  useEffect(() => {
    if (isHovering && (tokenCount === null || totalCost === null) && !isLoadingStats) {
      const fetchStats = async (): Promise<void> => {
        setIsLoadingStats(true);
        try {
          const [count, cost] = await Promise.all([
            useTopicStore.getState().getTopicTokenCount(topic.id),
            useTopicStore.getState().getTopicTotalCost(topic.id),
          ]);
          setTokenCount(count);
          setTotalCost(cost);
        } catch (err) {
          console.error("Failed to fetch topic stats", err);
        } finally {
          setIsLoadingStats(false);
        }
      };
      void fetchStats();
    }
  }, [isHovering, tokenCount, totalCost, isLoadingStats, topic.id]);

  const save = async (): Promise<void> => {
    await renameTopic(topic.id, editedName);
    setIsEditing(false);
  };

  const handleDelete = async (): Promise<void> => {
    setConfirmOpen(false);
    await deleteTopic(topic.id);
    if (topic.id === topicId) void navigate("/");
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
            />

            <IconButton
              onClick={(): void => {
                void save();
              }}>
              <SaveIcon />
            </IconButton>

            <IconButton onClick={(): void => setIsEditing(false)}>
              <CloseIcon />
            </IconButton>
          </Box>
        ) : (
          <Box
            display="flex"
            alignItems="center"
            width="100%"
            py={0.5}>
            <Tooltip
              title={
                isLoadingStats || tokenCount === null || totalCost === null ? (
                  "Calculating stats..."
                ) : (
                  <Box>
                    <Box>Context: ~{tokenCount} tokens active</Box>
                    <Box>Total Cost: {totalCost.toFixed(3)} SEK</Box>
                  </Box>
                )
              }
              placement="right"
              enterDelay={500}>
              <ListItemButton
                selected={topic.id === topicId}
                onMouseEnter={(): void => {
                  setIsHovering(true);
                }}
                onMouseLeave={(): void => {
                  setIsHovering(false);
                }}
                onClick={(): void => {
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
                  primary={topic.name || topic.id}
                  slotProps={{
                    primary: {
                      noWrap: true,
                      fontSize: "0.8rem",
                    },
                  }}
                />
              </ListItemButton>
            </Tooltip>

            <IconButton
              size="small"
              onClick={handleMenuOpen}
              aria-controls={openMenu ? `menu-${topic.id}` : undefined}
              aria-haspopup="true"
              aria-expanded={openMenu ? "true" : undefined}>
              <MoreVertIcon fontSize="small" />
            </IconButton>

            <Menu
              anchorEl={menuAnchorEl}
              open={openMenu}
              onClose={handleMenuClose}
              anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
              transformOrigin={{ vertical: "top", horizontal: "right" }}>
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
