import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

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
      pre?: (props: { children?: React.ReactNode }) => React.ReactElement;
    };
  }): React.ReactElement => {
    const preRenderer = components?.pre;
    const segments = children.split(/(```[\s\S]*?```)/g).filter((segment) => segment.length > 0);

    return (
      <div data-testid="markdown-root">
        {segments.map((segment, index) => {
          const match = /^```([\w+-]+)?\n([\s\S]*?)```$/s.exec(segment);
          if (!match || !preRenderer) {
            return <span key={`text-${String(index)}`}>{segment}</span>;
          }

          const language = match[1];
          const codeElement = (
            <code className={language ? `language-${language}` : undefined}>{match[2]}</code>
          );
          return <span key={`code-${String(index)}`}>{preRenderer({ children: codeElement })}</span>;
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

  it('passes hyphenated language names to the syntax highlighter intact', () => {
    render(<MarkdownWithCode>{'```objective-c\n[self doThing];\n```'}</MarkdownWithCode>);

    expect(screen.getByTestId('syntax-highlighter')).toHaveAttribute('data-language', 'objective-c');
  });

  it('renders a copy button for language-less code blocks', () => {
    render(<MarkdownWithCode>{'```\nplain text block\n```'}</MarkdownWithCode>);

    expect(screen.getByRole('button', { name: 'Copy code to clipboard' })).toBeInTheDocument();
    expect(screen.getByText('plain text block')).toBeInTheDocument();
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

  it('sanitizes mermaid SVG output before injecting it', async () => {
    mockMermaidRender.mockResolvedValue({
      svg: '<svg data-testid="mermaid-svg"><script>alert("xss")</script><text>hi</text></svg>',
    });

    const { container } = render(<MarkdownWithCode>{'```mermaid\ngraph TD\n    A --> B\n```'}</MarkdownWithCode>);

    await waitFor(() => {
      expect(screen.getByTestId('mermaid-svg')).toBeInTheDocument();
    });

    expect(container.innerHTML).not.toContain('<script>');
    expect(container.innerHTML).not.toContain('alert');
  });

  it('preserves mermaid HTML labels inside foreignObject while sanitizing', async () => {
    mockMermaidRender.mockResolvedValue({
      svg:
        '<svg data-testid="mermaid-svg"><foreignObject><div><span class="nodeLabel">Node A</span><img src="x" onerror="alert(1)"/></div></foreignObject></svg>',
    });

    const { container } = render(<MarkdownWithCode>{'```mermaid\ngraph TD\n    A --> B\n```'}</MarkdownWithCode>);

    await waitFor(() => {
      expect(screen.getByTestId('mermaid-svg')).toBeInTheDocument();
    });

    expect(container.innerHTML).toContain('Node A');
    expect(container.innerHTML).not.toContain('onerror');
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

  it('initializes mermaid with light theme', async () => {
    useAuthStoreMock.mockImplementation((selector?: (state: { themeMode: string }) => string) => {
      const state = { themeMode: 'light' as const };
      return selector ? selector(state) : state;
    });

    render(<MarkdownWithCode>{'```mermaid\ngraph TD\n    A --> B\n```'}</MarkdownWithCode>);

    await waitFor(() =>
      expect(mockMermaidInitialize).toHaveBeenCalledWith(expect.objectContaining({ theme: 'default' })),
    );
  });

  it('initializes mermaid with dark theme on mount', async () => {
    render(<MarkdownWithCode>{'```mermaid\ngraph TD\n    A --> B\n```'}</MarkdownWithCode>);

    await waitFor(() =>
      expect(mockMermaidInitialize).toHaveBeenCalledWith(
        expect.objectContaining({ theme: 'dark', startOnLoad: false, securityLevel: 'loose' }),
      ),
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

  it('uses overflowWrap instead of deprecated wordBreak: break-word on the wrapper', () => {
    const { container } = render(<MarkdownWithCode>0.00001 per translation via an API</MarkdownWithCode>);

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toBeInTheDocument();

    const styleTags = document.querySelectorAll('style');
    let combinedCSS = '';
    styleTags.forEach((tag) => {
      combinedCSS += tag.textContent ?? '';
    });

    expect(combinedCSS).not.toContain('word-break:break-word');
  });

  it('renders text with dollar amounts without confusing them as math', () => {
    render(<MarkdownWithCode>{'$0.00001 per translation via an API'}</MarkdownWithCode>);
    const root = screen.getByTestId('markdown-root');
    expect(root).toBeInTheDocument();
    expect(root.textContent).toContain('0.00001');
    expect(root.textContent).toContain('per translation');
  });

  it('renders intentional inline math normally', () => {
    render(<MarkdownWithCode>{'$E = mc^2$'}</MarkdownWithCode>);
    const root = screen.getByTestId('markdown-root');
    expect(root).toBeInTheDocument();
    expect(root.textContent).not.toMatch(/\\\$/);
  });

  it('preserves LaTeX commands in math mode', () => {
    render(<MarkdownWithCode>{'$\\frac{1}{2}$'}</MarkdownWithCode>);
    const root = screen.getByTestId('markdown-root');
    expect(root).toBeInTheDocument();
    expect(root.textContent).not.toMatch(/\\\$/);
  });

  it('escapes dollar-digit but may break rare math starting with a digit', () => {
    render(<MarkdownWithCode>{'$2x + 3y = 5$'}</MarkdownWithCode>);
    const root = screen.getByTestId('markdown-root');
    expect(root).toBeInTheDocument();
    expect(root.textContent).toMatch(/\\\$/);
  });

  it('preserves $$ display math delimiters when the equation starts with a digit', () => {
    render(<MarkdownWithCode>{'$$2(x_2 - x_1)h + 2(y_2 - y_1)k = x_2^2 + y_2^2$$'}</MarkdownWithCode>);
    const root = screen.getByTestId('markdown-root');
    expect(root).toBeInTheDocument();
    expect(root.textContent).not.toMatch(/\\\$/);
    expect(root.textContent).toContain('$$2(x_2 - x_1)h');
  });

  it('escapes standalone currency dollar signs still', () => {
    render(<MarkdownWithCode>{'It costs $5 and $10.50'}</MarkdownWithCode>);
    const root = screen.getByTestId('markdown-root');
    expect(root).toBeInTheDocument();
    expect(root.textContent).toContain('\\$5');
    expect(root.textContent).toContain('\\$10.50');
  });

  it('does not duplicate closing fence when SVG block is properly closed', () => {
    const content = `\`\`\`svg
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="40" fill="blue" /></svg>
\`\`\`

Some text after.`;

    render(<MarkdownWithCode>{content}</MarkdownWithCode>);

    expect(screen.getByText('Some text after.')).toBeInTheDocument();
  });

  it('sanitizes SVG content to strip script tags', async () => {
    const { container } = render(
      <MarkdownWithCode>{'```svg\n<svg><script>alert("xss")</script></svg>\n```'}</MarkdownWithCode>,
    );

    await waitFor(() => {
      const svgContainer = container.querySelector('[class*="MuiBox-root"]');
      expect(svgContainer).toBeInTheDocument();
    });

    const innerHTML = container.innerHTML;
    expect(innerHTML).not.toContain('<script>');
    expect(innerHTML).not.toContain('alert');
  });

  it('sanitizes SVG content to strip onload event handlers', async () => {
    const { container } = render(
      <MarkdownWithCode>{'```svg\n<svg onload="alert(1)"><circle cx="50" cy="50" r="40" fill="red"/></svg>\n```'}</MarkdownWithCode>,
    );

    await waitFor(() => {
      const svgContainer = container.querySelector('[class*="MuiBox-root"]');
      expect(svgContainer).toBeInTheDocument();
    });

    const innerHTML = container.innerHTML;
    expect(innerHTML).not.toContain('onload');
  });

  it('renders an Edit button and calls onEditSvg with the SVG source', () => {
    const onEditSvg = jest.fn();

    render(<MarkdownWithCode onEditSvg={onEditSvg}>{'```svg\n<svg><circle r="40" /></svg>\n```'}</MarkdownWithCode>);

    const button = screen.getByRole('button', { name: 'Edit SVG' });
    expect(button).toBeInTheDocument();
    fireEvent.click(button);

    expect(onEditSvg).toHaveBeenCalledWith('<svg><circle r="40" /></svg>');
  });

  it('does not render an Edit button when onEditSvg is not provided', () => {
    render(<MarkdownWithCode>{'```svg\n<svg><circle r="40" /></svg>\n```'}</MarkdownWithCode>);

    expect(screen.queryByRole('button', { name: 'Edit SVG' })).not.toBeInTheDocument();
  });
});