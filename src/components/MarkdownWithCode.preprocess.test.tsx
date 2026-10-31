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
import { execFileSync } from 'child_process';

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

    it('preserves inline math that starts with a digit', () => {
      expect(preprocess('~$3 \\times 10^{46}$ joules')).toContain('$3 \\times 10^{46}$');
      expect(preprocess('~$3 \\times 10^{46}$ joules')).not.toContain('\\$3');
    });

    it('preserves a digit-leading inline math span even with currency elsewhere', () => {
      const out = preprocess('Costs $5, and the value is $10^{58}$ neutrinos.');
      expect(out).toContain('\\$5');
      expect(out).toContain('$10^{58}$');
      expect(out).not.toContain('\\$10^{58}');
    });

    it('still escapes trailing currency that has no closing delimiter', () => {
      const out = preprocess('It costs $5 and $10.50');
      expect(out).toContain('\\$5');
      expect(out).toContain('\\$10.50');
    });
  });

  describe('explicit LaTeX delimiter normalization', () => {
    it('does not guess math delimiters for an undelimited expression', () => {
      const input = String.raw`Practical rule: check the forecast spread between air temperature and dew point. If (T - T_d \lesssim 1\text{–}2\ ^\circ\mathrm{C}) with wind under ~3 m/s and clearing skies, plan for fog.`;

      expect(preprocess(input)).toBe(input);
    });

    it('converts backslash-parenthesis delimiters to supported math delimiters', () => {
      const input = String.raw`If \(T - T_d \lesssim 1\text{–}2\ ^\circ\mathrm{C}\) with wind under ~3 m/s, plan for fog.`;

      expect(preprocess(input)).toContain(String.raw`$T - T_d \lesssim 1\text{–}2\ ^\circ\mathrm{C}$`);
    });

    it('leaves ordinary parentheses unchanged', () => {
      const input = 'If the temperature falls (usually after sunset), plan for fog.';
      expect(preprocess(input)).toBe(input);
    });

    it('does not reprocess parentheses inside newly normalized math', () => {
      expect(preprocess(String.raw`If \(\sin(\theta)\), continue.`)).toBe(String.raw`If $\sin(\theta)$, continue.`);
      expect(preprocess(String.raw`\((\alpha + \beta)\)`)).toBe(String.raw`$(\alpha + \beta)$`);
    });

    it('preserves paths and Markdown link destinations', () => {
      const input = String.raw`See (C:\Users\Alice) and [reference](https://example.com/\alpha).`;
      expect(preprocess(input)).toBe(input);
    });

    it('normalizes display delimiters onto separate lines', () => {
      expect(preprocess(String.raw`Before \[x^2 + y^2 = z^2\] after.`)).toBe(
        'Before \n$$\nx^2 + y^2 = z^2\n$$\n after.',
      );
    });

    it('normalizes multiline explicit math', () => {
      expect(preprocess(['\\[', 'x = \\frac{1}{2}', '\\]'].join('\n'))).toBe('\n$$\nx = \\frac{1}{2}\n$$\n');
      expect(preprocess(['\\[', '    x = \\frac{1}{2}', '\\]'].join('\n'))).toBe('\n$$\nx = \\frac{1}{2}\n$$\n');
      expect(preprocess(['\\(x +', '\\alpha\\)'].join('\n'))).toBe('$x +\n\\alpha$');
    });

    it('preserves escaped backslash delimiters', () => {
      const input = String.raw`Literal \\(x\\) and \\[y\\].`;
      expect(preprocess(input)).toBe(input);
    });

    it('does not mistake escaped backslashes for a closing delimiter', () => {
      expect(preprocess(String.raw`\(\text{a \\) b}\)`)).toBe(String.raw`$\text{a \\) b}$`);
    });

    it('normalizes explicit math alongside currency', () => {
      expect(preprocess(String.raw`Costs $5 and \(x\), then $10.`)).toBe(String.raw`Costs \$5 and $x$, then \$10.`);
    });

    it('preserves explicit delimiters inside inline code and existing math', () => {
      const input = 'Use `\\(x\\)` or $\\text{\\(x\\)}$ or $$\\text{\\[x\\]}$$.';
      expect(preprocess(input)).toBe(input);
    });

    it('preserves multiline inline code, including currency', () => {
      const input = ['`code spans', String.raw`\(T_d \lesssim 2\) costs $5`, 'end`'].join('\n');
      expect(preprocess(input)).toBe(input);
    });

    it('requires matching backtick run lengths for inline code', () => {
      const input = '``one ` and \\(x\\)`` then \\(y\\)';
      expect(preprocess(input)).toBe('``one ` and \\(x\\)`` then $y$');
    });

    it('preserves multiline inline math', () => {
      const input = ['$x +', String.raw`\text{\(y\)}$`].join('\n');
      expect(preprocess(input)).toBe(input);
    });

    it('preserves existing math with whitespace or escaped dollars', () => {
      const input = String.raw`$ \text{\(x\)} $ and $\text{cost: \$5, \(y\)}$`;
      expect(preprocess(input)).toBe(input);
    });

    it.each(['    ', '\t'])('preserves indented code with prefix %j', (indent) => {
      const input = `${indent}\\(x\\) and \\[y\\] cost $5`;
      expect(preprocess(input)).toBe(input);
    });

    it.each(['```tex', '~~~tex'])('preserves explicit delimiters inside %s fences', (opening) => {
      const input = [opening, String.raw`\(x\) and \[y\]`, opening.slice(0, 3), String.raw`Then \(z\).`].join('\n');
      expect(preprocess(input)).toBe(input.replace(String.raw`Then \(z\).`, 'Then $z$.'));
    });

    it('does not add delimiters inside inline code or existing math', () => {
      const input = 'Use `(T_d \\lesssim 2)` or $(T_d \\lesssim 2)$ already.';
      expect(preprocess(input)).toBe(input);
    });

    it('does not add delimiters inside fenced code', () => {
      const input = ['```tex', String.raw`(T_d \lesssim 2)`, '```'].join('\n');
      expect(preprocess(input)).toBe(input);
    });

    it('does not add delimiters inside multi-line display math', () => {
      const input = ['$$', String.raw`(T_d \lesssim 2)`, '$$'].join('\n');
      expect(preprocess(input)).toBe(input);
    });

    it('only closes display math on a matching fence line', () => {
      const input = [
        '$$$',
        String.raw`\text{\(x\)} + $$`,
        '```',
        '$$',
        String.raw`\text{\[y\]}`,
        '$$$',
        String.raw`Then \(z\).`,
      ].join('\n');
      expect(preprocess(input)).toBe(input.replace(String.raw`Then \(z\).`, 'Then $z$.'));
    });

    it('renders normalized expressions with the real Markdown and KaTeX plugins', () => {
      const expressions = [
        String.raw`\sin(\theta)`,
        String.raw`(\alpha + \beta)`,
        String.raw`T - T_d \lesssim 1\text{–}2\ ^\circ\mathrm{C}`,
      ];
      const inputs = expressions.map((expression) => preprocess(`\\(${expression}\\)`));
      inputs.push(preprocess(String.raw`\[x^2 + y^2 = z^2\]`));

      // CRA maps the ESM renderers to mocks. A Node subprocess exercises the
      // actual installed packages without changing the project's Jest config.
      const output = execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `import fs from 'node:fs';
           import React from 'react';
           import { renderToStaticMarkup } from 'react-dom/server';
           import Markdown from 'react-markdown';
           import remarkMath from 'remark-math';
           import rehypeKatex from 'rehype-katex';
           const inputs = JSON.parse(fs.readFileSync(0, 'utf8'));
           const output = inputs.map(text => renderToStaticMarkup(
             React.createElement(Markdown, {
               remarkPlugins: [remarkMath], rehypePlugins: [rehypeKatex]
             }, text)
           ));
           process.stdout.write(JSON.stringify(output));`,
        ],
        { input: JSON.stringify(inputs), encoding: 'utf8' },
      );
      const rendered: unknown = JSON.parse(output);
      if (!Array.isArray(rendered)) throw new Error('Expected rendered expressions');
      expect(rendered).toHaveLength(inputs.length);
      rendered.forEach((html: unknown, index: number): void => {
        if (typeof html !== 'string') throw new Error('Expected rendered HTML');
        const container = document.createElement('div');
        container.innerHTML = html;
        expect(container.querySelectorAll('.katex')).toHaveLength(1);
        expect(container.querySelector('.katex-error')).toBeNull();
        expect(container.querySelector('annotation')?.textContent).toBe(expressions[index] ?? 'x^2 + y^2 = z^2');
        expect(container.querySelectorAll('.katex-display')).toHaveLength(index === expressions.length ? 1 : 0);
      });
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
