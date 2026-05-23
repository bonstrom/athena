import { fireEvent, render, screen } from '@testing-library/react';
import MessageList from './MessageList';
import { useParams } from 'react-router-dom';
import { useScrollToBottom, useSticky } from 'react-scroll-to-bottom';
import { useChatStore } from '../store/ChatStore';
import { useUiStore } from '../store/UiStore';
import type { Message } from '../database/AthenaDb';
import { createMessage } from '../testUtils';

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
const mockUseChatStore = useChatStore as unknown as jest.Mock<{
  visibleMessageCount: number;
  increaseVisibleMessageCount: () => void;
  highlightedMessageId?: string;
  setHighlightedMessageId?: (id: string | null) => void;
}>;
const mockUseUiStore = useUiStore as unknown as jest.Mock<{ showAllMessages: boolean }>;

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
      createMessage({ id: 'u1', type: 'user', content: 'Hello', created: '2026-04-17T10:00:00.000Z', includeInContext: true }),
      createMessage({ id: 'a1', type: 'assistant', content: 'Hi', created: '2026-04-17T10:00:01.000Z', includeInContext: true, parentMessageId: 'u1' }),
      createMessage({ id: 'u2', type: 'user', content: 'Next', created: '2026-04-17T10:00:02.000Z', includeInContext: true }),
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
    const messages: Message[] = [createMessage({ id: 'u1', type: 'user', content: 'Hello', created: '2026-04-17T10:00:00.000Z', includeInContext: true })];

    render(<MessageList messages={messages} maxContextMessages={10} suggestions={['Try this']} onSuggestionSelect={onSuggestionSelect} />);

    fireEvent.click(screen.getByRole('button', { name: 'suggested-replies' }));

    expect(onSuggestionSelect).toHaveBeenCalledWith('Try this');
  });

  it('shows context window indicator when messages exceed maxContextMessages', () => {
    const increaseVisibleMessageCount: jest.MockedFunction<() => void> = jest.fn();
    mockUseChatStore.mockReturnValue({
      visibleMessageCount: 20,
      increaseVisibleMessageCount,
    });

    const messages: Message[] = [];
    for (let i = 0; i < 25; i++) {
      messages.push(
        createMessage({ id: `u${i}`, type: 'user', content: `Message ${i}`, created: `2026-04-17T10:${String(i).padStart(2, '0')}:00.000Z`, includeInContext: true }),
      );
    }

    render(<MessageList messages={messages} maxContextMessages={10} />);

    expect(screen.getByText('Context Window')).toBeInTheDocument();
  });

  it('renders standalone assistant and system messages', () => {
    mockUseChatStore.mockReturnValue({
      visibleMessageCount: 20,
      increaseVisibleMessageCount: jest.fn(),
    });

    const messages: Message[] = [
      createMessage({ id: 'sys1', type: 'system', content: 'System prompt', created: '2026-04-17T10:00:00.000Z', includeInContext: true }),
      createMessage({ id: 'ai1', type: 'assistant', content: 'AI response', created: '2026-04-17T10:00:01.000Z', includeInContext: true }),
      createMessage({ id: 'note1', type: 'aiNote', content: 'Hidden note', created: '2026-04-17T10:00:02.000Z', includeInContext: false }),
    ];

    render(<MessageList messages={messages} maxContextMessages={10} />);

    expect(screen.getByText('System prompt')).toBeInTheDocument();
    expect(screen.getByText('AI response')).toBeInTheDocument();
  });

  it('shows generating suggestions indicator when isSuggestionsLoading is true', () => {
    mockUseChatStore.mockReturnValue({
      visibleMessageCount: 20,
      increaseVisibleMessageCount: jest.fn(),
    });

    const messages: Message[] = [createMessage({ id: 'u1', type: 'user', content: 'Hello', created: '2026-04-17T10:00:00.000Z', includeInContext: true })];

    render(<MessageList messages={messages} maxContextMessages={10} suggestions={['Try this']} isSuggestionsLoading={true} onSuggestionSelect={jest.fn()} />);

    expect(screen.getByText('Generating suggestions...')).toBeInTheDocument();
  });

  it('scrolls to highlighted message when highlightedMessageId is set', () => {
    const setHighlightedMessageId = jest.fn();
    mockUseChatStore.mockReturnValue({
      visibleMessageCount: 50,
      increaseVisibleMessageCount: jest.fn(),
      highlightedMessageId: 'highlighted-msg',
      setHighlightedMessageId,
    });

    const messages: Message[] = [
      createMessage({ id: 'highlighted-msg', type: 'user', content: 'Highlighted message', created: '2026-04-17T10:00:00.000Z', includeInContext: true }),
    ];

    render(<MessageList messages={messages} maxContextMessages={10} />);

    expect(setHighlightedMessageId).toHaveBeenCalledWith(null);
  });

  it('groups user messages with their assistant versions', () => {
    mockUseChatStore.mockReturnValue({
      visibleMessageCount: 20,
      increaseVisibleMessageCount: jest.fn(),
    });

    const messages: Message[] = [
      createMessage({ id: 'u1', type: 'user', content: 'Hello', created: '2026-04-17T10:00:00.000Z', includeInContext: true }),
      createMessage({ id: 'a1', type: 'assistant', content: 'Version 1', created: '2026-04-17T10:00:01.000Z', includeInContext: true, parentMessageId: 'u1' }),
      createMessage({ id: 'a2', type: 'assistant', content: 'Version 2', created: '2026-04-17T10:00:02.000Z', includeInContext: true, parentMessageId: 'u1' }),
    ];

    render(<MessageList messages={messages} maxContextMessages={10} />);

    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('Version 2')).toBeInTheDocument();
  });

  it('hides aiNote content when showAllMessages is false', () => {
    mockUseUiStore.mockReturnValue({ showAllMessages: false });
    mockUseChatStore.mockReturnValue({
      visibleMessageCount: 20,
      increaseVisibleMessageCount: jest.fn(),
    });

    const messages: Message[] = [
      createMessage({ id: 'note1', type: 'aiNote', content: 'This should be hidden', created: '2026-04-17T10:00:00.000Z', includeInContext: true }),
    ];

    render(<MessageList messages={messages} maxContextMessages={10} />);

    expect(screen.queryByText('This should be hidden')).not.toBeInTheDocument();
    expect(screen.getByText('⚠️ Assistant stored a hidden note here.')).toBeInTheDocument();
  });

  it('shows aiNote content when showAllMessages is true', () => {
    mockUseUiStore.mockReturnValue({ showAllMessages: true });
    mockUseChatStore.mockReturnValue({
      visibleMessageCount: 20,
      increaseVisibleMessageCount: jest.fn(),
    });

    const messages: Message[] = [
      createMessage({ id: 'note1', type: 'aiNote', content: 'This should be visible', created: '2026-04-17T10:00:00.000Z', includeInContext: true }),
    ];

    render(<MessageList messages={messages} maxContextMessages={10} />);

    expect(screen.getByText('This should be visible')).toBeInTheDocument();
  });
});
