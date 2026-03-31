import React, { useEffect } from 'react';
import { Box, CssBaseline, Drawer, useMediaQuery, useTheme, IconButton, Typography } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import { Outlet } from 'react-router-dom';
import { useUiStore } from '../store/UiStore';
import { useChatStore } from '../store/ChatStore';
import { useTopicStore } from '../store/TopicStore';
import { Sidebar } from './Sidebar';

const drawerWidth = 300;

const ChatLayout: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const { drawerOpen, openDrawer, closeDrawer, setMobile } = useUiStore();
  const { currentTopicId, selectedModel } = useChatStore();
  const topic = useTopicStore((state) => state.topics.find((t) => t.id === currentTopicId));

  useEffect(() => {
    setMobile(isMobile);
  }, [isMobile, setMobile]);

  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      <CssBaseline />

      {/* Drawer */}

      <Drawer
        variant={isMobile ? 'temporary' : 'persistent'}
        open={drawerOpen}
        onClose={closeDrawer}
        sx={{
          [`& .MuiDrawer-paper`]: {
            width: drawerWidth,
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
          },
        }}
      >
        <Sidebar />
      </Drawer>

      {/* Main content */}

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          bgcolor: 'background.default',
          ml: isMobile ? 0 : drawerOpen ? `${drawerWidth}px` : 0,
          transition: theme.transitions.create('margin', {
            easing: drawerOpen ? theme.transitions.easing.easeOut : theme.transitions.easing.sharp,
            duration: drawerOpen ? theme.transitions.duration.enteringScreen : theme.transitions.duration.leavingScreen,
          }),
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          maxWidth: { xs: '100%', sm: '100%', md: '100%' },
          overflowX: 'hidden',
        }}
      >
        <Box
          sx={{
            flexGrow: 1,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {isMobile && !drawerOpen && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                px: 0.5,
                py: 0.25,
                borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
                flexShrink: 0,
              }}
            >
              <IconButton onClick={(): void => openDrawer()} aria-label="Open menu">
                <MenuIcon />
              </IconButton>
              {topic && (
                <Box sx={{ ml: 0.5, overflow: 'hidden', display: 'flex', alignItems: 'baseline', gap: 1.5, minWidth: 0 }}>
                  <Typography variant="subtitle2" fontWeight="bold" noWrap>
                    {topic.name || 'New Topic'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ flexShrink: 0 }}>
                    {selectedModel.label}
                  </Typography>
                </Box>
              )}
            </Box>
          )}

          {!isMobile && topic && (
            <Box
              sx={{
                px: 2,
                py: 1,
                borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'baseline',
                gap: 1.5,
              }}
            >
              <Typography variant="subtitle1" fontWeight="bold" noWrap>
                {topic.name || 'New Topic'}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ flexShrink: 0 }}>
                {selectedModel.label}
              </Typography>
            </Box>
          )}

          <Outlet />
        </Box>
      </Box>
    </Box>
  );
};

export default ChatLayout;
