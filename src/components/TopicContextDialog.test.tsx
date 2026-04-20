import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TopicContextDialog from './TopicContextDialog';
import { useChatStore } from '../store/ChatStore';
import { useNotificationStore } from '../store/NotificationStore';
import { useAuthStore } from '../store/AuthStore';
import { estimateTokens } from '../services/estimateTokens';

jest.mock('../services/estimateTokens', () => ({
  estimateTokens: jest.fn(() => ({ promptTokens: 42, completionTokens: 0, totalTokens: 42 })),
}));

interface ChatStoreSlice {
  buildFullContext: (
    topicId: string,
    userMessagePreview?: string,
  ) => Promise<
    {
      message: { role: 'system' | 'user' | 'assistant'; content: string };
      sourceLabel: string;
      messageId?: string;
      messageType?: string;
      isConversationMessage?: boolean;
      isRagRetrieved?: boolean;
    }[]
  >;
  updateMessageContext: (messageId: string, includeInContext: boolean) => Promise<void>;
  selectedModel: { contextWindow: number; supportsTools: boolean };
}

jest.mock('../store/ChatStore', () => ({
  useChatStore: jest.fn(),
}));

jest.mock('../store/NotificationStore', () => ({
  useNotificationStore: jest.fn(),
}));

jest.mock('../store/AuthStore', () => ({
  useAuthStore: jest.fn(),
}));

const mockUseChatStore = useChatStore as unknown as jest.Mock<ChatStoreSlice>;
const mockUseNotificationStore = useNotificationStore as unknown as jest.Mock<{
  addNotification: (title: string, message: string) => void;
}>;
const mockUseAuthStore = useAuthStore as unknown as jest.Mock<{
  maxContextTokens: number;
  messageRetrievalEnabled: boolean;
  askUserEnabled: boolean;
}>;
const mockEstimateTokens = estimateTokens as jest.MockedFunction<typeof estimateTokens>;

describe('TopicContextDialog', () => {
  let writeTextMock: jest.MockedFunction<(text: string) => Promise<void>>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockEstimateTokens.mockReturnValue({ promptTokens: 42, completionTokens: 0, totalTokens: 42 });

    writeTextMock = jest.fn((_: string): Promise<void> => Promise.resolve());

    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: writeTextMock,
      },
      writable: true,
    });

    mockUseNotificationStore.mockReturnValue({ addNotification: jest.fn() });
    mockUseAuthStore.mockReturnValue({
      maxContextTokens: 16000,
      messageRetrievalEnabled: false,
      askUserEnabled: false,
    });
    mockUseChatStore.mockReturnValue({
      buildFullContext: (): Promise<
        {
          message: { role: 'system' | 'user' | 'assistant'; content: string };
          sourceLabel: string;
          isConversationMessage?: boolean;
        }[]
      > =>
        Promise.resolve([
          {
            message: { role: 'user', content: 'Hello context' },
            sourceLabel: 'Conversation: user',
            isConversationMessage: true,
          },
        ]),
      updateMessageContext: (): Promise<void> => Promise.resolve(),
      selectedModel: { contextWindow: 128000, supportsTools: false },
    });
  });

  it('loads context entries, supports copy, and closes dialog', async () => {
    const onClose = jest.fn((): void => undefined);

    render(<TopicContextDialog open topicId="topic-1" onClose={onClose} />);

    expect(await screen.findByText('Hello context')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Copy as JSON' }));

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
