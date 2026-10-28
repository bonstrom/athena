import { Box, Typography } from '@mui/material';
import TypingIndicator from './TypingIndicator';

export type AssistantActivity = 'thinking' | 'writing' | 'searching' | 'reading' | 'working';

const LABELS: Record<AssistantActivity, string> = {
  thinking: 'Thinking',
  writing: 'Writing',
  searching: 'Searching the web',
  reading: 'Reading',
  working: 'Using tools',
};

const ActivityIndicator: React.FC<{ activity: AssistantActivity }> = ({ activity }) => (
  <Box
    role="status"
    aria-live="polite"
    sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.5, color: 'text.secondary' }}>
    <Box
      aria-hidden="true"
      sx={{ color: 'primary.main', '& > div': { gap: 0.5 }, '& > div > div': { width: 5, height: 5 } }}>
      <TypingIndicator />
    </Box>
    <Typography variant="caption">{LABELS[activity]}</Typography>
  </Box>
);

export default ActivityIndicator;
