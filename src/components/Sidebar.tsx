import { Box, Button, Divider } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useUiStore } from "../store/UiStore";
import { useTopicStore } from "../store/TopicStore";
import { useLogout } from "../store/AuthStore";
import { TopicList } from "./TopicList";
import { BuildVersion } from "./BuildVersion";
import { SidebarHeader } from "./SiderbarHeader";
import { JSX } from "react";

export const Sidebar = (): JSX.Element => {
  const navigate = useNavigate();
  const logout = useLogout();
  const { isMobile, closeDrawer } = useUiStore();
  const { createTopic } = useTopicStore();

  const handleCreate = async (): Promise<void> => {
    const topic = await createTopic();
    if (topic) {
      void navigate(`/chat/${topic.id}`);
      if (isMobile) closeDrawer();
    }
  };

  return (
    <Box
      display="flex"
      flexDirection="column"
      height="100%">
      <SidebarHeader />

      <Box
        px={2}
        pt={1}>
        <Button
          variant="contained"
          fullWidth
          onClick={(): void => {
            void handleCreate();
          }}>
          New Topic
        </Button>
      </Box>

      <Box
        flexGrow={1}
        overflow="auto"
        px={1}
        mt={1}>
        <TopicList />
      </Box>

      <Divider sx={{ my: 1 }} />

      <Box
        px={2}
        pb={2}>
        <Button
          variant="outlined"
          fullWidth
          onClick={(): void => {
            if (isMobile) closeDrawer();
            void navigate(`/settings`);
          }}
          sx={{ mb: 1 }}>
          Settings
        </Button>

        <Button
          variant="outlined"
          fullWidth
          onClick={(): void => {
            logout();
          }}
          sx={{ mb: 1 }}>
          Logout
        </Button>

        <Box sx={{ textAlign: "center", opacity: 0.5 }}>
          <BuildVersion />
        </Box>
      </Box>
    </Box>
  );
};
