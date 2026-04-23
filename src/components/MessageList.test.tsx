import { fireEvent, render, screen } from '@testing-library/react';
import MessageList from './MessageList';
import { useParams } from 'react-router-dom';
import { useScrollToBottom, useSticky } from 'react-scroll-to-bottom';
import { useChatStore } from '../store/ChatStore';
import { useUiStore } from '../store/UiStore';
import { Message } from '../database/AthenaDb';

jest.mock('react-scroll-to-bottom', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }): React.ReactElement => <div>{children}</div>,
  useScrollToBottom: jest.fn(() => jest.fn()),
  useSticky: jest.fn(() => [true]),
}));

jest.mock('react-router-dom', () => ({
  useParams: jest.fn(),
}));

jest.mock('../store/ChatStore', () => ({
  useChatStore: jest.fn(),
}));

jest.mock('../store/UiStore', () => ({
  useUiStore: jest.fn(),
}));

jest.mock('./MessageBubble', () => ({
  __esModule: true,
  default: ({ message }: { message: Message }): React.ReactElement => <div>{message.content}</div>,
}));

jest.mock('./SuggestedReplies', () => ({
  __esModule: true,
  default: ({ suggestions, onSelect }: { suggestions: string[]; onSelect: (s: string) => void }): React.ReactElement => (
    <button
      onClick={(): void => {
        onSelect(suggestions[0]);
      }}
    >
      suggested-replies
    </button>
  ),
}));

const mockUseParams = useParams as unknown as jest.Mock<{ topicId?: string }>;
const mockUseScrollToBottom = useScrollToBottom as unknown as jest.Mock<(...args: unknown[]) => void>;
const mockUseSticky = useSticky as unknown as jest.Mock<[boolean]>;
const mockUseChatStore = useChatStore as unknown as jest.Mock<{ visibleMessageCount: number; increaseVisibleMessageCount: () => void }>;
const mockUseUiStore = useUiStore as unknown as jest.Mock<{ showAllMessages: boolean }>;

function buildMessage(id: string, type: Message['type'], content: string, created: string, extra?: Partial<Message>): Message {
  return {
    id,
    topicId: 'topic-1',
    forkId: 'main',
    type,
    content,
    isDeleted: false,
    includeInContext: true,
    created,
    failed: false,
    promptTokens: 0,
    completionTokens: 0,
    totalCost: 0,
    ...extra,
  };
}

describe('MessageList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseParams.mockReturnValue({ topicId: 'topic-1' });
    mockUseScrollToBottom.mockReturnValue(jest.fn());
    mockUseSticky.mockReturnValue([true]);
    mockUseUiStore.mockReturnValue({ showAllMessages: false });
  });

  it('shows Athena empty state when there are no messages', () => {
    mockUseChatStore.mockReturnValue({
      visibleMessageCount: 20,
      increaseVisibleMessageCount: jest.fn(),
    });

    render(<MessageList messages={[]} maxContextMessages={10} />);

    expect(screen.getByText('Athena')).toBeInTheDocument();
    expect(screen.getByAltText('Athena Logo')).toBeInTheDocument();
  });

  it('shows load older button and triggers increaseVisibleMessageCount', () => {
    const increaseVisibleMessageCount: jest.MockedFunction<() => void> = jest.fn();
    mockUseChatStore.mockReturnValue({
      visibleMessageCount: 1,
      increaseVisibleMessageCount,
    });

    const messages: Message[] = [
      buildMessage('u1', 'user', 'Hello', '2026-04-17T10:00:00.000Z'),
      buildMessage('a1', 'assistant', 'Hi', '2026-04-17T10:00:01.000Z', { parentMessageId: 'u1' }),
      buildMessage('u2', 'user', 'Next', '2026-04-17T10:00:02.000Z'),
    ];

    render(<MessageList messages={messages} maxContextMessages={10} />);

    fireEvent.click(screen.getByRole('button', { name: /Load older messages/i }));

    expect(increaseVisibleMessageCount).toHaveBeenCalledTimes(1);
  });

  it('renders suggestions and forwards selected suggestion', () => {
    mockUseChatStore.mockReturnValue({
      visibleMessageCount: 20,
      increaseVisibleMessageCount: jest.fn(),
    });

    const onSuggestionSelect: jest.MockedFunction<(suggestion: string) => void> = jest.fn();
    const messages: Message[] = [buildMessage('u1', 'user', 'Hello', '2026-04-17T10:00:00.000Z')];

    render(<MessageList messages={messages} maxContextMessages={10} suggestions={['Try this']} onSuggestionSelect={onSuggestionSelect} />);

    fireEvent.click(screen.getByRole('button', { name: 'suggested-replies' }));

    expect(onSuggestionSelect).toHaveBeenCalledWith('Try this');
  });
});
