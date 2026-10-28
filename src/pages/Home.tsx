import { Box, Typography, Alert, Button, alpha, useMediaQuery, useTheme } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/AuthStore';
import { useTopicStore } from '../store/TopicStore';
import { useChatStore } from '../store/ChatStore';
import { useProviderStore } from '../store/ProviderStore';
import Composer from '../components/Composer';
import { Attachment } from '../database/AthenaDb';
import { useState } from 'react';

const Home: React.FC = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const userName = useAuthStore((s) => s.userName);
  const createTopic = useTopicStore((s) => s.createTopic);
  const sending = useChatStore((s) => s.sending);
  const sendMessageStream = useChatStore((s) => s.sendMessageStream);
  const hasApiKey = useProviderStore((s) => s.hasAnyApiKey());
  const [draftStarted, setDraftStarted] = useState(false);

  const handleSend = async (content: string, attachments?: Attachment[]): Promise<void> => {
    const topic = await createTopic();
    if (!topic?.id) return;
    // Navigate immediately so the user lands in the new conversation while the
    // first message streams; the draft is captured in the closure.
    void navigate(`/chat/${topic.id}`);
    void sendMessageStream(content, topic.id, undefined, attachments);
  };

  return (
    <Box
      display="flex"
      flexDirection="column"
      height="100%"
      width="100%"
      overflow="hidden"
      onInputCapture={(): void => setDraftStarted(true)}>
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
          background: (t) =>
            `radial-gradient(ellipse at 35% 35%, ${alpha(t.palette.primary.main, t.palette.mode === 'dark' ? 0.12 : 0.07)}, transparent 65%),
             radial-gradient(ellipse at 75% 65%, ${alpha(t.palette.secondary.main, t.palette.mode === 'dark' ? 0.08 : 0.04)}, transparent 60%)`,
        }}>
        <Box
          sx={{
            position: 'relative',
            mb: 2,
            '&::before': {
              content: '""',
              position: 'absolute',
              inset: -24,
              borderRadius: '50%',
              background: (t) => `radial-gradient(circle, ${alpha(t.palette.primary.main, 0.28)}, transparent 70%)`,
              animation: draftStarted ? 'none' : 'athena-breathe 6s ease-in-out 3',
              opacity: draftStarted ? 0.3 : 0.45,
              transition: 'opacity 400ms ease',
              pointerEvents: 'none',
            },
          }}>
          <Box
            component="img"
            src={`${process.env.PUBLIC_URL || ''}/icons/android-chrome-192x192.png`}
            alt="Athena Logo"
            sx={{
              width: 88,
              height: 88,
              display: 'block',
              position: 'relative',
              filter: (t) => (t.palette.mode === 'dark' ? 'drop-shadow(0 0 12px rgba(255,255,255,0.1))' : 'none'),
            }}
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

      <Composer
        sending={sending}
        onSend={(content, attachments): void => {
          void handleSend(content, attachments);
        }}
        isMobile={isMobile}
      />
    </Box>
  );
};

export default Home;
