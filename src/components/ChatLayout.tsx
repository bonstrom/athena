import React, { useEffect } from "react";
import { Box, CssBaseline, Drawer, useMediaQuery, useTheme, IconButton, Typography, Chip, alpha } from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import { Outlet } from "react-router-dom";
import { useUiStore } from "../store/UiStore";
import { useChatStore } from "../store/ChatStore";
import { useTopicStore } from "../store/TopicStore";
import { useAuthStore } from "../store/AuthStore";
import { Sidebar } from "./Sidebar";

const drawerWidth = 300;

const ChatLayout: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const { drawerOpen, openDrawer, closeDrawer, setMobile } = useUiStore();
  const { currentTopicId, selectedModel } = useChatStore();
  const { predefinedPrompts } = useAuthStore();
  const topicStore = useTopicStore();
  const topic = topicStore.topics.find((t) => t.id === currentTopicId);

  useEffect(() => {
    setMobile(isMobile);
  }, [isMobile, setMobile]);

  return (
    <Box sx={{ display: "flex", height: "100vh" }}>
      <CssBaseline />

      {/* Drawer */}

      <Drawer
        variant={isMobile ? "temporary" : "persistent"}
        open={drawerOpen}
        onClose={closeDrawer}
        sx={{
          [`& .MuiDrawer-paper`]: {
            width: drawerWidth,
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
          },
        }}>
        <Sidebar />
      </Drawer>

      {/* Main content */}

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          bgcolor: "background.default",
          ml: isMobile ? 0 : drawerOpen ? `${drawerWidth}px` : 0,
          transition: theme.transitions.create("margin", {
            easing: drawerOpen ? theme.transitions.easing.easeOut : theme.transitions.easing.sharp,
            duration: drawerOpen ? theme.transitions.duration.enteringScreen : theme.transitions.duration.leavingScreen,
          }),
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          maxWidth: { xs: "100%", sm: "100%", md: "100%" },
          overflowX: "hidden",
        }}>
        <Box
          sx={{
            flexGrow: 1,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}>
          {isMobile && !drawerOpen && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                px: 1,
                py: 0.5,
                bgcolor: (theme) => alpha(theme.palette.background.default, 0.85),
                backdropFilter: "blur(12px)",
                borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
                boxShadow: (theme) =>
                  theme.palette.mode === "dark" ? "0 2px 8px rgba(0,0,0,0.3)" : "0 2px 8px rgba(0,0,0,0.05)",
                flexShrink: 0,
                position: "relative",
                zIndex: 10,
              }}>
              <IconButton
                onClick={(): void => openDrawer()}
                aria-label="Open menu"
                sx={{ mr: 0.5 }}>
                <MenuIcon />
              </IconButton>
              {topic && (
                <Box
                  sx={{
                    ml: 0.5,
                    overflow: "hidden",
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: 1,
                    minWidth: 0,
                  }}>
                  <Box sx={{ display: "flex", alignItems: "baseline", gap: 1.5, flexShrink: 0 }}>
                    <Typography
                      variant="subtitle2"
                      fontWeight="bold"
                      noWrap>
                      {topic.name || "New Topic"}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      noWrap
                      sx={{ flexShrink: 0 }}>
                      {selectedModel.label}
                    </Typography>
                  </Box>
                  {topic.selectedPromptIds && topic.selectedPromptIds.length > 0 && (
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                      {predefinedPrompts
                        .filter((p) => topic.selectedPromptIds?.includes(p.id))
                        .map((prompt) => (
                          <Chip
                            key={prompt.id}
                            label={prompt.name}
                            size="small"
                            onDelete={(): void => {
                              const newIds = topic.selectedPromptIds?.filter((id) => id !== prompt.id) ?? [];
                              void topicStore.updateTopicPromptSelection(topic.id, newIds);
                            }}
                            sx={{
                              height: 18,
                              fontSize: "0.6rem",
                              bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
                              "& .MuiChip-deleteIcon": { fontSize: 12 },
                            }}
                          />
                        ))}
                    </Box>
                  )}
                </Box>
              )}
            </Box>
          )}

          {!isMobile && topic && (
            <Box
              sx={{
                px: 2,
                py: 1,
                bgcolor: (theme) => alpha(theme.palette.background.default, 0.85),
                backdropFilter: "blur(12px)",
                borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
                boxShadow: (theme) =>
                  theme.palette.mode === "dark" ? "0 2px 8px rgba(0,0,0,0.3)" : "0 2px 8px rgba(0,0,0,0.05)",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 1.5,
                position: "relative",
                zIndex: 10,
              }}>
              <Box sx={{ display: "flex", alignItems: "baseline", gap: 1.5, flexShrink: 0 }}>
                <Typography
                  variant="subtitle1"
                  fontWeight="bold"
                  noWrap>
                  {topic.name || "New Topic"}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  noWrap
                  sx={{ flexShrink: 0 }}>
                  {selectedModel.label}
                </Typography>
              </Box>
              {topic.selectedPromptIds && topic.selectedPromptIds.length > 0 && (
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                  {predefinedPrompts
                    .filter((p) => topic.selectedPromptIds?.includes(p.id))
                    .map((prompt) => (
                      <Chip
                        key={prompt.id}
                        label={prompt.name}
                        size="small"
                        onDelete={(): void => {
                          const newIds = topic.selectedPromptIds?.filter((id) => id !== prompt.id) ?? [];
                          void topicStore.updateTopicPromptSelection(topic.id, newIds);
                        }}
                        sx={{
                          height: 20,
                          fontSize: "0.65rem",
                          bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
                          "& .MuiChip-deleteIcon": { fontSize: 14 },
                        }}
                      />
                    ))}
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
