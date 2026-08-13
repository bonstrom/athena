import { Snackbar, Alert, AlertTitle } from '@mui/material';
import { useNotificationStore, NotificationSeverity } from '../store/NotificationStore';
import { JSX, useEffect, useState } from 'react';

const AUTO_HIDE_DURATION_MS: Record<NotificationSeverity, number> = {
  success: 3000,
  info: 4000,
  warning: 5000,
  error: 6000,
};

export const GlobalErrorSnackbar = (): JSX.Element => {
  const { notifications, removeNotification } = useNotificationStore();
  const [displayed, setDisplayed] = useState<null | (typeof notifications)[0]>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (notifications.length > 0) {
      setDisplayed(notifications[0]);
      setOpen(true);
    } else {
      setOpen(false);
    }
  }, [notifications]);

  const handleClose = (): void => {
    if (displayed) {
      removeNotification(displayed.id);
    }
  };

  const handleExited = (): void => {
    setDisplayed(null);
  };

  const autoHideDuration = displayed ? AUTO_HIDE_DURATION_MS[displayed.severity ?? 'error'] : undefined;

  return (
    <Snackbar
      key={displayed?.id ?? 'empty'}
      open={open}
      autoHideDuration={autoHideDuration}
      onClose={handleClose}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      TransitionProps={{ onExited: handleExited }}
    >
      <Alert severity={displayed?.severity ?? 'error'} onClose={handleClose}>
        {displayed?.title && <AlertTitle>{displayed.title}</AlertTitle>}
        {displayed?.message}
      </Alert>
    </Snackbar>
  );
};
