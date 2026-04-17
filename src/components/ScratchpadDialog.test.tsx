import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ScratchpadDialog from './ScratchpadDialog';
import { useTopicStore } from '../store/TopicStore';

interface TopicStoreState {
  topics: { id: string; scratchpad?: string }[];
  updateTopicScratchpad: (id: string, scratchpad: string) => Promise<void>;
}

const mockUpdateTopicScratchpad = jest.fn<Promise<void>, [string, string]>(() => Promise.resolve());

jest.mock('../store/TopicStore', () => ({
  useTopicStore: jest.fn(),
}));

const mockUseTopicStore = useTopicStore as unknown as jest.Mock;

describe('ScratchpadDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseTopicStore.mockImplementation((selector: (state: TopicStoreState) => unknown): unknown =>
      selector({
        topics: [{ id: 'topic-1', scratchpad: 'Existing notes' }],
        updateTopicScratchpad: (...args: [string, string]): Promise<void> => mockUpdateTopicScratchpad(...args),
      }),
    );
  });

  it('loads existing scratchpad and saves updates', async () => {
    const onClose = jest.fn<void, []>();

    render(<ScratchpadDialog open topicId="topic-1" onClose={onClose} />);

    const input = screen.getByPlaceholderText('No notes stored yet...');
    expect(input).toHaveValue('Existing notes');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockUpdateTopicScratchpad).toHaveBeenCalledWith('topic-1', 'Existing notes');
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
