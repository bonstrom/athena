import { Box, IconButton, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useUiStore } from "../store/UiStore";
import { useChatStore } from "../store/ChatStore";
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
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            userSelect: "none",
          }}>
          <Box
            component="img"
            src={`${process.env.PUBLIC_URL}/icons/android-chrome-192x192.png`}
            alt="Athena Icon"
            sx={{
              width: 32,
              height: 32,
              transition: "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.4s ease",
              "&:hover": {
                transform: "scale(1.15) rotate(-8deg)",
                filter: "drop-shadow(0 0 8px rgba(187, 134, 252, 0.5))",
              },
            }}
          />

          <Typography
            variant="h6"
            noWrap
            sx={{ fontSize: 32, fontWeight: "bold", fontFamily: "'Cinzel', serif" }}>
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
