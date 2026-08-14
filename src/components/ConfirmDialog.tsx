import { Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button } from '@mui/material';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Shared confirmation dialog used in place of native `window.confirm` so that
 * destructive actions match the rest of the app's MUI styling and are
 * keyboard/accessibility friendly.
 */
const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}) => {
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 'bold' }}>{title}</DialogTitle>
      {message && (
        <DialogContent>
          <DialogContentText>{message}</DialogContentText>
        </DialogContent>
      )}
      <DialogActions>
        <Button onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button onClick={onConfirm} color={destructive ? 'error' : 'primary'} variant={destructive ? 'contained' : 'text'}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ConfirmDialog;
