import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TopicListItem } from './TopicListItem';
import { useNavigate, useParams } from 'react-router-dom';
import { useUiStore } from '../store/UiStore';
import { useAuthStore } from '../store/AuthStore';
import { useTopicStore } from '../store/TopicStore';
import { createTopic, selectorize } from '../testUtils';

const mockNavigate: jest.MockedFunction<(path: string) => void> = jest.fn();
const mockCloseDrawer: jest.MockedFunction<() => void> = jest.fn();
const mockRenameTopic = jest.fn<Promise<void>, [string, string]>(() => Promise.resolve());
const mockDeleteTopic = jest.fn<Promise<void>, [string]>(() => Promise.resolve());

jest.mock('react-router-dom', () => ({
  useNavigate: jest.fn(),
  useParams: jest.fn(),
}));

jest.mock('../store/UiStore', () => ({
  useUiStore: jest.fn(),
}));

jest.mock('../store/AuthStore', () => ({
  useAuthStore: jest.fn(),
}));

jest.mock('../store/TopicStore', () => ({
  useTopicStore: jest.fn(),
}));

jest.mock('./TopicContextDialog', () => ({
  __esModule: true,
  default: (): React.ReactElement => <div data-testid="topic-context-dialog" />,
}));

const mockUseNavigate = useNavigate as unknown as jest.Mock;
const mockUseParams = useParams as unknown as jest.Mock<{ topicId?: string }>;
const mockUseUiStore = useUiStore as unknown as jest.Mock<{
  isMobile: boolean;
  closeDrawer: () => void;
  selectedTopicIds: Set<string>;
  toggleTopicSelection: (id: string) => void;
}>;
const mockUseAuthStore = useAuthStore as unknown as jest.Mock<{ chatFontSize: number }>;
const mockUseTopicStore = useTopicStore as unknown as jest.Mock<{
  renameTopic: (id: string, name: string) => Promise<void>;
  deleteTopic: (id: string) => Promise<void>;
}>;

const testTopic = createTopic({
  name: 'Alpha Topic',
  forks: [
    { id: 'main', name: 'Main', createdOn: '2026-01-01T00:00:00.000Z' },
    { id: 'fork-2', name: 'Fork 2', createdOn: '2026-01-02T00:00:00.000Z' },
  ],
});

describe('TopicListItem', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockUseNavigate.mockReturnValue(mockNavigate);
    mockUseParams.mockReturnValue({ topicId: 'topic-1' });
    selectorize(mockUseUiStore, {
      isMobile: true,
      closeDrawer: mockCloseDrawer,
      selectedTopicIds: new Set<string>(),
      toggleTopicSelection: jest.fn(),
    });
    selectorize(mockUseAuthStore, { chatFontSize: 16 });
    selectorize(mockUseTopicStore, {
      renameTopic: (...args: [string, string]): Promise<void> => mockRenameTopic(...args),
      deleteTopic: (...args: [string]): Promise<void> => mockDeleteTopic(...args),
    });
  });

  it('navigates to topic chat and closes drawer on mobile when topic is clicked', () => {
    render(<TopicListItem topic={testTopic} />);

    fireEvent.click(screen.getByText('Alpha Topic'));

    expect(mockCloseDrawer).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/chat/topic-1');
  });

  it('does not mount a context preview or rerender an unchanged row', async () => {
    const { rerender } = render(<TopicListItem topic={testTopic} />);
    expect(screen.queryByTestId('topic-context-dialog')).not.toBeInTheDocument();
    const renders = mockUseAuthStore.mock.calls.length;
    rerender(<TopicListItem topic={testTopic} />);
    expect(mockUseAuthStore.mock.calls).toHaveLength(renders);

    fireEvent.click(screen.getByRole('button', { name: 'Topic options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit Context' }));
    expect(await screen.findByTestId('topic-context-dialog')).toBeInTheDocument();
  });

  it.each([undefined, 'topic'] as const)('omits the chat icon for mode %s', (mode) => {
    render(<TopicListItem topic={createTopic({ mode })} />);
    expect(screen.queryByRole('img', { name: 'Chat' })).not.toBeInTheDocument();
  });

  it.each([
    { mode: 'debate', label: 'Debate' },
    { mode: 'curator', label: 'Curator' },
    { mode: 'checklist', label: 'Checklist' },
  ] as const)('keeps the $label icon', ({ mode, label }) => {
    render(<TopicListItem topic={createTopic({ mode })} />);
    expect(screen.getByRole('img', { name: label })).toBeInTheDocument();
  });

  it('shows the full topic name in a tooltip when the name is truncated', async () => {
    const clientWidth = jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(100);
    const scrollWidth = jest.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(200);
    render(<TopicListItem topic={testTopic} />);

    fireEvent.mouseOver(screen.getByText('Alpha Topic'));

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Alpha Topic');
    clientWidth.mockRestore();
    scrollWidth.mockRestore();
  });

  it('does not add a tooltip when the full topic name fits', () => {
    const clientWidth = jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(200);
    const scrollWidth = jest.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(100);
    render(<TopicListItem topic={testTopic} />);

    fireEvent.mouseOver(screen.getByText('Alpha Topic'));

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    clientWidth.mockRestore();
    scrollWidth.mockRestore();
  });

  it('renames a topic from the options menu', async () => {
    render(<TopicListItem topic={testTopic} />);

    fireEvent.click(screen.getByLabelText('Topic options'));
    fireEvent.click(screen.getByRole('menuitem', { name: /rename/i }));

    const input = await screen.findByLabelText('Topic name');
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: 'Renamed Topic' } });
    fireEvent.click(screen.getByLabelText('Save topic name'));

    await waitFor(() => {
      expect(mockRenameTopic).toHaveBeenCalledWith('topic-1', 'Renamed Topic');
    });
  });

  it('deletes the topic via confirmation dialog and navigates home when it is active', async () => {
    render(<TopicListItem topic={testTopic} />);

    fireEvent.click(screen.getByLabelText('Topic options'));
    fireEvent.click(screen.getByRole('menuitem', { name: /^Delete$/i }));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(mockDeleteTopic).toHaveBeenCalledWith('topic-1');
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  it('hands focus from the menu to confirmation without hiding a focused ancestor', async () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
    const hiddenFocusedAncestors: HTMLElement[] = [];
    // eslint-disable-next-line @typescript-eslint/unbound-method -- called with an explicit receiver below
    const originalSetAttribute = HTMLElement.prototype.setAttribute;
    const attributeSpy = jest.spyOn(HTMLElement.prototype, 'setAttribute').mockImplementation(function (
      this: HTMLElement,
      name: string,
      value: string,
    ): void {
      if (name === 'aria-hidden' && value === 'true' && this.contains(document.activeElement)) {
        hiddenFocusedAncestors.push(this);
      }
      originalSetAttribute.call(this, name, value);
    });
    const { unmount } = render(<TopicListItem topic={testTopic} />, { container: root });
    try {
      const trigger = screen.getByRole('button', { name: 'Topic options' });
      trigger.focus();
      fireEvent.click(trigger);
      const deleteOption = screen.getByRole('menuitem', { name: /^Delete$/i });
      deleteOption.focus();
      fireEvent.click(deleteOption);
      const dialog = await screen.findByRole('dialog');
      await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
      expect(hiddenFocusedAncestors).toEqual([]);
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(trigger).toHaveFocus());
      expect(hiddenFocusedAncestors).toEqual([]);
    } finally {
      unmount();
      attributeSpy.mockRestore();
      root.remove();
    }
  });

  it('restores focus to the topic options button when dismissing the menu', async () => {
    render(<TopicListItem topic={testTopic} />);
    const trigger = screen.getByRole('button', { name: 'Topic options' });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
