import React, { useEffect, useState } from 'react';
import { Box, Button, CircularProgress, Typography } from '@mui/material';
import { athenaDb } from '../database/AthenaDb';

type DbStatus = 'loading' | 'ready' | 'error';

/**
 * Waits for the Dexie database to open before rendering the app, and shows a
 * recovery screen when the database fails to open (e.g. a migration error).
 * This prevents lockout from an unrecoverable async IndexedDB failure, which
 * the React error boundary cannot catch.
 */
const DatabaseGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<DbStatus>('loading');
  const [error, setError] = useState<string>('');

  const openDatabase = (): void => {
    setStatus('loading');
    setError('');
    athenaDb
      .open()
      .then(() => {
        setStatus('ready');
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
        setStatus('error');
      });
  };

  useEffect(() => {
    openDatabase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retry = (): void => {
    athenaDb.close();
    openDatabase();
  };

  if (status === 'ready') return <>{children}</>;

  if (status === 'error') {
    return (
      <Box
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        minHeight="100vh"
        gap={2}
        p={4}
        textAlign="center"
      >
        <Typography variant="h5">Could not open your database</Typography>
        <Typography variant="body2" color="text.secondary" maxWidth={560}>
          Athena was unable to open the local database. This is usually caused by a failed migration or a corrupted
          IndexedDB store.
        </Typography>
        {error ? (
          <Typography
            variant="caption"
            component="pre"
            sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxWidth: 560 }}
          >
            {error}
          </Typography>
        ) : null}
        <Box display="flex" gap={2}>
          <Button variant="contained" onClick={retry}>
            Retry
          </Button>
          <Button
            variant="outlined"
            onClick={(): void => {
              window.location.reload();
            }}
          >
            Reload page
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box display="flex" alignItems="center" justifyContent="center" minHeight="100vh">
      <CircularProgress />
    </Box>
  );
};

export default DatabaseGate;
