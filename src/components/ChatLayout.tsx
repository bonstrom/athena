import React, { useEffect, useState } from "react";
import { Box, CssBaseline, Drawer, IconButton, useMediaQuery, useTheme } from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import { Outlet } from "react-router-dom";
import { useTopicStore } from "../store/TopicStore";
import { useUiStore } from "../store/UiStore";
import { useNotificationStore } from "../store/NotificationStore";
import { Sidebar } from "./Sidebar";
import { athenaDb } from "../database/AthenaDb";

const drawerWidth = 300;

const ChatLayout: React.FC = () => {
  const { setTopics } = useTopicStore();
  const { addNotification } = useNotificationStore();
  const [, setLoading] = useState(true);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const { drawerOpen, openDrawer, closeDrawer, setMobile } = useUiStore();

  useEffect(() => {
    setMobile(isMobile);
  }, [isMobile, setMobile]);

  useEffect(() => {
    const fetchTopics = async (): Promise<void> => {
      setLoading(true);
      try {
        const localTopics = await athenaDb.topics.orderBy("updatedOn").reverse().toArray();
        setTopics(localTopics);
      } catch (err) {
        console.error("Failed to load local topics", err);
        const message = err instanceof Error ? err.message : String(err);
        addNotification("Failed to load local topics", message);
      } finally {
        setLoading(false);
      }
    };

    void fetchTopics();
  }, [addNotification, setTopics]);

  return (
    <Box sx={{ display: "flex", height: "100vh" }}>
      <CssBaseline />

      {/* Drawer */}

      <Drawer
        variant={isMobile ? "temporary" : "persistent"}
        open={drawerOpen}
        onClose={closeDrawer}
        ModalProps={{ keepMounted: true }}
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
          ml: isMobile ? 0 : `${drawerWidth}px`,
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
            <IconButton
              onClick={(): void => openDrawer()}
              sx={{
                position: "fixed",
                top: 16,
                left: 16,
                zIndex: (theme) => theme.zIndex.drawer + 1,
                backgroundColor: "background.paper",
                boxShadow: 3,
              }}>
              <MenuIcon />
            </IconButton>
          )}

          <Outlet />
        </Box>
      </Box>
    </Box>
  );
};

export default ChatLayout;
