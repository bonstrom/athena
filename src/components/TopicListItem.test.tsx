import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Topic } from '../database/AthenaDb';
import { TopicListItem } from './TopicListItem';
import { useNavigate, useParams } from 'react-router-dom';
import { useUiStore } from '../store/UiStore';
import { useAuthStore } from '../store/AuthStore';
import { useTopicStore } from '../store/TopicStore';

const mockNavigate = jest.fn<void, [string]>();
const mockCloseDrawer = jest.fn<void, []>();
const mockRenameTopic = jest.fn<Promise<void>, [string, string]>(() => Promise.resolve());
const mockDeleteTopic = jest.fn<Promise<void>, [string]>(() => Promise.resolve());

jest.mock('react-router-dom', () => ({
  useNavigate: jest.fn(),
  useParams: jest.fn(),
}));

jest.mock('../store/UiStore', () => ({
  useUiStore: jest.fn(),
}));

jest.mock('../store/AuthStore', () => ({
  useAuthStore: jest.fn(),
}));

jest.mock('../store/TopicStore', () => ({
  useTopicStore: jest.fn(),
}));

jest.mock('./TopicContextDialog', () => ({
  __esModule: true,
  default: (): React.ReactElement => <div data-testid="topic-context-dialog" />,
}));

const mockUseNavigate = useNavigate as unknown as jest.Mock;
const mockUseParams = useParams as unknown as jest.Mock<{ topicId?: string }>;
const mockUseUiStore = useUiStore as unknown as jest.Mock<{ isMobile: boolean; closeDrawer: () => void }>;
const mockUseAuthStore = useAuthStore as unknown as jest.Mock<{ chatFontSize: number }>;
const mockUseTopicStore = useTopicStore as unknown as jest.Mock<{
  renameTopic: (id: string, name: string) => Promise<void>;
  deleteTopic: (id: string) => Promise<void>;
}>;

function createTopic(): Topic {
  return {
    id: 'topic-1',
    name: 'Alpha Topic',
    createdOn: '2026-01-01T00:00:00.000Z',
    updatedOn: '2026-01-01T00:00:00.000Z',
    isDeleted: false,
    forks: [
      { id: 'main', name: 'Main', createdOn: '2026-01-01T00:00:00.000Z' },
      { id: 'fork-2', name: 'Fork 2', createdOn: '2026-01-02T00:00:00.000Z' },
    ],
  };
}

describe('TopicListItem', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockUseNavigate.mockReturnValue(mockNavigate);
    mockUseParams.mockReturnValue({ topicId: 'topic-1' });
    mockUseUiStore.mockReturnValue({ isMobile: true, closeDrawer: (): void => mockCloseDrawer() });
    mockUseAuthStore.mockReturnValue({ chatFontSize: 16 });
    mockUseTopicStore.mockReturnValue({
      renameTopic: (...args: [string, string]): Promise<void> => mockRenameTopic(...args),
      deleteTopic: (...args: [string]): Promise<void> => mockDeleteTopic(...args),
    });
  });

  it('navigates to topic chat and closes drawer on mobile when topic is clicked', () => {
    render(<TopicListItem topic={createTopic()} />);

    fireEvent.click(screen.getByText('Alpha Topic'));

    expect(mockCloseDrawer).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/chat/topic-1');
  });

  it('renames a topic from the options menu', async () => {
    render(<TopicListItem topic={createTopic()} />);

    fireEvent.click(screen.getByLabelText('Topic options'));
    fireEvent.click(screen.getByRole('menuitem', { name: /rename/i }));

    const input = screen.getByLabelText('Topic name');
    fireEvent.change(input, { target: { value: 'Renamed Topic' } });
    fireEvent.click(screen.getByLabelText('Save topic name'));

    await waitFor(() => {
      expect(mockRenameTopic).toHaveBeenCalledWith('topic-1', 'Renamed Topic');
    });
  });

  it('deletes the topic via confirmation dialog and navigates home when it is active', async () => {
    render(<TopicListItem topic={createTopic()} />);

    fireEvent.click(screen.getByLabelText('Topic options'));
    fireEvent.click(screen.getByRole('menuitem', { name: /delete/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(mockDeleteTopic).toHaveBeenCalledWith('topic-1');
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });
});
