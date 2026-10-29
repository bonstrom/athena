import React, { useEffect } from 'react';
import {
  Box,
  CssBaseline,
  Drawer,
  useMediaQuery,
  useTheme,
  IconButton,
  Tooltip,
  Typography,
  alpha,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import WhatshotIcon from '@mui/icons-material/Whatshot';
import { Outlet, useParams } from 'react-router-dom';
import { useUiStore } from '../store/UiStore';
import { useChatStore } from '../store/ChatStore';
import { useTopicStore } from '../store/TopicStore';
import { Sidebar } from './Sidebar';
import { isDeepSeekPeakHours } from './ModelSelector';
import ModeBadge from './ModeBadge';

const drawerWidth = 300;

const ChatLayout: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const { drawerOpen, openDrawer, closeDrawer, setMobile } = useUiStore();
  const { topicId } = useParams();
  const selectedModel = useChatStore((state) => state.selectedModel);
  const topicStore = useTopicStore();
  const topic = topicStore.topics.find((t) => t.id === topicId);

  useEffect(() => {
    setMobile(isMobile);
  }, [isMobile, setMobile]);

  return (
    <Box sx={{ display: 'flex', height: '100dvh', overflow: 'hidden' }}>
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
            borderTopLeftRadius: 0,
            borderBottomLeftRadius: 0,
          },
        }}>
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
          maxWidth: { xs: '100%', sm: '100%', md: '100%' },
          overflow: 'hidden',
        }}>
        <Box
          sx={{
            flexGrow: 1,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}>
          {(topic || !drawerOpen) && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                px: 1,
                py: 0.5,
                bgcolor: (theme) => alpha(theme.palette.background.default, 0.85),
                backdropFilter: 'blur(12px)',
                borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
                flexShrink: 0,
                position: 'relative',
                zIndex: 10,
              }}>
              {!drawerOpen && (
                <IconButton
                  onClick={(): void => openDrawer()}
                  aria-label="Open menu"
                  sx={{ mr: 0.5 }}>
                  <MenuIcon />
                </IconButton>
              )}
              {topic && <ModeBadge mode={topic.mode} />}
              {topic && (
                <Box
                  sx={{
                    ml: 0.5,
                    flex: 1,
                    overflow: 'hidden',
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 1,
                    minWidth: 0,
                  }}>
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 0.7fr)',
                      alignItems: 'center',
                      gap: 1.5,
                      width: '100%',
                      minWidth: 0,
                    }}>
                    <Typography
                      variant="subtitle2"
                      fontWeight={600}
                      noWrap
                      title={topic.name || 'New Topic'}
                      sx={{ lineHeight: 1.2, minWidth: 0 }}>
                      {topic.name || 'New Topic'}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      noWrap
                      title={selectedModel.label}
                      sx={{ minWidth: 0, lineHeight: 1.4 }}>
                      {isDeepSeekPeakHours() && selectedModel.providerId === 'builtin-deepseek' && (
                        <Tooltip title="DeepSeek peak hours — 2x pricing">
                          <Box
                            component="span"
                            display="inline-flex"
                            alignItems="center"
                            gap={0.2}>
                            <WhatshotIcon sx={{ fontSize: 12, color: 'warning.main', display: 'flex' }} />
                            <Typography
                              variant="caption"
                              color="warning.main"
                              sx={{ fontWeight: 'bold', fontSize: '0.65rem', lineHeight: 1 }}>
                              2×
                            </Typography>
                          </Box>
                        </Tooltip>
                      )}
                      {selectedModel.label}
                    </Typography>
                  </Box>
                </Box>
              )}
            </Box>
          )}

          <Outlet />
        </Box>
      </Box>
    </Box>
  );
};

export default ChatLayout;
