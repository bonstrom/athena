import { Box, Button, Divider, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useUiStore } from '../store/UiStore';
import { useTopicStore } from '../store/TopicStore';
import { useLogout } from '../store/AuthStore';
import { TopicList } from './TopicList';
import { BuildVersion } from './BuildVersion';
import { SidebarHeader } from './SiderbarHeader';
import { GlobalSearch } from './GlobalSearch';
import { JSX, useState } from 'react';
import AddIcon from '@mui/icons-material/Add';
import SettingsIcon from '@mui/icons-material/Settings';
import LogoutIcon from '@mui/icons-material/Logout';

export const Sidebar = (): JSX.Element => {
  const navigate = useNavigate();
  const logout = useLogout();
  const { isMobile, closeDrawer } = useUiStore();
  const { createTopic } = useTopicStore();
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false);

  const handleCreate = async (): Promise<void> => {
    const topic = await createTopic();
    if (topic) {
      void navigate(`/chat/${topic.id}`);
      if (isMobile) closeDrawer();
    }
  };

  return (
    <Box display="flex" flexDirection="column" height="100%">
      <SidebarHeader />

      <GlobalSearch />

      <Box px={2} pt={0}>
        <Button
          variant="contained"
          fullWidth
          startIcon={<AddIcon />}
          onClick={(): void => {
            void handleCreate();
          }}
        >
          New Topic
        </Button>
      </Box>

      <Box id="sidebar-scroll-container" flexGrow={1} overflow="auto" px={1} mt={1}>
        <TopicList />
      </Box>

      <Divider sx={{ my: 1 }} />

      <Box px={2} pb={2}>
        <Button
          variant="outlined"
          fullWidth
          startIcon={<SettingsIcon />}
          onClick={(): void => {
            if (isMobile) closeDrawer();
            void navigate(`/settings`);
          }}
          sx={{ mb: 1 }}
        >
          Settings
        </Button>

        <Button
          variant="text"
          color="error"
          fullWidth
          startIcon={<LogoutIcon />}
          onClick={(): void => {
            setConfirmLogoutOpen(true);
          }}
          sx={{ mb: 1 }}
        >
          Logout
        </Button>

        <Box sx={{ textAlign: 'center', opacity: 0.5 }}>
          <BuildVersion />
        </Box>
      </Box>

      <Dialog open={confirmLogoutOpen} onClose={(): void => setConfirmLogoutOpen(false)}>
        <DialogTitle>Confirm Logout</DialogTitle>
        <DialogContent>
          <DialogContentText>Are you sure you want to log out? You will need to enter your API key again to return.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={(): void => setConfirmLogoutOpen(false)}>Cancel</Button>
          <Button
            onClick={(): void => {
              setConfirmLogoutOpen(false);
              logout();
            }}
            color="error"
          >
            Logout
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
