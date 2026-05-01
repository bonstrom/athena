import React from 'react';
import { screen } from '@testing-library/react';
import MessageBubbleTyping from './MessageBubbleTyping';
import { createUserChatModel, renderWithTheme } from '../testUtils';

jest.mock('./TypingIndicator', () => ({
  __esModule: true,
  default: (): React.ReactElement => <div data-testid="typing-indicator" />,
}));

describe('MessageBubbleTyping', () => {
  it('shows the model label and typing indicator', () => {
    renderWithTheme(<MessageBubbleTyping model={createUserChatModel({ label: 'GPT-5.4 Nano' })} />);

    expect(screen.getByText('GPT-5.4 Nano')).toBeInTheDocument();
    expect(screen.getByTestId('typing-indicator')).toBeInTheDocument();
  });
});
