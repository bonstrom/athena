import { Box, IconButton, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useUiStore } from "../store/UiStore";
import { useChatStore } from "../store/ChatStore";
import { Link as RouterLink } from "react-router-dom";
import ModelSelector from "./ModelSelector";
import { JSX } from "react";

export const SidebarHeader = (): JSX.Element => {
  const { isMobile, closeDrawer } = useUiStore();
  const { selectedModel, setSelectedModel } = useChatStore();

  return (
    <Box
      display="flex"
      flexDirection="column"
      px={2}
      pt={2}
      pb={1}
      gap={1}>
      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between">
        <Box
          component={RouterLink}
          to="/home"
          sx={{
            textDecoration: "none",
            color: "inherit",
            display: "flex",
            alignItems: "center",
            gap: 1,
          }}>
          <Box
            component="img"
            src={`${process.env.PUBLIC_URL}/icons/favicon-32x32.png`}
            alt="Athena Icon"
            sx={{ width: 24, height: 24 }}
          />

          <Typography
            variant="h6"
            noWrap>
            Athena
          </Typography>
        </Box>

        {isMobile && (
          <IconButton onClick={closeDrawer}>
            <CloseIcon />
          </IconButton>
        )}
      </Box>

      <ModelSelector
        selectedModel={selectedModel}
        onChange={setSelectedModel}
      />
    </Box>
  );
};
