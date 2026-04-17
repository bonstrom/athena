import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { ChatModel } from './ModelSelector';
import MessageBubbleTyping from './MessageBubbleTyping';
import theme from '../theme';

jest.mock('./TypingIndicator', () => ({
  __esModule: true,
  default: (): JSX.Element => <div data-testid="typing-indicator" />,
}));

function createModel(): ChatModel {
  return {
    id: 'builtin-gpt-5-4-nano',
    label: 'GPT-5.4 Nano',
    apiModelId: 'gpt-5.4-nano',
    providerId: 'builtin-openai',
    input: 0.2,
    cachedInput: 0.02,
    output: 1.25,
    streaming: true,
    supportsTemperature: false,
    supportsTools: true,
    supportsVision: true,
    supportsFiles: true,
    contextWindow: 128000,
    forceTemperature: null,
    enforceAlternatingRoles: false,
    maxTokensOverride: null,
    isBuiltIn: true,
    enabled: true,
  };
}

describe('MessageBubbleTyping', () => {
  it('shows the model label and typing indicator', () => {
    render(
      <ThemeProvider theme={theme}>
        <MessageBubbleTyping model={createModel()} />
      </ThemeProvider>,
    );

    expect(screen.getByText('GPT-5.4 Nano')).toBeInTheDocument();
    expect(screen.getByTestId('typing-indicator')).toBeInTheDocument();
  });
});
