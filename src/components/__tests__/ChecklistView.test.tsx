import { renderWithTheme, selectorize } from '../../testUtils';
import { screen, fireEvent } from '@testing-library/react';
import { JSX } from 'react';
import { useMediaQuery } from '@mui/material';
import { ChecklistGroup, ChecklistItem, Topic } from '../../database/AthenaDb';

const mockUpdateItem = jest.fn();
const mockLoadChecklist = jest.fn();
const mockGenerateChecklist = jest.fn();
const mockAddItem = jest.fn();
const mockDeleteItem = jest.fn();
const mockDeleteGroup = jest.fn();
const mockReorderItem = jest.fn();
const mockReorderGroup = jest.fn();

interface ChecklistViewStoreSlice {
  groups: ChecklistGroup[];
  items: ChecklistItem[];
  loading: boolean;
  generating: boolean;
  editing: boolean;
  streamingContent: string;
  lastEditSummary: string;
  loadChecklist: (topicId: string) => Promise<void>;
  createGroup: (topicId: string, title: string) => Promise<ChecklistGroup | null>;
  renameGroup: (groupId: string, title: string) => Promise<void>;
  deleteGroup: (groupId: string) => Promise<void>;
  reorderGroup: (fromIndex: number, toIndex: number) => Promise<void>;
  addItem: (
    groupId: string,
    content: string,
    details?: string,
    createdBy?: 'user' | 'assistant',
  ) => Promise<ChecklistItem | null>;
  updateItem: (itemId: string, patch: Partial<Pick<ChecklistItem, 'content' | 'details' | 'checked'>>) => Promise<void>;
  deleteItem: (itemId: string) => Promise<void>;
  reorderItem: (groupId: string, fromIndex: number, toIndex: number) => Promise<void>;
  generateChecklist: (topicId: string, prompt: string) => Promise<void>;
  applyLlmEdit: (topicId: string, instruction: string) => Promise<void>;
  stopEdit: () => void;
}

const createStoreState = (overrides?: Partial<ChecklistViewStoreSlice>): ChecklistViewStoreSlice => ({
  groups: [],
  items: [],
  loading: false,
  generating: false,
  editing: false,
  streamingContent: '',
  lastEditSummary: '',
  loadChecklist: mockLoadChecklist,
  createGroup: jest.fn(),
  renameGroup: jest.fn(),
  deleteGroup: mockDeleteGroup,
  reorderGroup: mockReorderGroup,
  addItem: mockAddItem,
  updateItem: mockUpdateItem,
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
    mockLoadChecklist.mockReset();
    mockGenerateChecklist.mockReset();
    mockAddItem.mockReset();
    mockDeleteItem.mockReset();
    mockDeleteGroup.mockReset();
    mockReorderItem.mockReset();
    mockReorderGroup.mockReset();
    mockLoadChecklist.mockResolvedValue(undefined);
    mockUpdateItem.mockResolvedValue(undefined);
    mockDeleteGroup.mockResolvedValue(undefined);
    mockReorderItem.mockResolvedValue(undefined);
    mockReorderGroup.mockResolvedValue(undefined);
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

  it('toggles an item when its checkbox is clicked', () => {
    mockUseChecklistStore.mockReturnValue(
      createStoreState({
        groups: [{ id: 'g1', topicId: 't1', title: 'Important', sortOrder: 0 }],
        items: [{ id: 'i1', groupId: 'g1', content: 'Task 1', checked: false, sortOrder: 0 }],
      }),
    );
    renderWithTheme(<ChecklistView topic={topic} />);
    fireEvent.click(screen.getByLabelText('Toggle task Task 1'));
    expect(mockUpdateItem).toHaveBeenCalledWith('i1', { checked: true });
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
