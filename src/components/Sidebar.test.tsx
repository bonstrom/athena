import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Sidebar } from './Sidebar';
import { useNavigate } from 'react-router-dom';
import { useUiStore } from '../store/UiStore';
import { useTopicStore } from '../store/TopicStore';
import { useLogout } from '../store/AuthStore';

jest.mock('./TopicList', () => ({
  TopicList: (): JSX.Element => <div data-testid="topic-list" />,
}));

jest.mock('./BuildVersion', () => ({
  BuildVersion: (): JSX.Element => <div data-testid="build-version" />,
}));

jest.mock('./SiderbarHeader', () => ({
  SidebarHeader: (): JSX.Element => <div data-testid="sidebar-header" />,
}));

jest.mock('./GlobalSearch', () => ({
  GlobalSearch: (): JSX.Element => <div data-testid="global-search" />,
}));

jest.mock('react-router-dom', () => ({
  useNavigate: jest.fn(),
}));

jest.mock('../store/UiStore', () => ({
  useUiStore: jest.fn(),
}));

jest.mock('../store/TopicStore', () => ({
  useTopicStore: jest.fn(),
}));

jest.mock('../store/AuthStore', () => ({
  useLogout: jest.fn(),
}));

const mockUseNavigate = useNavigate as unknown as jest.Mock<(path: string) => void>;
const mockUseUiStore = useUiStore as unknown as jest.Mock<{ isMobile: boolean; closeDrawer: () => void }>;
const mockUseTopicStore = useTopicStore as unknown as jest.Mock<{ createTopic: () => Promise<{ id: string } | null> }>;
const mockUseLogout = useLogout as unknown as jest.Mock<() => void>;

describe('Sidebar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a topic and navigates to chat', async () => {
    const navigate = jest.fn<void, [string]>();
    const closeDrawer = jest.fn<void, []>();

    mockUseNavigate.mockReturnValue(navigate);
    mockUseUiStore.mockReturnValue({ isMobile: true, closeDrawer });
    mockUseTopicStore.mockReturnValue({ createTopic: (): Promise<{ id: string }> => Promise.resolve({ id: 'topic-99' }) });
    mockUseLogout.mockReturnValue(jest.fn());

    render(<Sidebar />);

    fireEvent.click(screen.getByRole('button', { name: 'New Topic' }));

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/chat/topic-99');
      expect(closeDrawer).toHaveBeenCalledTimes(1);
    });
  });

  it('opens logout confirmation and executes logout', () => {
    const logout = jest.fn<void, []>();
    mockUseNavigate.mockReturnValue(jest.fn());
    mockUseUiStore.mockReturnValue({ isMobile: false, closeDrawer: jest.fn() });
    mockUseTopicStore.mockReturnValue({ createTopic: (): Promise<null> => Promise.resolve(null) });
    mockUseLogout.mockReturnValue(logout);

    render(<Sidebar />);

    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));

    expect(logout).toHaveBeenCalledTimes(1);
  });
});
