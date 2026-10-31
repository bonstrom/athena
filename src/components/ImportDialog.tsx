import React, { useEffect, useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Stack, Alert, CircularProgress } from '@mui/material';
import MergeIcon from '@mui/icons-material/CallMerge';
import RestoreIcon from '@mui/icons-material/RestoreFromTrash';
import { BackupService } from '../services/backupService';

interface ImportDialogProps {
  open: boolean;
  file: File | null;
  onClose: () => void;
  onComplete: () => void;
}

type ImportMode = 'merge' | 'replace';

// Backups are validated by streaming the full JSON document, then imported in
// chunks, so the realistic ceiling is browser memory during the staged replace
// (all rows are briefly held in JS before the live transaction). 250 MB leaves
// headroom above real-world databases, though memory limits vary by device.
const MAX_IMPORT_SIZE = 250 * 1024 * 1024; // 250 MB
const LARGE_IMPORT_WARNING_SIZE = 100 * 1024 * 1024; // 100 MB

const ImportDialog: React.FC<ImportDialogProps> = ({ open, file, onClose, onComplete }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileSizeMb = file ? file.size / 1024 / 1024 : 0;
  const fileTooLarge = file !== null && file.size > MAX_IMPORT_SIZE;
  const isLargeFile = file !== null && file.size > LARGE_IMPORT_WARNING_SIZE;

  useEffect(() => {
    setError(fileTooLarge ? `File too large (${fileSizeMb.toFixed(1)} MB). Maximum allowed size is 250 MB.` : null);
  }, [fileTooLarge, fileSizeMb]);

  const handleImport = async (mode: ImportMode): Promise<void> => {
    if (!file) return;

    if (file.size > MAX_IMPORT_SIZE) {
      setError(`File too large (${fileSizeMb.toFixed(1)} MB). Maximum allowed size is 250 MB.`);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (mode === 'merge') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        await BackupService.mergeBackup(file);
      } else {
        await BackupService.restoreBackup(file);
      }
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = (): void => {
    if (!loading) onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 'bold' }}>Import Backup</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Choose how to import <strong>{file?.name}</strong>:
          </Typography>

          <Stack
            direction="row"
            spacing={2}
            sx={{
              '& > button': {
                flex: 1,
                py: 2,
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                textTransform: 'none',
              },
            }}
          >
            <Button
              variant="outlined"
              color="primary"
              disabled={loading}
              onClick={(): void => {
                void handleImport('merge');
              }}
              startIcon={<MergeIcon />}
            >
              <Typography variant="body2" fontWeight="bold">
                Merge
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'normal', textAlign: 'center' }}>
                Keeps existing conversations. Adds and updates from backup. A safety backup is downloaded first.
              </Typography>
            </Button>

            <Button
              variant="outlined"
              color="error"
              disabled={loading}
              onClick={(): void => {
                void handleImport('replace');
              }}
              startIcon={<RestoreIcon />}
            >
              <Typography variant="body2" fontWeight="bold">
                Replace
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'normal', textAlign: 'center' }}>
                Deletes all current conversations and replaces them with the backup.
              </Typography>
            </Button>
          </Stack>

          {loading && (
            <Stack direction="row" spacing={1} alignItems="center">
              <CircularProgress size={16} />
              <Typography variant="body2" color="text.secondary">
                Importing…
              </Typography>
            </Stack>
          )}

          {!fileTooLarge && isLargeFile && (
            <Alert severity="info">
              This backup is large ({fileSizeMb.toFixed(1)} MB). Importing may take a while and use a lot of memory, so
              keep this tab open until it finishes.
            </Alert>
          )}

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ImportDialog;
