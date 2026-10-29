import { Box, Typography, Alert, Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/AuthStore';
import { useProviderStore } from '../store/ProviderStore';

/** Shared welcome content for the home page and empty conversations. */
const ChatWelcome: React.FC = () => {
  const navigate = useNavigate();
  const userName = useAuthStore((s) => s.userName);
  const hasApiKey = useProviderStore((s) => s.hasAnyApiKey());

  return (
    <Box
      sx={{
        flexGrow: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        p: 3,
        textAlign: 'center',
        overflow: 'hidden',
      }}>
      <Box sx={{ mb: 2 }}>
        <Box
          component="img"
          src={`${process.env.PUBLIC_URL || ''}/icons/android-chrome-192x192.png`}
          alt="Athena Logo"
          sx={{ width: 88, height: 88, display: 'block' }}
        />
      </Box>
      <Typography
        variant="h5"
        fontWeight="bold"
        gutterBottom>
        {userName ? `Hi, ${userName}` : 'Welcome to Athena'}
      </Typography>
      <Typography
        variant="body1"
        color="text.secondary"
        gutterBottom>
        What would you like to talk about?
      </Typography>
      {!hasApiKey && (
        <Alert
          severity="info"
          icon={false}
          sx={{ mt: 2, maxWidth: 480, textAlign: 'left' }}
          action={
            <Button
              color="inherit"
              size="small"
              onClick={(): void => void navigate('/settings')}>
              Open Settings
            </Button>
          }>
          Add a provider and API key to start chatting. You can return to this draft afterwards.
        </Alert>
      )}
    </Box>
  );
};

export default ChatWelcome;
