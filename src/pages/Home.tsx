import { Box, useMediaQuery, useTheme } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useTopicStore } from '../store/TopicStore';
import { useChatStore } from '../store/ChatStore';
import ChatWelcome from '../components/ChatWelcome';
import Composer from '../components/Composer';
import { Attachment } from '../database/AthenaDb';

const Home: React.FC = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const createTopic = useTopicStore((s) => s.createTopic);
  const sending = useChatStore((s) => s.sending);
  const sendMessageStream = useChatStore((s) => s.sendMessageStream);

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
      overflow="hidden">
      <ChatWelcome />

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
