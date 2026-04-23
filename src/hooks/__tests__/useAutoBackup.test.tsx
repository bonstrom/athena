import React from 'react';
import { act, render } from '@testing-library/react';

const mockPerformAutoBackup = jest.fn<Promise<void>, [boolean]>();

jest.mock('../../services/backupService', () => ({
  BackupService: {
    performAutoBackup: (...args: [boolean]): Promise<void> => mockPerformAutoBackup(...args),
  },
}));

jest.mock('../../store/NotificationStore', () => ({
  useNotificationStore: (): { addNotification: jest.Mock } => ({
    addNotification: jest.fn(),
  }),
}));

import { useAutoBackup } from '../useAutoBackup';

const HookHarness: React.FC<{ intervalMinutes: number }> = ({ intervalMinutes }): React.ReactElement | null => {
  useAutoBackup(intervalMinutes);
  return null;
};

describe('useAutoBackup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockPerformAutoBackup.mockResolvedValue();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('runs once after mount delay and then on the configured interval', async () => {
    render(<HookHarness intervalMinutes={1} />);

    expect(mockPerformAutoBackup).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    expect(mockPerformAutoBackup).toHaveBeenCalledTimes(1);
    expect(mockPerformAutoBackup).toHaveBeenLastCalledWith(false);

    await act(async () => {
      jest.advanceTimersByTime(60_000);
      await Promise.resolve();
    });

    expect(mockPerformAutoBackup).toHaveBeenCalledTimes(2);
    expect(mockPerformAutoBackup).toHaveBeenLastCalledWith(false);
  });

  it('cleans up timers on unmount', async () => {
    const view = render(<HookHarness intervalMinutes={1} />);

    view.unmount();

    await act(async () => {
      jest.advanceTimersByTime(5_000 + 60_000 * 2);
      await Promise.resolve();
    });

    expect(mockPerformAutoBackup).not.toHaveBeenCalled();
  });

  it('swallows BackupService errors and continues scheduling', async () => {
    mockPerformAutoBackup.mockRejectedValueOnce(new Error('backup failed')).mockResolvedValue();

    render(<HookHarness intervalMinutes={1} />);

    await act(async () => {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    await act(async () => {
      jest.advanceTimersByTime(60_000);
      await Promise.resolve();
    });

    expect(mockPerformAutoBackup).toHaveBeenCalledTimes(2);
  });
});
