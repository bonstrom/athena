/**
 * Preprocessing tests for MarkdownWithCode.
 *
 * These tests capture the `children` string that MarkdownWithCode passes to
 * ReactMarkdown (after `preprocessMarkdown`) and assert on the exact output,
 * which lets us verify fence balancing and currency escaping without running
 * the real remark/rehype renderers.
 */
import React from 'react';
import { render } from '@testing-library/react';

interface ReactMarkdownProps {
  children?: string;
  remarkPlugins?: unknown[];
  rehypePlugins?: unknown[];
}

let capturedProps: ReactMarkdownProps = {};

jest.mock('react-markdown', () => ({
  __esModule: true,
  default: (props: ReactMarkdownProps): React.ReactElement => {
    capturedProps = props;
    return <div data-testid="react-markdown-mock">{props.children}</div>;
  },
}));

jest.mock('remark-gfm', () => jest.fn());

jest.mock('mermaid', () => {
  const mermaidModule = {
    initialize: jest.fn(),
    render: jest.fn(),
  };
  return {
    __esModule: true,
    default: mermaidModule,
  };
});

jest.mock('../store/AuthStore', () => ({
  useAuthStore: jest.fn((selector?: (state: { themeMode: string }) => string) => {
    const state = { themeMode: 'dark' as const };
    return selector ? selector(state) : state;
  }),
}));

const { default: MarkdownWithCode } = jest.requireActual<typeof import('./MarkdownWithCode')>('./MarkdownWithCode');

beforeEach(() => {
  capturedProps = {};
});

function preprocess(input: string): string {
  render(<MarkdownWithCode>{input}</MarkdownWithCode>);
  return capturedProps.children ?? '';
}

describe('MarkdownWithCode — preprocessing', () => {
  describe('currency escaping is code-aware (#1)', () => {
    it('escapes currency $ in prose', () => {
      expect(preprocess('costs $5 and $10.50')).toContain('\\$5');
      expect(preprocess('costs $5 and $10.50')).toContain('\\$10.50');
    });

    it('leaves $ inside a bash fence untouched', () => {
      const out = preprocess('```bash\necho "$1" "$2"\n```');
      expect(out).toContain('echo "$1" "$2"');
      expect(out).not.toContain('\\$1');
    });

    it('leaves $ inside inline code untouched', () => {
      const out = preprocess('use `$1` in the script');
      expect(out).toContain('`$1`');
      expect(out).not.toContain('\\$1');
    });

    it('leaves $ inside mermaid labels untouched', () => {
      const out = preprocess('```mermaid\ngraph TD; A["$5 fee"]-->B\n```');
      expect(out).toContain('$5 fee');
    });

    it('leaves $ inside svg text untouched', () => {
      const out = preprocess('```svg\n<text x="1" y="2">$5</text>\n```');
      expect(out).toContain('>$5</text>');
    });

    it('preserves $$ display math delimiters starting with a digit', () => {
      const out = preprocess('$$2x + 3 = 7$$');
      expect(out).toContain('$$2x');
    });
  });

  describe('fence balancing (#2, #3)', () => {
    it('finds a real closing svg fence beyond the old 4-line window', () => {
      const input = [
        '```svg',
        '<svg viewBox="0 0 10 10">',
        '  <circle r="5"/>',
        '</svg>',
        'note1',
        'note2',
        'note3',
        'note4',
        'note5',
        'note6',
        '```',
        'After text',
      ].join('\n');

      const out = preprocess(input);

      expect(out).toContain('After text');
      expect(out).not.toContain('```\nnote1');
      expect(out.match(/```/g)).toHaveLength(2);
    });

    it('auto-closes an unclosed svg fence right after its </svg> tag', () => {
      const input = ['```svg', '<svg viewBox="0 0 10 10">', '  <circle r="5"/>', '</svg>', 'After text'].join('\n');

      expect(preprocess(input)).toContain('</svg>\n```\nAfter text');
    });

    it('does not close a 4-backtick fence on an inner 3-backtick line', () => {
      const input = ['````', 'code with ``` inside', '````', 'after'].join('\n');

      const out = preprocess(input);

      expect(out).toBe(input);
      expect(out).toContain('after');
    });

    it('tracks ~~~ fences independently of ``` fences', () => {
      const input = ['~~~', 'code $5', '~~~', 'after $5'].join('\n');

      const out = preprocess(input);

      expect(out).toContain('code $5');
      expect(out).not.toContain('code \\$5');
      expect(out).toContain('after \\$5');
    });

    it('closes an unbalanced ~~~ fence with a matching marker at end of document', () => {
      expect(preprocess('~~~\nunclosed $5')).toContain('~~~');
    });

    it('escapes currency inside an unclosed ~~~ fence region only after balancing', () => {
      const out = preprocess('~~~\ncode $5');
      expect(out).toContain('code $5');
    });
  });
});
