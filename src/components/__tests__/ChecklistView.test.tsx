import { renderWithTheme, selectorize } from '../../testUtils';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { JSX } from 'react';
import { useMediaQuery } from '@mui/material';
import { ChecklistGroup, ChecklistItem, ChecklistTab, Topic } from '../../database/AthenaDb';

const mockUpdateItem = jest.fn();
const mockToggleItem = jest.fn();
const mockLoadChecklist = jest.fn();
const mockGenerateChecklist = jest.fn();
const mockAddItem = jest.fn();
const mockDeleteItem = jest.fn();
const mockDeleteGroup = jest.fn();
const mockReorderItem = jest.fn();
const mockReorderGroup = jest.fn();
const mockCreateTab = jest.fn();
const mockRenameTab = jest.fn();
const mockDeleteTab = jest.fn();
const mockSwitchTab = jest.fn();

interface ChecklistViewStoreSlice {
  tabs: ChecklistTab[];
  activeTabId: string | null;
  groups: ChecklistGroup[];
  items: ChecklistItem[];
  loading: boolean;
  loadError: string | null;
  generating: boolean;
  editing: boolean;
  streamingContent: string;
  lastEditSummary: string;
  toolLog: string;
  lastToolLog: string;
  loadChecklist: (topicId: string) => Promise<void>;
  createTab: (topicId: string, name: string) => Promise<ChecklistTab | null>;
  renameTab: (tabId: string, name: string) => Promise<boolean>;
  deleteTab: (tabId: string) => Promise<boolean>;
  switchTab: (tabId: string) => Promise<void>;
  createGroup: (topicId: string, title: string) => Promise<ChecklistGroup | null>;
  renameGroup: (groupId: string, title: string) => Promise<void>;
  deleteGroup: (groupId: string) => Promise<void>;
  reorderGroup: (fromIndex: number, toIndex: number) => Promise<void>;
  addItem: (groupId: string, content: string, details?: string, createdBy?: 'user' | 'assistant') => Promise<ChecklistItem | null>;
  updateItem: (itemId: string, patch: Partial<Pick<ChecklistItem, 'content' | 'details' | 'checked'>>) => Promise<void>;
  toggleItem: (itemId: string) => Promise<boolean>;
  deleteItem: (itemId: string) => Promise<void>;
  reorderItem: (groupId: string, fromIndex: number, toIndex: number) => Promise<void>;
  generateChecklist: (topicId: string, prompt: string) => Promise<void>;
  applyLlmEdit: (topicId: string, instruction: string) => Promise<void>;
  stopEdit: () => void;
}

const createStoreState = (overrides?: Partial<ChecklistViewStoreSlice>): ChecklistViewStoreSlice => ({
  tabs: [{ id: 'tab-main', topicId: 't1', name: 'Main', sortOrder: 0 }],
  activeTabId: 'tab-main',
  groups: [],
  items: [],
  loading: false,
  loadError: null,
  generating: false,
  editing: false,
  streamingContent: '',
  lastEditSummary: '',
  toolLog: '',
  lastToolLog: '',
  loadChecklist: mockLoadChecklist,
  createTab: mockCreateTab,
  renameTab: mockRenameTab,
  deleteTab: mockDeleteTab,
  switchTab: mockSwitchTab,
  createGroup: jest.fn(),
  renameGroup: jest.fn(),
  deleteGroup: mockDeleteGroup,
  reorderGroup: mockReorderGroup,
  addItem: mockAddItem,
  updateItem: mockUpdateItem,
  toggleItem: mockToggleItem,
  deleteItem: mockDeleteItem,
  reorderItem: mockReorderItem,
  generateChecklist: mockGenerateChecklist,
  applyLlmEdit: jest.fn(),
  stopEdit: jest.fn(),
  ...overrides,
});

jest.mock('../../store/ChecklistStore', () => ({
  useChecklistStore: jest.fn(),
}));

jest.mock('../../store/ChatStore', () => ({
  useChatStore: jest.fn(),
}));

jest.mock('@mui/material', () => {
  const actual = jest.requireActual<typeof import('@mui/material')>('@mui/material');
  return {
    ...actual,
    useMediaQuery: jest.fn(),
  };
});

jest.mock('../ChecklistComposer', () => ({
  __esModule: true,
  default: (): JSX.Element => <div data-testid="checklist-composer" />,
}));

jest.mock('../MarkdownWithCode', () => ({
  __esModule: true,
  default: ({ children }: { children: string }): React.ReactElement => <div>{children}</div>,
}));

import { useChecklistStore } from '../../store/ChecklistStore';
import { useChatStore } from '../../store/ChatStore';
import ChecklistView from '../ChecklistView';

const mockUseChecklistStore = useChecklistStore as unknown as jest.Mock<ChecklistViewStoreSlice>;
const mockUseChatStore = useChatStore as unknown as jest.Mock<{ selectedModel: { supportsTools: boolean } }>;
const mockUseMediaQuery = useMediaQuery as unknown as jest.Mock<boolean>;

const topic: Topic = {
  id: 't1',
  name: 'My Checklist',
  createdOn: '2026-01-01T00:00:00.000Z',
  updatedOn: '2026-01-01T00:00:00.000Z',
  isDeleted: false,
  mode: 'checklist',
};

describe('ChecklistView', () => {
  beforeEach(() => {
    mockUpdateItem.mockReset();
    mockToggleItem.mockReset();
    mockLoadChecklist.mockReset();
    mockGenerateChecklist.mockReset();
    mockAddItem.mockReset();
    mockDeleteItem.mockReset();
    mockDeleteGroup.mockReset();
    mockReorderItem.mockReset();
    mockReorderGroup.mockReset();
    mockCreateTab.mockReset();
    mockRenameTab.mockReset();
    mockDeleteTab.mockReset();
    mockSwitchTab.mockReset();
    mockLoadChecklist.mockResolvedValue(undefined);
    mockUpdateItem.mockResolvedValue(undefined);
    mockToggleItem.mockResolvedValue(true);
    mockDeleteGroup.mockResolvedValue(undefined);
    mockReorderItem.mockResolvedValue(undefined);
    mockReorderGroup.mockResolvedValue(undefined);
    mockCreateTab.mockResolvedValue({ id: 'tab-new', topicId: 't1', name: 'Ideas', sortOrder: 1 });
    mockRenameTab.mockResolvedValue(true);
    mockDeleteTab.mockResolvedValue(true);
    mockSwitchTab.mockResolvedValue(undefined);
    mockUseMediaQuery.mockReturnValue(false);
    selectorize(mockUseChatStore, { selectedModel: { supportsTools: true } });
    mockUseChecklistStore.mockReturnValue(createStoreState());
  });

  it('shows the empty state when there are no groups', () => {
    renderWithTheme(<ChecklistView topic={topic} />);
    expect(screen.getByText('Create a checklist')).toBeInTheDocument();
    expect(screen.getByLabelText('Checklist prompt')).toBeInTheDocument();
    expect(screen.getByTestId('checklist-composer')).toBeInTheDocument();
  });

  it('shows a loading spinner while loading', () => {
    mockUseChecklistStore.mockReturnValue(createStoreState({ loading: true }));
    renderWithTheme(<ChecklistView topic={topic} />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('renders groups and items', () => {
    mockUseChecklistStore.mockReturnValue(
      createStoreState({
        groups: [{ id: 'g1', topicId: 't1', title: 'Important', sortOrder: 0 }],
        items: [{ id: 'i1', groupId: 'g1', content: 'Task 1', checked: false, sortOrder: 0 }],
      }),
    );
    renderWithTheme(<ChecklistView topic={topic} />);
    expect(screen.getByText('Important')).toBeInTheDocument();
    expect(screen.getByText('Task 1')).toBeInTheDocument();
    expect(screen.getByText('Create new list')).toBeInTheDocument();
  });

  it('switches checklist tabs', () => {
    mockUseChecklistStore.mockReturnValue(
      createStoreState({
        tabs: [
          { id: 'tab-main', topicId: 't1', name: 'Main', sortOrder: 0 },
          { id: 'tab-ideas', topicId: 't1', name: 'Ideas', sortOrder: 1 },
        ],
      }),
    );
    renderWithTheme(<ChecklistView topic={topic} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Ideas' }));

    expect(mockSwitchTab).toHaveBeenCalledWith('tab-ideas');
  });

  it('creates checklist tabs', async () => {
    renderWithTheme(<ChecklistView topic={topic} />);

    fireEvent.click(screen.getByRole('button', { name: 'Create tab' }));
    fireEvent.change(screen.getByLabelText('Tab name'), { target: { value: 'Ideas' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(mockCreateTab).toHaveBeenCalledWith('t1', 'Ideas'));
  });

  it('renames the active checklist tab', async () => {
    renderWithTheme(<ChecklistView topic={topic} />);

    fireEvent.click(screen.getByRole('button', { name: 'Rename active tab' }));
    fireEvent.change(screen.getByLabelText('Tab name'), { target: { value: 'Overview' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockRenameTab).toHaveBeenCalledWith('tab-main', 'Overview'));
  });

  it('confirms tab deletion and protects the final tab', async () => {
    const tabs: ChecklistTab[] = [
      { id: 'tab-main', topicId: 't1', name: 'Main', sortOrder: 0 },
      { id: 'tab-ideas', topicId: 't1', name: 'Ideas', sortOrder: 1 },
    ];
    const { rerender } = renderWithTheme(<ChecklistView topic={topic} />);
    expect(screen.getByRole('button', { name: 'Delete active tab' })).toBeDisabled();

    mockUseChecklistStore.mockReturnValue(createStoreState({ tabs }));
    rerender(<ChecklistView topic={topic} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete active tab' }));
    expect(screen.getByText(/Delete "Main" and all of its lists/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(mockDeleteTab).toHaveBeenCalledWith('tab-main'));
  });

  it('toggles an item when its checkbox is clicked', () => {
    mockUseChecklistStore.mockReturnValue(
      createStoreState({
        groups: [{ id: 'g1', topicId: 't1', title: 'Important', sortOrder: 0 }],
        items: [{ id: 'i1', groupId: 'g1', content: 'Task 1', checked: false, sortOrder: 0 }],
      }),
    );
    renderWithTheme(<ChecklistView topic={topic} />);
    fireEvent.click(screen.getByLabelText('Toggle task Task 1'));
    expect(mockToggleItem).toHaveBeenCalledWith('i1');
  });

  it('exposes task details disclosure state to assistive technology', () => {
    mockUseChecklistStore.mockReturnValue(
      createStoreState({
        groups: [{ id: 'g1', topicId: 't1', title: 'Important', sortOrder: 0 }],
        items: [{ id: 'i1', groupId: 'g1', content: 'Task 1', details: 'Helpful details', checked: false, sortOrder: 0 }],
      }),
    );
    renderWithTheme(<ChecklistView topic={topic} />);

    const detailsButton = screen.getByRole('button', { name: 'Details' });
    expect(detailsButton).toHaveAttribute('aria-expanded', 'false');
    expect(detailsButton).toHaveAttribute('aria-controls', 'checklist-item-details-i1');

    fireEvent.click(detailsButton);

    expect(screen.getByRole('button', { name: 'Hide details' })).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById('checklist-item-details-i1')).not.toBeNull();
  });

  it('confirms before deleting a list', () => {
    mockUseChecklistStore.mockReturnValue(
      createStoreState({
        groups: [{ id: 'g1', topicId: 't1', title: 'Important', sortOrder: 0 }],
        items: [{ id: 'i1', groupId: 'g1', content: 'Task 1', checked: false, sortOrder: 0 }],
      }),
    );
    renderWithTheme(<ChecklistView topic={topic} />);

    fireEvent.click(screen.getByLabelText('Delete list Important'));

    expect(screen.getByText('Delete list')).toBeInTheDocument();
    expect(mockDeleteGroup).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(mockDeleteGroup).toHaveBeenCalledWith('g1');
  });

  it('shows up/down arrows instead of drag handles on mobile', () => {
    mockUseMediaQuery.mockReturnValue(true);
    mockUseChecklistStore.mockReturnValue(
      createStoreState({
        groups: [{ id: 'g1', topicId: 't1', title: 'Important', sortOrder: 0 }],
        items: [
          { id: 'i1', groupId: 'g1', content: 'Task 1', checked: false, sortOrder: 0 },
          { id: 'i2', groupId: 'g1', content: 'Task 2', checked: false, sortOrder: 1 },
        ],
      }),
    );
    renderWithTheme(<ChecklistView topic={topic} />);

    expect(screen.queryByLabelText('Reorder task Task 1')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Move task Task 1 down')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Move task Task 1 down'));

    expect(mockReorderItem).toHaveBeenCalledWith('g1', 0, 1);
  });
});
