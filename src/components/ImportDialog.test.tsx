import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ImportDialog from './ImportDialog';

type MergeBackupHandler = (file: File) => Promise<void>;
type RestoreBackupHandler = (file: File) => Promise<void>;

const mockMergeBackup = jest.fn<ReturnType<MergeBackupHandler>, Parameters<MergeBackupHandler>>();
const mockRestoreBackup = jest.fn<ReturnType<RestoreBackupHandler>, Parameters<RestoreBackupHandler>>();

jest.mock('../services/backupService', () => ({
  BackupService: {
    mergeBackup: (...args: Parameters<MergeBackupHandler>): ReturnType<MergeBackupHandler> => mockMergeBackup(...args),
    restoreBackup: (...args: Parameters<RestoreBackupHandler>): ReturnType<RestoreBackupHandler> =>
      mockRestoreBackup(...args),
  },
}));

const MB = 1024 * 1024;

function makeFile(size: number): File {
  const f = new File(['x'], 'backup.json', { type: 'application/json' });
  Object.defineProperty(f, 'size', { value: size, writable: false });
  return f;
}

describe('ImportDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows size error and skips import when file is too large', async () => {
    render(
      <ImportDialog
        open
        file={makeFile(251 * MB)}
        onClose={jest.fn()}
        onComplete={jest.fn()}
      />,
    );

    expect(await screen.findByText(/File too large/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Merge/i }));

    expect(mockMergeBackup).not.toHaveBeenCalled();
    expect(mockRestoreBackup).not.toHaveBeenCalled();
  });

  it('accepts an 80 MB backup without warning', async () => {
    mockMergeBackup.mockResolvedValue();
    const onComplete = jest.fn((): void => undefined);

    render(
      <ImportDialog
        open
        file={makeFile(80 * MB)}
        onClose={jest.fn()}
        onComplete={onComplete}
      />,
    );

    expect(screen.queryByText(/File too large/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/This backup is large/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Merge/i }));

    await waitFor(() => {
      expect(mockMergeBackup).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });

  it('warns about large but allowed backups', () => {
    render(
      <ImportDialog
        open
        file={makeFile(150 * MB)}
        onClose={jest.fn()}
        onComplete={jest.fn()}
      />,
    );

    expect(screen.queryByText(/File too large/i)).not.toBeInTheDocument();
    expect(screen.getByText(/This backup is large/i)).toBeInTheDocument();
  });

  it('runs merge import and calls onComplete', async () => {
    mockMergeBackup.mockResolvedValue();
    const onComplete = jest.fn((): void => undefined);

    render(
      <ImportDialog
        open
        file={makeFile(1024)}
        onClose={jest.fn()}
        onComplete={onComplete}
      />,
    );

    expect(screen.queryByText(/This backup is large/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Merge/i }));

    await waitFor(() => {
      expect(mockMergeBackup).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });
});
