import { render, screen } from '@testing-library/react';

jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }: { children: string }): JSX.Element => {
    return <div data-testid="markdown-root">{children}</div>;
  },
}));

jest.mock('remark-gfm', () => jest.fn());

const mockRegisterLanguage = jest.fn((name: string, language: unknown): void => {
  void name;
  void language;
});

jest.mock('react-syntax-highlighter', () => ({
  PrismLight: Object.assign(
    ({ children, language }: { children?: unknown; language?: string }) => (
      <pre data-testid="syntax-highlighter" data-language={language}>
        {children}
      </pre>
    ),
    {
      registerLanguage: (...args: [string, unknown]): void => {
        mockRegisterLanguage(...args);
      },
    },
  ),
}));

jest.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({
  oneDark: { comment: {}, 'block-comment': {}, prolog: {} },
  oneLight: {},
}));

jest.mock('react-syntax-highlighter/dist/esm/languages/prism/javascript', () => ({}));
jest.mock('react-syntax-highlighter/dist/esm/languages/prism/typescript', () => ({}));
jest.mock('react-syntax-highlighter/dist/esm/languages/prism/python', () => ({}));
jest.mock('react-syntax-highlighter/dist/esm/languages/prism/json', () => ({}));
jest.mock('react-syntax-highlighter/dist/esm/languages/prism/bash', () => ({}));
jest.mock('react-syntax-highlighter/dist/esm/languages/prism/css', () => ({}));
jest.mock('react-syntax-highlighter/dist/esm/languages/prism/markup', () => ({}));
jest.mock('react-syntax-highlighter/dist/esm/languages/prism/java', () => ({}));
jest.mock('react-syntax-highlighter/dist/esm/languages/prism/csharp', () => ({}));
jest.mock('react-syntax-highlighter/dist/esm/languages/prism/sql', () => ({}));
jest.mock('react-syntax-highlighter/dist/esm/languages/prism/yaml', () => ({}));
jest.mock('react-syntax-highlighter/dist/esm/languages/prism/markdown', () => ({}));
jest.mock('react-syntax-highlighter/dist/esm/languages/prism/jsx', () => ({}));
jest.mock('react-syntax-highlighter/dist/esm/languages/prism/tsx', () => ({}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const markdownModule = require('./MarkdownWithCode') as {
  default: ({ children, fontSize }: { children: string; fontSize?: number }) => JSX.Element;
};
const MarkdownWithCode = markdownModule.default;

describe('MarkdownWithCode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders markdown content container', () => {
    render(<MarkdownWithCode># Hello markdown</MarkdownWithCode>);

    expect(screen.getByTestId('markdown-root')).toHaveTextContent('# Hello markdown');
  });

  it('renders fenced markdown input', () => {
    render(<MarkdownWithCode>{'```ts\nconst typed = true;\n```'}</MarkdownWithCode>);

    expect(screen.getByTestId('markdown-root')).toHaveTextContent('const typed = true;');
  });
});
