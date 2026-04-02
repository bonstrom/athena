import React from 'react';
import { Box, Chip, Typography } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';

interface Props {
  suggestions: string[];
  onSelect: (suggestion: string) => void;
}

const SuggestedReplies: React.FC<Props> = ({ suggestions, onSelect }) => {
  if (suggestions.length === 0) return null;

  return (
    <Box
      sx={{
        px: 2,
        pb: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.75,
        alignItems: 'flex-end',
        animation: 'fadeInUp 0.3s ease-out',
        '@keyframes fadeInUp': {
          from: { opacity: 0, transform: 'translateY(8px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, opacity: 0.5 }}>
        <AutoAwesomeIcon sx={{ fontSize: 12 }} />
        <Typography variant="caption" sx={{ fontSize: '0.65rem' }}>
          Suggested replies
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, alignItems: 'flex-end' }}>
        {suggestions.map((s, i) => (
          <Chip
            key={i}
            label={s}
            size="small"
            variant="outlined"
            onClick={(): void => onSelect(s)}
            sx={{
              cursor: 'pointer',
              height: 'auto',
              maxWidth: '100%',
              '& .MuiChip-label': {
                whiteSpace: 'normal',
                py: 0.5,
                px: 1.25,
                fontSize: '0.8rem',
                lineHeight: 1.4,
              },
              borderColor: 'primary.main',
              color: 'primary.main',
              '&:hover': {
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
              },
            }}
          />
        ))}
      </Box>
    </Box>
  );
};

export default SuggestedReplies;
