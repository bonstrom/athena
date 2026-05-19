/**
 * Math plugin wiring tests for MarkdownWithCode.
 *
 * remark-math and rehype-katex are ESM-only packages that cannot run in Jest's
 * CJS environment (react-scripts / Babel). They are stubbed via moduleNameMapper
 * (src/__mocks__/remark-math.js and rehype-katex.js). These tests verify that
 * MarkdownWithCode passes the math plugins to ReactMarkdown — i.e. the wiring
 * is correct — without needing the real renderers to execute.
 */
import React from 'react';
import { render } from '@testing-library/react';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

// Capture the props that ReactMarkdown receives so we can assert on plugins.
type ReactMarkdownProps = {
  children?: string;
  remarkPlugins?: unknown[];
  rehypePlugins?: unknown[];
};

let capturedProps: ReactMarkdownProps = {};

jest.mock('react-markdown', () => ({
  __esModule: true,
  default: (props: ReactMarkdownProps): React.ReactElement => {
    capturedProps = props;
    return <div data-testid="react-markdown-mock">{props.children}</div>;
  },
}));

jest.mock('remark-gfm', () => jest.fn());

const { default: MarkdownWithCode } = jest.requireActual<typeof import('./MarkdownWithCode')>('./MarkdownWithCode');

beforeEach(() => {
  capturedProps = {};
});

describe('MarkdownWithCode – math plugin wiring', () => {
  it('passes remark-math in remarkPlugins', () => {
    render(<MarkdownWithCode>{'$E = mc^2$'}</MarkdownWithCode>);

    expect(capturedProps.remarkPlugins).toContain(remarkMath);
  });

  it('passes rehype-katex in rehypePlugins', () => {
    render(<MarkdownWithCode>{'$$a + b$$'}</MarkdownWithCode>);

    expect(capturedProps.rehypePlugins).toContain(rehypeKatex);
  });

  it('keeps remark-gfm alongside remark-math', () => {
    const remarkGfm = jest.requireMock<() => void>('remark-gfm');
    render(<MarkdownWithCode>{'text'}</MarkdownWithCode>);

    expect(capturedProps.remarkPlugins).toContain(remarkGfm);
    expect(capturedProps.remarkPlugins).toContain(remarkMath);
  });
});
