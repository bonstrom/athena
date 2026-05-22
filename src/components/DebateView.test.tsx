import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import DebateView from './DebateView';
import { createMessage, createTopic, renderWithTheme } from '../testUtils';
import { useDebateStore } from '../store/DebateStore';
import { useAuthStore } from '../store/AuthStore';
import { Message, Topic } from '../database/AthenaDb';

interface DebateStoreSlice {
  debateModelA: unknown;
  debateModelB: unknown;
  debateSending: boolean;
  currentPhase: string;
  streamingContentA: string;
  streamingContentB: string;
  streamingConsensus: string;
  initDebateModels: (topicId: string) => void;
  sendDebateRound: (content: string, topicId: string) => Promise<void>;
  continueDebate: (topicId: string) => Promise<void>;
  stopDebate: () => void;
  setDebateModelA: (model: unknown, topicId: string) => void;
  setDebateModelB: (model: unknown, topicId: string) => void;
}

const mockDebateStore: DebateStoreSlice = {
  debateModelA: { id: 'model-a', label: 'Model A', apiModelId: 'model-a-api' },
  debateModelB: { id: 'model-b', label: 'Model B', apiModelId: 'model-b-api' },
  debateSending: false,
  currentPhase: 'idle',
  streamingContentA: '',
  streamingContentB: '',
  streamingConsensus: '',
  initDebateModels: jest.fn(),
  sendDebateRound: jest.fn((): Promise<void> => Promise.resolve()),
  continueDebate: jest.fn((): Promise<void> => Promise.resolve()),
  stopDebate: jest.fn(),
  setDebateModelA: jest.fn(),
  setDebateModelB: jest.fn(),
};

jest.mock('./ModelSelector', () => ({
  __esModule: true,
  default: ({ selectedModel }: { selectedModel: { label: string } }): React.ReactElement => (
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    <div data-testid="model-selector">{selectedModel ? selectedModel.label : 'No model'}</div>
  ),
}));

jest.mock('./MessageBubble', () => ({
  __esModule: true,
  default: ({ message }: { message: Message }): React.ReactElement => (
    <div data-testid={`message-bubble-${message.id}`}>{message.content}</div>
  ),
}));

jest.mock('./DebateComposer', () => ({
  __esModule: true,
  default: ({
    sending,
    canContinue,
    onSend,
    onStop,
    onContinue,
  }: {
    sending: boolean;
    canContinue: boolean;
    onSend: (content: string) => void;
    onStop: () => void;
    onContinue: () => void;
  }): React.ReactElement => (
    <div data-testid="debate-composer">
      <button data-testid="composer-send" onClick={(): void => onSend('test question')} disabled={sending}>
        Send
      </button>
      <button data-testid="composer-stop" onClick={onStop}>
        Stop
      </button>
      {canContinue && (
        <button data-testid="composer-continue" onClick={onContinue}>
          Continue
        </button>
      )}
    </div>
  ),
}));

jest.mock('./MarkdownWithCode', () => ({
  __esModule: true,
  default: ({ children }: { children: string }): React.ReactElement => <div data-testid="markdown-content">{children}</div>,
}));

jest.mock('./TypingIndicator', () => ({
  __esModule: true,
  default: (): React.ReactElement => <div data-testid="typing-indicator" />,
}));

jest.mock('../store/DebateStore', () => ({
  useDebateStore: jest.fn(),
}));

jest.mock('../store/AuthStore', () => ({
  useAuthStore: jest.fn(),
}));

const mockUseDebateStore = useDebateStore as unknown as jest.Mock<DebateStoreSlice>;
const mockUseAuthStore = useAuthStore as unknown as jest.Mock<{ chatWidth: string; setChatWidth: () => void }>;

function setupDebateStore(overrides?: Partial<DebateStoreSlice>): void {
  mockUseDebateStore.mockReturnValue({ ...mockDebateStore, ...overrides });
}

function createBaseTopic(overrides?: Partial<Topic>): Topic {
  return createTopic({ id: 'topic-1', name: 'Debate Topic', ...overrides });
}

function createAssistantMsg(overrides: Partial<Message> & { id: string }): Message {
  return createMessage({ type: 'assistant', content: `Response for ${overrides.id}`, ...overrides });
}

describe('DebateView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDebateStore();
    mockUseAuthStore.mockReturnValue({
      chatWidth: 'md',
      setChatWidth: jest.fn(),
    });
  });

  it('renders info banner when no messages and not sending', () => {
    renderWithTheme(<DebateView topic={createBaseTopic()} messages={[]} />);

    expect(screen.getByText(/Debates run 4 rounds/)).toBeInTheDocument();
  });

  it('does not render info banner when sending', () => {
    setupDebateStore({ debateSending: true });

    renderWithTheme(<DebateView topic={createBaseTopic()} messages={[]} />);

    expect(screen.queryByText(/Debates run 4 rounds/)).not.toBeInTheDocument();
  });

  it('does not render info banner when messages exist', () => {
    const messages = [createMessage({ id: 'msg-1' })];

    renderWithTheme(<DebateView topic={createBaseTopic()} messages={messages} />);

    expect(screen.queryByText(/Debates run 4 rounds/)).not.toBeInTheDocument();
  });

  it('calls initDebateModels on mount with topic id', () => {
    const initDebateModels = jest.fn();
    setupDebateStore({ initDebateModels });

    renderWithTheme(<DebateView topic={createBaseTopic({ id: 'topic-1' })} messages={[]} />);

    expect(initDebateModels).toHaveBeenCalledWith('topic-1');
  });

  it('renders phase banner when currentPhase is not idle', () => {
    setupDebateStore({ currentPhase: 'answer' });

    renderWithTheme(<DebateView topic={createBaseTopic()} messages={[]} />);

    expect(screen.getByText('Round 1 — Initial Answers')).toBeInTheDocument();
  });

  it('renders phase banner text when phase has no mapped banner', () => {
    setupDebateStore({ currentPhase: 'custom-phase' as unknown as string });

    renderWithTheme(<DebateView topic={createBaseTopic()} messages={[]} />);

    expect(screen.getByText('custom-phase')).toBeInTheDocument();
  });

  it('renders user messages in both left and right columns', () => {
    const messages = [createMessage({ id: 'user-1', type: 'user', content: 'My question' })];

    renderWithTheme(<DebateView topic={createBaseTopic()} messages={messages} />);

    const userBubbles = screen.getAllByTestId(/message-bubble-user-1/);
    expect(userBubbles.length).toBe(2);
  });

  it('routes assistant messages to left column by debateSide', () => {
    const messages = [
      createMessage({ id: 'user-1', type: 'user', content: 'Question' }),
      createAssistantMsg({ id: 'left-1', debateSide: 'left', debatePhase: 'answer' }),
    ];

    renderWithTheme(<DebateView topic={createBaseTopic()} messages={messages} />);

    const leftBubbles = screen.getAllByTestId(/message-bubble-left-1/);
    expect(leftBubbles.length).toBe(1);
    expect(screen.queryByTestId('message-bubble-left-1-right-column')).toBeNull();
  });

  it('routes assistant messages to right column by debateSide', () => {
    const messages = [
      createMessage({ id: 'user-1', type: 'user', content: 'Question' }),
      createAssistantMsg({ id: 'right-1', debateSide: 'right', debatePhase: 'answer' }),
    ];

    renderWithTheme(<DebateView topic={createBaseTopic()} messages={messages} />);

    expect(screen.getByTestId('message-bubble-right-1')).toBeInTheDocument();
  });

  it('renders model selectors in both columns', () => {
    setupDebateStore({
      debateModelA: { id: 'model-a', label: 'Left Model' },
      debateModelB: { id: 'model-b', label: 'Right Model' },
    });

    renderWithTheme(<DebateView topic={createBaseTopic()} messages={[]} />);

    const selectors = screen.getAllByTestId('model-selector');
    expect(selectors.length).toBe(2);
    expect(selectors[0]).toHaveTextContent('Left Model');
    expect(selectors[1]).toHaveTextContent('Right Model');
  });

  it('renders DebateComposer', () => {
    renderWithTheme(<DebateView topic={createBaseTopic()} messages={[]} />);

    expect(screen.getByTestId('debate-composer')).toBeInTheDocument();
  });

  it('calls sendDebateRound when composer sends', () => {
    const sendDebateRound = jest.fn((): Promise<void> => Promise.resolve());
    setupDebateStore({ sendDebateRound });

    renderWithTheme(<DebateView topic={createBaseTopic({ id: 'topic-1' })} messages={[]} />);

    fireEvent.click(screen.getByTestId('composer-send'));

    expect(sendDebateRound).toHaveBeenCalledWith('test question', 'topic-1');
  });

  it('calls stopDebate when composer stops', () => {
    const stopDebate = jest.fn();
    setupDebateStore({ stopDebate, debateSending: true });

    renderWithTheme(<DebateView topic={createBaseTopic()} messages={[]} />);

    fireEvent.click(screen.getByTestId('composer-stop'));

    expect(stopDebate).toHaveBeenCalled();
  });

  it('shows typing indicator while waiting for first token during sending', () => {
    setupDebateStore({ debateSending: true, streamingContentA: '', streamingContentB: '' });

    renderWithTheme(<DebateView topic={createBaseTopic()} messages={[]} />);

    const indicators = screen.getAllByTestId('typing-indicator');
    expect(indicators.length).toBe(2);
  });

  it('shows streaming content when debate is sending with content', () => {
    setupDebateStore({
      debateSending: true,
      streamingContentA: 'Left streaming...',
      streamingContentB: 'Right streaming...',
      currentPhase: 'answer',
    });

    renderWithTheme(<DebateView topic={createBaseTopic()} messages={[]} />);

    expect(screen.getByText('Left streaming...')).toBeInTheDocument();
    expect(screen.getByText('Right streaming...')).toBeInTheDocument();
  });

  it('shows phase chip above streaming content', () => {
    setupDebateStore({
      debateSending: true,
      streamingContentA: 'Left streaming...',
      currentPhase: 'answer',
    });

    renderWithTheme(<DebateView topic={createBaseTopic()} messages={[]} />);

    expect(screen.getByText('Initial Answer')).toBeInTheDocument();
  });

  it('shows debate phase chip for assistant messages with debatePhase', () => {
    const messages = [
      createMessage({ id: 'user-1', type: 'user', content: 'Question' }),
      createAssistantMsg({ id: 'left-review', debateSide: 'left', debatePhase: 'review' }),
    ];

    renderWithTheme(<DebateView topic={createBaseTopic()} messages={messages} />);

    expect(screen.getByText('Review')).toBeInTheDocument();
  });

  it('renders consensus section when consensus messages exist', () => {
    const messages = [
      createMessage({ id: 'user-1', type: 'user', content: 'Question' }),
      createAssistantMsg({ id: 'consensus-1', debateSide: 'left', debatePhase: 'consensus', content: 'We agree' }),
    ];

    renderWithTheme(<DebateView topic={createBaseTopic()} messages={messages} />);

    const consensusLabels = screen.getAllByText('Consensus');
    expect(consensusLabels.length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByTestId('message-bubble-consensus-1').length).toBeGreaterThanOrEqual(1);
  });

  it('renders consensus section during consensus phase with streaming content', () => {
    setupDebateStore({
      currentPhase: 'consensus',
      streamingConsensus: 'Streaming consensus...',
      debateSending: true,
    });

    renderWithTheme(<DebateView topic={createBaseTopic()} messages={[]} />);

    expect(screen.getByText('Round 4 — Consensus')).toBeInTheDocument();
    expect(screen.getByText('Streaming consensus...')).toBeInTheDocument();
  });

  it('shows typing indicator during consensus phase without streaming content', () => {
    setupDebateStore({
      currentPhase: 'consensus',
      streamingConsensus: '',
      debateSending: true,
    });

    renderWithTheme(<DebateView topic={createBaseTopic()} messages={[]} />);

    const indicators = screen.getAllByTestId('typing-indicator');
    expect(indicators.length).toBeGreaterThanOrEqual(3);
  });

  it('shows Continue button when last round is incomplete', () => {
    const messages = [
      createMessage({ id: 'user-1', type: 'user', content: 'Question' }),
      createAssistantMsg({ id: 'left-answer', debateSide: 'left', debatePhase: 'answer' }),
    ];

    renderWithTheme(<DebateView topic={createBaseTopic()} messages={messages} />);

    expect(screen.getByTestId('composer-continue')).toBeInTheDocument();
  });

  it('does not show Continue button when all rounds complete', () => {
    const messages = [
      createMessage({ id: 'user-1', type: 'user', content: 'Question' }),
      createAssistantMsg({ id: 'left-answer', debateSide: 'left', debatePhase: 'answer' }),
      createAssistantMsg({ id: 'right-answer', debateSide: 'right', debatePhase: 'answer' }),
      createAssistantMsg({ id: 'left-review', debateSide: 'left', debatePhase: 'review' }),
      createAssistantMsg({ id: 'right-review', debateSide: 'right', debatePhase: 'review' }),
      createAssistantMsg({ id: 'left-final', debateSide: 'left', debatePhase: 'final' }),
      createAssistantMsg({ id: 'right-final', debateSide: 'right', debatePhase: 'final' }),
      createAssistantMsg({ id: 'consensus-1', debateSide: 'left', debatePhase: 'consensus' }),
    ];

    renderWithTheme(<DebateView topic={createBaseTopic()} messages={messages} />);

    expect(screen.queryByTestId('composer-continue')).not.toBeInTheDocument();
  });

  it('calls continueDebate when Continue is clicked', () => {
    const continueDebate = jest.fn((): Promise<void> => Promise.resolve());
    setupDebateStore({ continueDebate });
    const messages = [
      createMessage({ id: 'user-1', type: 'user', content: 'Question' }),
      createAssistantMsg({ id: 'left-answer', debateSide: 'left', debatePhase: 'answer' }),
    ];

    renderWithTheme(<DebateView topic={createBaseTopic({ id: 'topic-1' })} messages={messages} />);

    fireEvent.click(screen.getByTestId('composer-continue'));

    expect(continueDebate).toHaveBeenCalledWith('topic-1');
  });

  it('interleaves user messages between rounds correctly', () => {
    const messages = [
      createMessage({ id: 'user-q1', type: 'user', content: 'Q1', created: '2024-01-01T00:00:00Z' }),
      createAssistantMsg({ id: 'left-a1', debateSide: 'left', debatePhase: 'answer', created: '2024-01-01T00:01:00Z' }),
      createMessage({ id: 'user-q2', type: 'user', content: 'Q2', created: '2024-01-01T00:02:00Z' }),
      createAssistantMsg({ id: 'left-a2', debateSide: 'left', debatePhase: 'answer', created: '2024-01-01T00:03:00Z' }),
    ];

    renderWithTheme(<DebateView topic={createBaseTopic()} messages={messages} />);

    expect(screen.getAllByTestId('message-bubble-user-q1')).toHaveLength(2);
    expect(screen.getAllByTestId('message-bubble-user-q2')).toHaveLength(2);
    expect(screen.getByTestId('message-bubble-left-a1')).toBeInTheDocument();
    expect(screen.getByTestId('message-bubble-left-a2')).toBeInTheDocument();
  });

  it('does not show Continue button when sending', () => {
    setupDebateStore({ debateSending: true });
    const messages = [
      createMessage({ id: 'user-1', type: 'user', content: 'Question' }),
      createAssistantMsg({ id: 'left-answer', debateSide: 'left', debatePhase: 'answer' }),
    ];

    renderWithTheme(<DebateView topic={createBaseTopic()} messages={messages} />);

    expect(screen.queryByTestId('composer-continue')).not.toBeInTheDocument();
  });
});
