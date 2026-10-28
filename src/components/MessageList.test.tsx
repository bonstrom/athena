import { fireEvent, render, screen } from '@testing-library/react';
import MessageList from './MessageList';
import { useParams } from 'react-router-dom';
import { useScrollToBottom, useSticky } from 'react-scroll-to-bottom';
import { useChatStore } from '../store/ChatStore';
import { useUiStore } from '../store/UiStore';
import type { Message } from '../database/AthenaDb';
import { createMessage, selectorize } from '../testUtils';

let mockDeferScrollChildren = false;

jest.mock('react-scroll-to-bottom', () => {
  const { useEffect, useState } = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: function DeferredScrollToBottom({ children }: { children: React.ReactNode }): React.ReactElement | null {
      const [ready, setReady] = useState(!mockDeferScrollChildren);
      useEffect(() => {
        if (ready) return;
        const timer = setTimeout(() => setReady(true), 0);
        return (): void => clearTimeout(timer);
      }, [ready]);
      return ready ? <div>{children}</div> : null;
    },
    useScrollToBottom: jest.fn(() => jest.fn()),
    useSticky: jest.fn(() => [true]),
  };
});

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
  default: ({
    suggestions,
    onSelect,
  }: {
    suggestions: string[];
    onSelect: (s: string) => void;
  }): React.ReactElement => (
    <button
      onClick={(): void => {
        onSelect(suggestions[0]);
      }}>
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
  currentRequestMessageIds?: { userMessageId: string; assistantMessageId: string } | null;
  isInitialLoad?: boolean;
}>;
const mockUseUiStore = useUiStore as unknown as jest.Mock<{ showAllMessages: boolean }>;

describe('MessageList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDeferScrollChildren = false;
    mockUseParams.mockReturnValue({ topicId: 'topic-1' });
    mockUseScrollToBottom.mockReturnValue(jest.fn());
    mockUseSticky.mockReturnValue([true]);
    selectorize(mockUseUiStore, { showAllMessages: false });
  });

  it('shows Athena empty state when there are no messages', () => {
    selectorize(mockUseChatStore, {
      visibleMessageCount: 20,
      increaseVisibleMessageCount: jest.fn(),
    });

    render(
      <MessageList
        messages={[]}
        maxContextMessages={10}
      />,
    );

    expect(screen.getByText('Athena')).toBeInTheDocument();
    expect(screen.getByAltText('Athena Logo')).toBeInTheDocument();
  });

  it('animates live arrivals but not history, streamed updates, or reopened conversations', () => {
    selectorize(mockUseChatStore, {
      visibleMessageCount: 20,
      increaseVisibleMessageCount: jest.fn(),
      currentRequestMessageIds: null,
    });
    const history = createMessage({ id: 'old', content: 'Old message' });
    const live = createMessage({ id: 'live-user', content: 'New message', created: '2026-10-28T12:00:00.000Z' });
    const { container, rerender } = render(
      <MessageList
        messages={[history]}
        maxContextMessages={10}
      />,
    );
    expect(container.querySelector('.athena-message-enter')).toBeNull();

    selectorize(mockUseChatStore, {
      visibleMessageCount: 20,
      increaseVisibleMessageCount: jest.fn(),
      currentRequestMessageIds: { userMessageId: 'live-user', assistantMessageId: 'live-assistant' },
    });
    rerender(
      <MessageList
        messages={[history, live]}
        maxContextMessages={10}
      />,
    );
    expect(screen.getByText('New message').parentElement).toHaveClass('athena-message-enter');
    expect(screen.getByText('Old message').parentElement).not.toHaveClass('athena-message-enter');
    const animated = screen.getByText('New message').parentElement;
    rerender(
      <MessageList
        messages={[history, { ...live, content: 'Updated message' }]}
        maxContextMessages={10}
      />,
    );
    expect(screen.getByText('Updated message').parentElement).toBe(animated);

    mockUseParams.mockReturnValue({ topicId: 'topic-2' });
    rerender(
      <MessageList
        messages={[createMessage({ id: 'other', topicId: 'topic-2' })]}
        maxContextMessages={10}
      />,
    );
    mockUseParams.mockReturnValue({ topicId: 'topic-1' });
    rerender(
      <MessageList
        messages={[history, live]}
        maxContextMessages={10}
      />,
    );
    expect(container.querySelector('.athena-message-enter')).toBeNull();
  });

  it('does not animate historical messages when opening an already active request', () => {
    selectorize(mockUseChatStore, {
      visibleMessageCount: 20,
      increaseVisibleMessageCount: jest.fn(),
      currentRequestMessageIds: { userMessageId: 'loading-user', assistantMessageId: 'loading-assistant' },
      isInitialLoad: true,
    });
    const { container, rerender } = render(
      <MessageList
        messages={[]}
        maxContextMessages={10}
      />,
    );
    rerender(
      <MessageList
        messages={[createMessage({ id: 'loading-user', content: 'Hydrated history' })]}
        maxContextMessages={10}
      />,
    );
    expect(screen.getByText('Hydrated history')).toBeInTheDocument();
    expect(container.querySelector('.athena-message-enter')).toBeNull();
  });

  it('animates the first live pair even when the scroll container defers mounting its children', async () => {
    mockDeferScrollChildren = true;
    selectorize(mockUseChatStore, {
      visibleMessageCount: 20,
      increaseVisibleMessageCount: jest.fn(),
      currentRequestMessageIds: null,
    });
    const { rerender } = render(
      <MessageList
        messages={[]}
        maxContextMessages={10}
      />,
    );
    selectorize(mockUseChatStore, {
      visibleMessageCount: 20,
      increaseVisibleMessageCount: jest.fn(),
      currentRequestMessageIds: { userMessageId: 'first-user', assistantMessageId: 'first-assistant' },
      isInitialLoad: true,
    });
    const messages = [
      createMessage({ id: 'first-user', content: 'First question' }),
      createMessage({
        id: 'first-assistant',
        type: 'assistant',
        content: 'First answer',
        parentMessageId: 'first-user',
      }),
    ];
    rerender(
      <MessageList
        messages={messages}
        maxContextMessages={10}
      />,
    );
    expect((await screen.findByText('First question')).parentElement).toHaveClass('athena-message-enter');
    expect(screen.getByText('First answer').parentElement).toHaveClass('athena-message-enter');
  });

  it('shows load older button and triggers increaseVisibleMessageCount', () => {
    const increaseVisibleMessageCount: jest.MockedFunction<() => void> = jest.fn();
    selectorize(mockUseChatStore, {
      visibleMessageCount: 1,
      increaseVisibleMessageCount,
    });

    const messages: Message[] = [
      createMessage({
        id: 'u1',
        type: 'user',
        content: 'Hello',
        created: '2026-04-17T10:00:00.000Z',
        includeInContext: true,
      }),
      createMessage({
        id: 'a1',
        type: 'assistant',
        content: 'Hi',
        created: '2026-04-17T10:00:01.000Z',
        includeInContext: true,
        parentMessageId: 'u1',
      }),
      createMessage({
        id: 'u2',
        type: 'user',
        content: 'Next',
        created: '2026-04-17T10:00:02.000Z',
        includeInContext: true,
      }),
    ];

    render(
      <MessageList
        messages={messages}
        maxContextMessages={10}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Load older messages/i }));

    expect(increaseVisibleMessageCount).toHaveBeenCalledTimes(1);
  });

  it('renders suggestions and forwards selected suggestion', () => {
    selectorize(mockUseChatStore, {
      visibleMessageCount: 20,
      increaseVisibleMessageCount: jest.fn(),
    });

    const onSuggestionSelect: jest.MockedFunction<(suggestion: string) => void> = jest.fn();
    const messages: Message[] = [
      createMessage({
        id: 'u1',
        type: 'user',
        content: 'Hello',
        created: '2026-04-17T10:00:00.000Z',
        includeInContext: true,
      }),
    ];

    render(
      <MessageList
        messages={messages}
        maxContextMessages={10}
        suggestions={['Try this']}
        onSuggestionSelect={onSuggestionSelect}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'suggested-replies' }));

    expect(onSuggestionSelect).toHaveBeenCalledWith('Try this');
  });

  it('shows context window indicator when messages exceed maxContextMessages', () => {
    const increaseVisibleMessageCount: jest.MockedFunction<() => void> = jest.fn();
    selectorize(mockUseChatStore, {
      visibleMessageCount: 20,
      increaseVisibleMessageCount,
    });

    const messages: Message[] = [];
    for (let i = 0; i < 25; i++) {
      messages.push(
        createMessage({
          id: `u${i}`,
          type: 'user',
          content: `Message ${i}`,
          created: `2026-04-17T10:${String(i).padStart(2, '0')}:00.000Z`,
          includeInContext: true,
        }),
      );
    }

    render(
      <MessageList
        messages={messages}
        maxContextMessages={10}
      />,
    );

    expect(screen.getByText('Context Window')).toBeInTheDocument();
  });

  it('renders standalone assistant and system messages', () => {
    selectorize(mockUseChatStore, {
      visibleMessageCount: 20,
      increaseVisibleMessageCount: jest.fn(),
    });

    const messages: Message[] = [
      createMessage({
        id: 'sys1',
        type: 'system',
        content: 'System prompt',
        created: '2026-04-17T10:00:00.000Z',
        includeInContext: true,
      }),
      createMessage({
        id: 'ai1',
        type: 'assistant',
        content: 'AI response',
        created: '2026-04-17T10:00:01.000Z',
        includeInContext: true,
      }),
      createMessage({
        id: 'note1',
        type: 'aiNote',
        content: 'Hidden note',
        created: '2026-04-17T10:00:02.000Z',
        includeInContext: false,
      }),
    ];

    render(
      <MessageList
        messages={messages}
        maxContextMessages={10}
      />,
    );

    expect(screen.getByText('System prompt')).toBeInTheDocument();
    expect(screen.getByText('AI response')).toBeInTheDocument();
  });

  it('shows generating suggestions indicator when isSuggestionsLoading is true', () => {
    selectorize(mockUseChatStore, {
      visibleMessageCount: 20,
      increaseVisibleMessageCount: jest.fn(),
    });

    const messages: Message[] = [
      createMessage({
        id: 'u1',
        type: 'user',
        content: 'Hello',
        created: '2026-04-17T10:00:00.000Z',
        includeInContext: true,
      }),
    ];

    render(
      <MessageList
        messages={messages}
        maxContextMessages={10}
        suggestions={['Try this']}
        isSuggestionsLoading
        onSuggestionSelect={jest.fn()}
      />,
    );

    expect(screen.getByText('Generating suggestions...')).toBeInTheDocument();
  });

  it('scrolls to highlighted message when highlightedMessageId is set', () => {
    const setHighlightedMessageId = jest.fn();
    selectorize(mockUseChatStore, {
      visibleMessageCount: 50,
      increaseVisibleMessageCount: jest.fn(),
      highlightedMessageId: 'highlighted-msg',
      setHighlightedMessageId,
    });

    const messages: Message[] = [
      createMessage({
        id: 'highlighted-msg',
        type: 'user',
        content: 'Highlighted message',
        created: '2026-04-17T10:00:00.000Z',
        includeInContext: true,
      }),
    ];

    render(
      <MessageList
        messages={messages}
        maxContextMessages={10}
      />,
    );

    expect(setHighlightedMessageId).toHaveBeenCalledWith(null);
  });

  it('groups user messages with their assistant versions', () => {
    selectorize(mockUseChatStore, {
      visibleMessageCount: 20,
      increaseVisibleMessageCount: jest.fn(),
    });

    const messages: Message[] = [
      createMessage({
        id: 'u1',
        type: 'user',
        content: 'Hello',
        created: '2026-04-17T10:00:00.000Z',
        includeInContext: true,
      }),
      createMessage({
        id: 'a1',
        type: 'assistant',
        content: 'Version 1',
        created: '2026-04-17T10:00:01.000Z',
        includeInContext: true,
        parentMessageId: 'u1',
      }),
      createMessage({
        id: 'a2',
        type: 'assistant',
        content: 'Version 2',
        created: '2026-04-17T10:00:02.000Z',
        includeInContext: true,
        parentMessageId: 'u1',
      }),
    ];

    render(
      <MessageList
        messages={messages}
        maxContextMessages={10}
      />,
    );

    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('Version 2')).toBeInTheDocument();
  });

  it('renders a reply once when its timestamp precedes its question', () => {
    selectorize(mockUseChatStore, {
      visibleMessageCount: 20,
      increaseVisibleMessageCount: jest.fn(),
    });

    const messages: Message[] = [
      createMessage({
        id: 'a1',
        type: 'assistant',
        content: 'Reply',
        created: '2026-04-17T09:59:00.000Z',
        includeInContext: true,
        parentMessageId: 'u1',
      }),
      createMessage({
        id: 'u1',
        type: 'user',
        content: 'Question',
        created: '2026-04-17T10:00:00.000Z',
        includeInContext: true,
      }),
    ];

    render(
      <MessageList
        messages={messages}
        maxContextMessages={10}
      />,
    );

    expect(screen.getAllByText('Reply')).toHaveLength(1);
    expect(screen.getByText('Question')).toBeInTheDocument();
  });

  it('hides aiNote content when showAllMessages is false', () => {
    selectorize(mockUseUiStore, { showAllMessages: false });
    selectorize(mockUseChatStore, {
      visibleMessageCount: 20,
      increaseVisibleMessageCount: jest.fn(),
    });

    const messages: Message[] = [
      createMessage({
        id: 'note1',
        type: 'aiNote',
        content: 'This should be hidden',
        created: '2026-04-17T10:00:00.000Z',
        includeInContext: true,
      }),
    ];

    render(
      <MessageList
        messages={messages}
        maxContextMessages={10}
      />,
    );

    expect(screen.queryByText('This should be hidden')).not.toBeInTheDocument();
    expect(screen.getByText('⚠️ Assistant stored a hidden note here.')).toBeInTheDocument();
  });

  it('shows aiNote content when showAllMessages is true', () => {
    selectorize(mockUseUiStore, { showAllMessages: true });
    selectorize(mockUseChatStore, {
      visibleMessageCount: 20,
      increaseVisibleMessageCount: jest.fn(),
    });

    const messages: Message[] = [
      createMessage({
        id: 'note1',
        type: 'aiNote',
        content: 'This should be visible',
        created: '2026-04-17T10:00:00.000Z',
        includeInContext: true,
      }),
    ];

    render(
      <MessageList
        messages={messages}
        maxContextMessages={10}
      />,
    );

    expect(screen.getByText('This should be visible')).toBeInTheDocument();
  });
});
