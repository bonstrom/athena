import { Snackbar, Alert, AlertTitle } from "@mui/material";
import { useNotificationStore } from "../store/NotificationStore";
import { JSX, useEffect, useState } from "react";

export const GlobalErrorSnackbar = (): JSX.Element => {
  const { notifications, removeNotification } = useNotificationStore();
  const [current, setCurrent] = useState<null | (typeof notifications)[0]>(null);

  useEffect(() => {
    if (!current && notifications.length > 0) {
      setCurrent(notifications[0]);
    }
  }, [notifications, current]);

  const handleClose = (): void => {
    if (current) {
      removeNotification(current.id);
      setCurrent(null);
    }
  };

  return (
    <Snackbar
      open={!!current}
      autoHideDuration={4000}
      onClose={handleClose}
      anchorOrigin={{ vertical: "top", horizontal: "center" }}>
      <Alert
        severity="error"
        onClose={handleClose}>
        {current?.title && <AlertTitle>{current.title}</AlertTitle>}
        {current?.message}
      </Alert>
    </Snackbar>
  );
};
