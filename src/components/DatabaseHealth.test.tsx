import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithTheme } from '../testUtils';
import DatabaseHealth from './DatabaseHealth';
import { analyzeDatabaseHealth, cleanDatabase } from '../services/databaseHealthService';

jest.mock('../services/databaseHealthService', () => ({
  analyzeDatabaseHealth: jest.fn(),
  cleanDatabase: jest.fn(),
}));

jest.mock('../store/NotificationStore', () => ({
  useNotificationStore: {
    getState: (): { addNotification: (title: string, message?: string, severity?: string) => void } => ({
      addNotification: (...args: [string, string?, string?]): void => {
        mockAddNotification(...args);
      },
    }),
  },
}));

const mockAnalyze = analyzeDatabaseHealth as jest.MockedFunction<typeof analyzeDatabaseHealth>;
const mockClean = cleanDatabase as jest.MockedFunction<typeof cleanDatabase>;
const mockAddNotification = jest.fn((_title: string, _message?: string, _severity?: string): void => undefined);

describe('DatabaseHealth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAnalyze.mockResolvedValue({
      issues: [],
      totalIssueCount: 0,
      totalTopics: 0,
      totalMessages: 0,
      totalLearningCycles: 0,
      totalLearningDays: 0,
    });
    mockClean.mockResolvedValue({
      removed: { orphanedMessages: 0, softDeletedMessages: 0, orphanedLearningCycles: 0, orphanedLearningDays: 0 },
      totalRemoved: 0,
    });
  });

  it('reports no issues when the database is clean', async () => {
    renderWithTheme(<DatabaseHealth />);

    fireEvent.click(screen.getByRole('button', { name: 'Analyze Database' }));

    await waitFor(() => {
      expect(screen.getByText(/No issues found/)).toBeInTheDocument();
    });
  });

  it('lists detected issues and cleans them after confirmation', async () => {
    mockAnalyze.mockResolvedValue({
      issues: [
        { key: 'orphanedMessages', label: 'Orphaned messages', description: 'desc', count: 2 },
        { key: 'orphanedLearningDays', label: 'Orphaned learning days', description: 'desc', count: 1 },
        { key: 'softDeletedMessages', label: 'Soft-deleted messages', description: 'desc', count: 0 },
        { key: 'orphanedLearningCycles', label: 'Orphaned learning cycles', description: 'desc', count: 0 },
      ],
      totalIssueCount: 3,
      totalTopics: 1,
      totalMessages: 5,
      totalLearningCycles: 1,
      totalLearningDays: 1,
    });
    mockClean.mockResolvedValue({
      removed: { orphanedMessages: 2, softDeletedMessages: 0, orphanedLearningCycles: 0, orphanedLearningDays: 1 },
      totalRemoved: 3,
    });

    renderWithTheme(<DatabaseHealth />);

    fireEvent.click(screen.getByRole('button', { name: 'Analyze Database' }));

    await waitFor(() => {
      expect(screen.getByText('Orphaned messages')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Clean 3 items' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clean 3 items' }));

    await waitFor(() => {
      expect(screen.getByText(/This will permanently delete/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clean' }));

    await waitFor(() => {
      expect(mockClean).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/Removed 3 items/)).toBeInTheDocument();
      expect(mockAddNotification).toHaveBeenCalledWith('Database cleaned', '3 item(s) removed.', 'success');
    });
  });
});
