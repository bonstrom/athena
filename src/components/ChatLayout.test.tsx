import { fireEvent, render, screen } from '@testing-library/react';
import ChatLayout from './ChatLayout';
import { useUiStore } from '../store/UiStore';
import { useChatStore } from '../store/ChatStore';
import { useTopicStore } from '../store/TopicStore';
import { useAuthStore } from '../store/AuthStore';
import { useMediaQuery } from '@mui/material';

jest.mock('./Sidebar', () => ({
  Sidebar: (): JSX.Element => <div data-testid="sidebar" />,
}));

jest.mock('react-router-dom', () => ({
  Outlet: (): JSX.Element => <div data-testid="outlet" />,
}));

jest.mock('../store/UiStore', () => ({
  useUiStore: jest.fn(),
}));

jest.mock('../store/ChatStore', () => ({
  useChatStore: jest.fn(),
}));

jest.mock('../store/TopicStore', () => ({
  useTopicStore: jest.fn(),
}));

jest.mock('../store/AuthStore', () => ({
  useAuthStore: jest.fn(),
}));

jest.mock('@mui/material', () => {
  const actual = jest.requireActual('@mui/material') as Record<string, unknown>;
  return {
    ...actual,
    useMediaQuery: jest.fn(),
  };
});

const mockUseUiStore = useUiStore as unknown as jest.Mock<{
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  setMobile: (isMobile: boolean) => void;
}>;
const mockUseChatStore = useChatStore as unknown as jest.Mock<{
  currentTopicId: string | null;
  selectedModel: { label: string };
}>;
const mockUseTopicStore = useTopicStore as unknown as jest.Mock<{
  topics: { id: string; name: string; selectedPromptIds?: string[] }[];
  updateTopicPromptSelection: (id: string, ids: string[]) => Promise<void>;
}>;
const mockUseAuthStore = useAuthStore as unknown as jest.Mock<{
  predefinedPrompts: { id: string; name: string }[];
}>;
const mockUseMediaQuery = useMediaQuery as unknown as jest.Mock<boolean>;

describe('ChatLayout', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockUseUiStore.mockReturnValue({
      drawerOpen: false,
      openDrawer: jest.fn(),
      closeDrawer: jest.fn(),
      setMobile: jest.fn(),
    });
    mockUseChatStore.mockReturnValue({
      currentTopicId: 'topic-1',
      selectedModel: { label: 'GPT-5.4 Nano' },
    });
    mockUseTopicStore.mockReturnValue({
      topics: [{ id: 'topic-1', name: 'Topic A', selectedPromptIds: [] }],
      updateTopicPromptSelection: jest.fn((): Promise<void> => Promise.resolve()),
    });
    mockUseAuthStore.mockReturnValue({ predefinedPrompts: [] });
  });

  it('mobile mode shows open-menu button and triggers openDrawer', () => {
    const openDrawer = jest.fn<void, []>();
    const setMobile = jest.fn<void, [boolean]>();
    mockUseUiStore.mockReturnValue({
      drawerOpen: false,
      openDrawer,
      closeDrawer: jest.fn(),
      setMobile,
    });
    mockUseMediaQuery.mockReturnValue(true);

    render(<ChatLayout />);

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));

    expect(openDrawer).toHaveBeenCalledTimes(1);
    expect(setMobile).toHaveBeenCalledWith(true);
    expect(screen.getByText('Topic A')).toBeInTheDocument();
    expect(screen.getByText('GPT-5.4 Nano')).toBeInTheDocument();
  });

  it('desktop mode renders outlet and sidebar without mobile menu button', () => {
    mockUseMediaQuery.mockReturnValue(false);

    render(<ChatLayout />);

    expect(screen.queryByRole('button', { name: 'Open menu' })).toBeNull();
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('outlet')).toBeInTheDocument();
  });
});
