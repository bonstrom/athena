import { fireEvent, render, screen } from '@testing-library/react';
import { SidebarHeader } from './SiderbarHeader';
import { useUiStore } from '../store/UiStore';
import { useChatStore } from '../store/ChatStore';

jest.mock('./ModelSelector', () => ({
  __esModule: true,
  default: (): React.ReactElement => <div data-testid="model-selector" />,
}));

jest.mock('../store/UiStore', () => ({
  useUiStore: jest.fn(),
}));

jest.mock('../store/ChatStore', () => ({
  useChatStore: jest.fn(),
}));

const mockUseUiStore = useUiStore as unknown as jest.Mock<{ isMobile: boolean; closeDrawer: () => void }>;
const mockUseChatStore = useChatStore as unknown as jest.Mock<{
  selectedModel: { id: string; label: string };
  setSelectedModel: (m: unknown) => void;
}>;

describe('SidebarHeader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseChatStore.mockReturnValue({
      selectedModel: { id: 'm1', label: 'Model 1' },
      setSelectedModel: jest.fn(),
    });
  });

  it('shows close button on mobile and closes drawer when clicked', () => {
    const closeDrawer = jest.fn<void, []>();
    mockUseUiStore.mockReturnValue({ isMobile: true, closeDrawer });

    render(<SidebarHeader />);

    fireEvent.click(screen.getByRole('button', { name: 'Close sidebar' }));

    expect(closeDrawer).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('model-selector')).toBeInTheDocument();
  });
});
