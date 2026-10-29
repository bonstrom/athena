import { JSX } from 'react';
import { Box, Button, Typography } from '@mui/material';
import type { Topic } from '../database/AthenaDb';
import ModeBadge from './ModeBadge';

interface ModeEmptyStateProps {
  mode?: Topic['mode'];
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}

const ModeEmptyState = ({ mode, title, description, actionLabel, onAction }: ModeEmptyStateProps): JSX.Element => (
  <Box sx={{ p: 3, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
    <ModeBadge mode={mode} />
    <Typography variant="h6">{title}</Typography>
    <Typography
      variant="body2"
      color="text.secondary"
      sx={{ maxWidth: 420 }}>
      {description}
    </Typography>
    <Button
      size="small"
      variant="outlined"
      onClick={onAction}>
      {actionLabel}
    </Button>
  </Box>
);

export default ModeEmptyState;
