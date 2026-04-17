import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ImportDialog from './ImportDialog';
import { BackupService } from '../services/backupService';

jest.mock('../services/backupService', () => ({
  BackupService: {
    mergeBackup: jest.fn(),
    restoreBackup: jest.fn(),
  },
}));

const mockMergeBackup = BackupService.mergeBackup as jest.MockedFunction<typeof BackupService.mergeBackup>;
const mockRestoreBackup = BackupService.restoreBackup as jest.MockedFunction<typeof BackupService.restoreBackup>;

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
    const onComplete = jest.fn<void, []>();

    render(<ImportDialog open file={makeFile(1024)} onClose={jest.fn()} onComplete={onComplete} />);

    fireEvent.click(screen.getByRole('button', { name: /^Merge/i }));

    await waitFor(() => {
      expect(mockMergeBackup).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });
});
