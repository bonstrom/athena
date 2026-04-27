import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import DebateComposer from './DebateComposer';
import { useAuthStore } from '../store/AuthStore';

jest.mock('../store/AuthStore', () => ({
  useAuthStore: jest.fn(),
}));

const mockUseAuthStore = useAuthStore as jest.MockedFunction<typeof useAuthStore>;

interface AuthSlice {
  chatWidth: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  setChatWidth: (v: 'sm' | 'md' | 'lg' | 'xl' | 'full') => void;
}

function mockAuth(): void {
  mockUseAuthStore.mockReturnValue({
    chatWidth: 'md',
    setChatWidth: jest.fn(),
  } as unknown as ReturnType<typeof useAuthStore>);
}

const defaultProps = {
  sending: false,
  canContinue: false,
  onSend: jest.fn<void, [string]>(),
  onStop: jest.fn<void, []>(),
  onContinue: jest.fn<void, []>(),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth();
});

describe('DebateComposer – rendering', () => {
  it('renders the question text field', () => {
    render(<DebateComposer {...defaultProps} />);

    expect(screen.getByRole('textbox', { name: 'Debate question' })).toBeInTheDocument();
  });

  it('send button is disabled when input is empty', () => {
    render(<DebateComposer {...defaultProps} />);

    expect(screen.getByRole('button', { name: 'Send debate question' })).toBeDisabled();
  });

  it('send button is enabled when input has text', () => {
    render(<DebateComposer {...defaultProps} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Debate question' }), { target: { value: 'hello' } });

    expect(screen.getByRole('button', { name: 'Send debate question' })).not.toBeDisabled();
  });

  it('does not show the stop button when not sending', () => {
    render(<DebateComposer {...defaultProps} />);

    expect(screen.queryByRole('button', { name: 'Stop debate' })).not.toBeInTheDocument();
  });

  it('shows stop button instead of send when sending', () => {
    render(<DebateComposer {...defaultProps} sending={true} />);

    expect(screen.getByRole('button', { name: 'Stop debate' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send debate question' })).not.toBeInTheDocument();
  });

  it('disables text field when sending', () => {
    render(<DebateComposer {...defaultProps} sending={true} />);

    expect(screen.getByRole('textbox', { name: 'Debate question' })).toBeDisabled();
  });
});

describe('DebateComposer – continue button', () => {
  it('shows continue button when canContinue is true', () => {
    render(<DebateComposer {...defaultProps} canContinue={true} />);

    expect(screen.getByRole('button', { name: 'Continue debate' })).toBeInTheDocument();
  });

  it('does not show continue button when canContinue is false', () => {
    render(<DebateComposer {...defaultProps} canContinue={false} />);

    expect(screen.queryByRole('button', { name: 'Continue debate' })).not.toBeInTheDocument();
  });

  it('calls onContinue when continue button is clicked', () => {
    const onContinue = jest.fn<void, []>();
    render(<DebateComposer {...defaultProps} canContinue={true} onContinue={onContinue} />);

    fireEvent.click(screen.getByRole('button', { name: 'Continue debate' }));

    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('does not show continue button while sending (stop button takes over)', () => {
    render(<DebateComposer {...defaultProps} canContinue={true} sending={true} />);

    expect(screen.queryByRole('button', { name: 'Continue debate' })).not.toBeInTheDocument();
  });
});

describe('DebateComposer – send interactions', () => {
  it('calls onSend with trimmed text and clears input', () => {
    const onSend = jest.fn<void, [string]>();
    render(<DebateComposer {...defaultProps} onSend={onSend} />);

    const input = screen.getByRole('textbox', { name: 'Debate question' });
    fireEvent.change(input, { target: { value: '  What is AI?  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send debate question' }));

    expect(onSend).toHaveBeenCalledWith('What is AI?');
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('calls onSend when Enter is pressed (without Shift)', () => {
    const onSend = jest.fn<void, [string]>();
    render(<DebateComposer {...defaultProps} onSend={onSend} />);

    const input = screen.getByRole('textbox', { name: 'Debate question' });
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });

    expect(onSend).toHaveBeenCalledWith('hello');
  });

  it('does not call onSend when Shift+Enter is pressed', () => {
    const onSend = jest.fn<void, [string]>();
    render(<DebateComposer {...defaultProps} onSend={onSend} />);

    const input = screen.getByRole('textbox', { name: 'Debate question' });
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('does not call onSend for whitespace-only input', () => {
    const onSend = jest.fn<void, [string]>();
    render(<DebateComposer {...defaultProps} onSend={onSend} />);

    const input = screen.getByRole('textbox', { name: 'Debate question' });
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('calls onStop when stop button is clicked', () => {
    const onStop = jest.fn<void, []>();
    render(<DebateComposer {...defaultProps} sending={true} onStop={onStop} />);

    fireEvent.click(screen.getByRole('button', { name: 'Stop debate' }));

    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('does not call onSend when sending is true', () => {
    const onSend = jest.fn<void, [string]>();
    render(<DebateComposer {...defaultProps} sending={true} onSend={onSend} />);

    // Field is disabled, but force the Enter key anyway
    const input = screen.getByRole('textbox', { name: 'Debate question' });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });

    expect(onSend).not.toHaveBeenCalled();
  });
});

describe('DebateComposer – width selector', () => {
  it('renders width toggle buttons', () => {
    render(<DebateComposer {...defaultProps} />);

    expect(screen.getByRole('button', { name: 'S' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'M' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'L' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'XL' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Full' })).toBeInTheDocument();
  });

  it('calls setChatWidth when a toggle is clicked', () => {
    const setChatWidth = jest.fn<void, ['sm' | 'md' | 'lg' | 'xl' | 'full']>();
    mockUseAuthStore.mockReturnValue({
      chatWidth: 'md',
      setChatWidth,
    } as unknown as ReturnType<typeof useAuthStore>);

    render(<DebateComposer {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'L' }));

    expect(setChatWidth).toHaveBeenCalledWith('lg');
  });
});
