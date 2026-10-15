import { Box, IconButton, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useUiStore } from '../store/UiStore';
import { useChatStore } from '../store/ChatStore';
import ModelSelector from './ModelSelector';
import { JSX } from 'react';

export const SidebarHeader = (): JSX.Element => {
  const { isMobile, closeDrawer } = useUiStore();
  const { selectedModel, setSelectedModel } = useChatStore();

  return (
    <Box display="flex" flexDirection="column" px={2} pt={2} pb={1} gap={1}>
      <Box display="flex" alignItems="center" justifyContent="space-between">
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            userSelect: 'none',
          }}
        >
          <Box
            component="img"
            src={`${process.env.PUBLIC_URL}/icons/android-chrome-192x192.png`}
            alt="Athena Icon"
            sx={{
              width: 28,
              height: 28,
            }}
          />

          <Typography variant="h6" noWrap sx={{ fontSize: 24, fontWeight: 600 }}>
            Athena
          </Typography>
        </Box>

        {isMobile && (
          <IconButton aria-label="Close sidebar" onClick={closeDrawer}>
            <CloseIcon />
          </IconButton>
        )}
      </Box>

      <ModelSelector selectedModel={selectedModel} onChange={setSelectedModel} />
    </Box>
  );
};
