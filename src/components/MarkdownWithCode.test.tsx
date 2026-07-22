import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

const mockMermaidRender = jest.fn<Promise<{ svg: string }>, [string, string]>().mockResolvedValue({ svg: '<svg></svg>' });
const mockMermaidInitialize = jest.fn();

jest.mock('mermaid', () => {
  const mermaidModule = {
    initialize: mockMermaidInitialize,
    render: mockMermaidRender,
  };
  return {
    __esModule: true,
    default: mermaidModule,
  };
});

jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({
    children = '',
    components,
  }: {
    children?: string;
    components?: {
      code?: (props: { inline?: boolean; className?: string; children?: unknown }) => React.ReactElement;
    };
  }): React.ReactElement => {
    const codeRenderer = components?.code;
    const segments = children.split(/(```[\s\S]*?```)/g).filter((segment) => segment.length > 0);

    return (
      <div data-testid="markdown-root">
        {segments.map((segment, index) => {
          const match = /^```(\w+)?\n([\s\S]*?)```$/s.exec(segment);
          if (!match || !codeRenderer) {
            return <span key={`text-${String(index)}`}>{segment}</span>;
          }

          const language = match[1] || 'text';
          return <span key={`code-${String(index)}`}>{codeRenderer({ inline: false, className: `language-${language}`, children: match[2] })}</span>;
        })}
      </div>
    );
  },
}));

jest.mock('remark-gfm', () => jest.fn());

jest.mock('../store/AuthStore', () => ({
  useAuthStore: jest.fn((selector?: (state: { themeMode: string }) => string) => {
    const state = { themeMode: 'dark' as const };
    return selector ? selector(state) : state;
  }),
}));

const { default: MarkdownWithCode } = jest.requireActual<typeof import('./MarkdownWithCode')>('./MarkdownWithCode');

describe('MarkdownWithCode', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn(() => Promise.resolve()),
      },
    });
    jest.requireMock<{ useAuthStore: jest.Mock }>('../store/AuthStore').useAuthStore.mockImplementation(
      (selector?: (state: { themeMode: string }) => string) => {
        const state = { themeMode: 'dark' as const };
        return selector ? selector(state) : state;
      },
    );
    mockMermaidRender.mockResolvedValue({ svg: '<svg></svg>' });
    mockMermaidInitialize.mockClear();
    mockMermaidRender.mockClear();
  });

  it('renders markdown content container', () => {
    render(<MarkdownWithCode># Hello markdown</MarkdownWithCode>);

    expect(screen.getByTestId('markdown-root')).toHaveTextContent('# Hello markdown');
  });

  it('renders syntax highlighter for fenced code blocks', () => {
    render(<MarkdownWithCode>{'```javascript\nconst x = 1;\n```'}</MarkdownWithCode>);

    expect(screen.getByTestId('syntax-highlighter')).toBeInTheDocument();
    expect(screen.getByTestId('syntax-highlighter')).toHaveTextContent('const x = 1;');
  });

  it('passes the detected language to the syntax highlighter', () => {
    render(<MarkdownWithCode>{'```python\nprint("hello")\n```'}</MarkdownWithCode>);

    expect(screen.getByTestId('syntax-highlighter')).toHaveAttribute('data-language', 'python');
  });

  it('renders multiple code blocks in one message', () => {
    render(<MarkdownWithCode>{'```javascript\nconst a = 1;\n```\n```python\nprint("b")\n```'}</MarkdownWithCode>);

    expect(screen.getAllByTestId('syntax-highlighter')).toHaveLength(2);
  });

  it('handles empty markdown content', () => {
    render(<MarkdownWithCode>{''}</MarkdownWithCode>);

    expect(screen.getByTestId('markdown-root')).toBeInTheDocument();
  });

  it('accepts a custom font size prop', () => {
    render(<MarkdownWithCode fontSize={16}>Test</MarkdownWithCode>);

    expect(screen.getByTestId('markdown-root')).toHaveTextContent('Test');
  });
});

describe('MarkdownWithCode — mermaid', () => {
  let useAuthStoreMock: jest.Mock;

  beforeEach(() => {
    useAuthStoreMock = jest.requireMock<{ useAuthStore: jest.Mock }>('../store/AuthStore').useAuthStore;
    useAuthStoreMock.mockImplementation((selector?: (state: { themeMode: string }) => string) => {
      const state = { themeMode: 'dark' as const };
      return selector ? selector(state) : state;
    });
    mockMermaidRender.mockResolvedValue({ svg: '<svg></svg>' });
    mockMermaidInitialize.mockClear();
    mockMermaidRender.mockClear();
  });

  it('renders mermaid diagram for mermaid code blocks', async () => {
    mockMermaidRender.mockResolvedValue({ svg: '<svg data-testid="mermaid-svg"></svg>' });

    render(<MarkdownWithCode>{'```mermaid\ngraph TD\n    A --> B\n```'}</MarkdownWithCode>);

    await waitFor(() => {
      expect(screen.getByTestId('mermaid-svg')).toBeInTheDocument();
    });
  });

  it('calls mermaid render with diagram content', async () => {
    render(<MarkdownWithCode>{'```mermaid\nflowchart LR\n    X --> Y\n```'}</MarkdownWithCode>);

    await waitFor(() => {
      expect(mockMermaidRender).toHaveBeenCalledWith(expect.stringContaining('mermaid-'), 'flowchart LR\n    X --> Y');
    });
  });

  it('does not render syntax highlighter for mermaid blocks', () => {
    render(<MarkdownWithCode>{'```mermaid\ngraph TD\n    A --> B\n```'}</MarkdownWithCode>);

    expect(screen.queryByTestId('syntax-highlighter')).not.toBeInTheDocument();
  });

  it('renders syntax highlighter for non-mermaid code blocks', () => {
    render(<MarkdownWithCode>{'```javascript\nconst x = 1;\n```'}</MarkdownWithCode>);

    expect(screen.getByTestId('syntax-highlighter')).toBeInTheDocument();
  });

  it('shows error when mermaid diagram is invalid', async () => {
    mockMermaidRender.mockRejectedValueOnce(new Error('Parse error: expected valid mermaid syntax'));

    render(<MarkdownWithCode>{'```mermaid\ninvalidsyntax!!!!\n```'}</MarkdownWithCode>);

    await waitFor(() => {
      expect(screen.getByText(/Parse error/)).toBeInTheDocument();
    });
  });

  it('reinitializes mermaid when theme changes', () => {
    mockMermaidInitialize.mockClear();

    const { rerender } = render(<MarkdownWithCode>{'text'}</MarkdownWithCode>);
    expect(mockMermaidInitialize).toHaveBeenCalledWith(
      expect.objectContaining({ theme: 'dark' }),
    );

    mockMermaidInitialize.mockClear();
    useAuthStoreMock.mockImplementation((selector?: (state: { themeMode: string }) => string) => {
      const state = { themeMode: 'light' as const };
      return selector ? selector(state) : state;
    });

    rerender(<MarkdownWithCode>{'text'}</MarkdownWithCode>);

    expect(mockMermaidInitialize).toHaveBeenCalledWith(
      expect.objectContaining({ theme: 'default' }),
    );
  });

  it('initializes mermaid with dark theme on mount', () => {
    render(<MarkdownWithCode>{'text'}</MarkdownWithCode>);

    expect(mockMermaidInitialize).toHaveBeenCalledWith(
      expect.objectContaining({ theme: 'dark', startOnLoad: false, securityLevel: 'loose' }),
    );
  });

  it('auto-closes unclosed SVG code fence so following markdown is not swallowed', () => {
    const content = `Some text before.

\`\`\`svg
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="40" fill="blue" /></svg>

---

## This heading should be formatted

Normal paragraph text after.`;

    render(<MarkdownWithCode>{content}</MarkdownWithCode>);

    expect(screen.getByText('Some text before.')).toBeInTheDocument();
    expect(screen.getByTestId('markdown-root')).toBeInTheDocument();
  });

  it('does not duplicate closing fence when SVG block is properly closed', () => {
    const content = `\`\`\`svg
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="40" fill="blue" /></svg>
\`\`\`

Some text after.`;

    render(<MarkdownWithCode>{content}</MarkdownWithCode>);

    expect(screen.getByText('Some text after.')).toBeInTheDocument();
  });
});