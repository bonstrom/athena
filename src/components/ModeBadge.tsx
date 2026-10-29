import { JSX } from 'react';
import { Box, Typography } from '@mui/material';
import type { CSSObject } from '@mui/material/styles';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import ChecklistIcon from '@mui/icons-material/Checklist';
import type { Topic } from '../database/AthenaDb';

const modes = {
  topic: { label: 'Chat', Icon: ChatBubbleOutlineIcon, light: '#1565c0', dark: '#64b5f6' },
  debate: { label: 'Debate', Icon: CompareArrowsIcon, light: '#6a459c', dark: '#b388eb' },
  curator: { label: 'Curator', Icon: MenuBookOutlinedIcon, light: '#00695c', dark: '#4db6ac' },
  checklist: { label: 'Checklist', Icon: ChecklistIcon, light: '#8a5100', dark: '#ffb74d' },
};

/** One icon and accent treatment for navigation, headers, and empty states. */
const ModeBadge = ({ mode = 'topic', compact = false }: { mode?: Topic['mode']; compact?: boolean }): JSX.Element => {
  const { label, Icon, light, dark } = modes[mode];
  return (
    <Box
      component="span"
      role={compact ? 'img' : undefined}
      aria-label={compact ? label : undefined}
      title={label}
      sx={(theme): CSSObject => {
        const color = theme.palette.mode === 'dark' ? dark : light;
        return {
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
          flexShrink: 0,
          color,
        };
      }}>
      <Icon sx={{ fontSize: 16 }} />
      {!compact && (
        <Typography
          variant="caption"
          color="text.primary"
          fontWeight={600}>
          {label}
        </Typography>
      )}
    </Box>
  );
};

export default ModeBadge;
