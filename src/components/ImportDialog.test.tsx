import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ImportDialog from './ImportDialog';

type MergeBackupHandler = (file: File) => Promise<void>;
type RestoreBackupHandler = (file: File) => Promise<void>;

const mockMergeBackup = jest.fn<ReturnType<MergeBackupHandler>, Parameters<MergeBackupHandler>>();
const mockRestoreBackup = jest.fn<ReturnType<RestoreBackupHandler>, Parameters<RestoreBackupHandler>>();

jest.mock('../services/backupService', () => ({
  BackupService: {
    mergeBackup: (...args: Parameters<MergeBackupHandler>): ReturnType<MergeBackupHandler> => mockMergeBackup(...args),
    restoreBackup: (...args: Parameters<RestoreBackupHandler>): ReturnType<RestoreBackupHandler> => mockRestoreBackup(...args),
  },
}));

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
    render(<ImportDialog open file={makeFile(51 * 1024 * 1024)} onClose={jest.fn()} onComplete={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /^Merge/i }));

    expect(await screen.findByText(/File too large/i)).toBeInTheDocument();
    expect(mockMergeBackup).not.toHaveBeenCalled();
    expect(mockRestoreBackup).not.toHaveBeenCalled();
  });

  it('runs merge import and calls onComplete', async () => {
    mockMergeBackup.mockResolvedValue();
    const onComplete = jest.fn((): void => undefined);

    render(<ImportDialog open file={makeFile(1024)} onClose={jest.fn()} onComplete={onComplete} />);

    fireEvent.click(screen.getByRole('button', { name: /^Merge/i }));

    await waitFor(() => {
      expect(mockMergeBackup).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });
});
