import React, { useState } from 'react';
import { Box, Button, Typography, Stack, CircularProgress, List, ListItem, ListItemText, Chip, Divider } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import StorageIcon from '@mui/icons-material/Storage';
import ConfirmDialog from './ConfirmDialog';
import { analyzeDatabaseHealth, cleanDatabase } from '../services/databaseHealthService';
import type { DatabaseHealthReport, DatabaseCleanupResult } from '../services/databaseHealthService';
import { useNotificationStore } from '../store/NotificationStore';

const DatabaseHealth: React.FC = () => {
  const [report, setReport] = useState<DatabaseHealthReport | null>(null);
  const [cleanupResult, setCleanupResult] = useState<DatabaseCleanupResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleAnalyze = async (): Promise<void> => {
    setAnalyzing(true);
    setCleanupResult(null);
    try {
      setReport(await analyzeDatabaseHealth());
    } catch (err) {
      useNotificationStore.getState().addNotification('Failed to analyze database', err instanceof Error ? err.message : String(err));
      setReport(null);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleClean = async (): Promise<void> => {
    setConfirmOpen(false);
    setCleaning(true);
    try {
      const result = await cleanDatabase();
      setCleanupResult(result);
      setReport(null);
      useNotificationStore
        .getState()
        .addNotification('Database cleaned', `${result.totalRemoved} item(s) removed.`, 'success');
    } catch (err) {
      useNotificationStore.getState().addNotification('Failed to clean database', err instanceof Error ? err.message : String(err));
    } finally {
      setCleaning(false);
    }
  };

  const issues = report?.issues.filter((issue) => issue.count > 0) ?? [];

  return (
    <Box
      sx={{
        p: 2,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)'),
      }}
    >
      <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
        Database Health
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
        Scan for orphaned data (messages, course data) left behind by deleted topics and other issues.
      </Typography>

      <Button
        variant="outlined"
        size="small"
        startIcon={analyzing ? <CircularProgress size={16} /> : <StorageIcon />}
        onClick={(): void => {
          void handleAnalyze();
        }}
        disabled={analyzing || cleaning}
      >
        {analyzing ? 'Analyzing...' : 'Analyze Database'}
      </Button>

      {report && (
        <Box sx={{ mt: 2 }}>
          <Stack spacing={1.5}>
            <Typography variant="caption" color="text.secondary">
              {report.totalTopics} topics · {report.totalMessages} messages · {report.totalLearningCycles} learning cycles ·{' '}
              {report.totalLearningDays} learning days
            </Typography>

            {issues.length === 0 ? (
              <Box display="flex" alignItems="center" gap={1}>
                <CheckCircleIcon color="success" fontSize="small" />
                <Typography variant="body2" color="success.main">
                  No issues found — your database is clean.
                </Typography>
              </Box>
            ) : (
              <>
                <List dense disablePadding>
                  {issues.map((issue) => (
                    <ListItem key={issue.key} disableGutters disablePadding sx={{ py: 0.5 }}>
                      <ListItemText primary={issue.label} secondary={issue.description} sx={{ mr: 1 }} />
                      <Chip label={issue.count} size="small" color="warning" variant="outlined" />
                    </ListItem>
                  ))}
                </List>

                <Divider />

                <Box display="flex" justifyContent="flex-end">
                  <Button
                    variant="contained"
                    color="error"
                    size="small"
                    startIcon={<DeleteSweepIcon />}
                    onClick={(): void => setConfirmOpen(true)}
                    disabled={cleaning}
                  >
                    Clean {report.totalIssueCount} item{report.totalIssueCount === 1 ? '' : 's'}
                  </Button>
                </Box>
              </>
            )}
          </Stack>
        </Box>
      )}

      {cleanupResult && (
        <Box display="flex" alignItems="center" gap={1} sx={{ mt: 2 }}>
          <CheckCircleIcon color="success" fontSize="small" />
          <Typography variant="body2" color="success.main">
            Removed {cleanupResult.totalRemoved} item{cleanupResult.totalRemoved === 1 ? '' : 's'}.
          </Typography>
        </Box>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Clean database?"
        message="This will permanently delete orphaned and soft-deleted records. Consider exporting a backup first. This cannot be undone."
        confirmLabel="Clean"
        destructive
        onConfirm={(): void => {
          void handleClean();
        }}
        onCancel={(): void => setConfirmOpen(false)}
      />
    </Box>
  );
};

export default DatabaseHealth;
