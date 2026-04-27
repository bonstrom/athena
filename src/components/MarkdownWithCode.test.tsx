import React from 'react';
import { render, screen } from '@testing-library/react';

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
          const match = /^```(\w+)?\n([\s\S]*?)```$/.exec(segment);
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



const { default: MarkdownWithCode } = jest.requireActual<typeof import('./MarkdownWithCode')>('./MarkdownWithCode');

describe('MarkdownWithCode', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn(() => Promise.resolve()),
      },
    });
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
