import { stripMarkdown } from '../stripMarkdown';

describe('stripMarkdown', () => {
  it('returns empty string for empty input', () => {
    expect(stripMarkdown('')).toBe('');
  });

  it('returns unchanged text with no markdown', () => {
    expect(stripMarkdown('Hello world')).toBe('Hello world');
  });

  describe('code blocks', () => {
    it('strips fenced code blocks', () => {
      const input = '```\nconst x = 1;\n```';
      const result = stripMarkdown(input);
      expect(result.trim()).toBe('');
    });

    it('strips fenced code blocks with language identifier', () => {
      const input = '```typescript\nconst x: number = 1;\n```';
      const result = stripMarkdown(input);
      expect(result.trim()).toBe('');
    });

    it('strips multiple fenced code blocks', () => {
      const input = '```\ncode1\n```\n\ntext\n\n```\ncode2\n```';
      expect(stripMarkdown(input)).toContain('text');
    });

    it('strips inline code', () => {
      expect(stripMarkdown('Use `const x = 1` to declare')).toBe('Use const x = 1 to declare');
    });

    it('strips multiple inline code spans', () => {
      expect(stripMarkdown('`a` and `b`')).toBe('a and b');
    });
  });

  describe('images', () => {
    it('strips images and keeps alt text', () => {
      expect(stripMarkdown('![alt text](https://example.com/img.png)')).toBe('alt text');
    });

    it('strips multiple images', () => {
      expect(stripMarkdown('![img1](url1) and ![img2](url2)')).toBe('img1 and img2');
    });
  });

  describe('links', () => {
    it('strips links and keeps link text', () => {
      expect(stripMarkdown('[Click here](https://example.com)')).toBe('Click here');
    });

    it('strips multiple links', () => {
      expect(stripMarkdown('[link1](url1) and [link2](url2)')).toBe('link1 and link2');
    });
  });

  describe('bold / italic / strikethrough', () => {
    it('strips single asterisk bold', () => {
      expect(stripMarkdown('**bold**')).toBe('bold');
    });

    it('strips double asterisk bold', () => {
      expect(stripMarkdown('**bold**')).toBe('bold');
    });

    it('strips triple asterisk bold', () => {
      expect(stripMarkdown('***bold***')).toBe('bold');
    });

    it('strips underscore italic', () => {
      expect(stripMarkdown('_italic_')).toBe('italic');
    });

    it('strips double underscore bold', () => {
      expect(stripMarkdown('__bold__')).toBe('bold');
    });

    it('strips double tilde strikethrough', () => {
      expect(stripMarkdown('~~strikethrough~~')).toBe('strikethrough');
    });
  });

  describe('headers', () => {
    it('strips h1 header', () => {
      expect(stripMarkdown('# Header 1')).toBe('Header 1');
    });

    it('strips h6 header', () => {
      expect(stripMarkdown('###### Header 6')).toBe('Header 6');
    });

    it('strips headers across multiple lines', () => {
      expect(stripMarkdown('# Title\n\n## Subtitle')).toBe('Title\n\nSubtitle');
    });
  });

  describe('blockquotes', () => {
    it('strips blockquote prefix', () => {
      expect(stripMarkdown('> This is a quote')).toBe('This is a quote');
    });

    it('strips blockquote with space', () => {
      expect(stripMarkdown('>  indented quote')).toBe('indented quote');
    });
  });

  describe('lists', () => {
    it('strips unordered list items with dash', () => {
      expect(stripMarkdown('- Item 1\n- Item 2')).toBe('Item 1\nItem 2');
    });

    it('strips unordered list items with asterisk', () => {
      expect(stripMarkdown('* Item 1\n* Item 2')).toBe('Item 1\nItem 2');
    });

    it('strips unordered list items with plus', () => {
      expect(stripMarkdown('+ Item 1\n+ Item 2')).toBe('Item 1\nItem 2');
    });

    it('strips ordered list items', () => {
      expect(stripMarkdown('1. First\n2. Second')).toBe('First\nSecond');
    });

    it('strips list items with extra whitespace', () => {
      expect(stripMarkdown('  -   indented item')).toBe('indented item');
    });
  });

  describe('horizontal rules', () => {
    it('strips horizontal rule with dashes', () => {
      const result = stripMarkdown('text\n---\nmore text');
      expect(result).toContain('text');
      expect(result).toContain('more text');
    });

    it('strips horizontal rule with asterisks', () => {
      const result = stripMarkdown('text\n***\nmore text');
      expect(result).toContain('text');
      expect(result).toContain('more text');
    });

    it('strips horizontal rule with underscores', () => {
      const result = stripMarkdown('text\n___\nmore text');
      expect(result).toContain('text');
      expect(result).toContain('more text');
    });
  });

  describe('tables', () => {
    it('strips table separator row', () => {
      const result = stripMarkdown('| Column 1 | Column 2 |\n|---------|----------|\n| Cell 1  | Cell 2  |');
      expect(result).toContain('Column 1');
      expect(result).toContain('Column 2');
      expect(result).toContain('Cell 1');
      expect(result).toContain('Cell 2');
    });

    it('strips table pipes', () => {
      const result = stripMarkdown('| a | b | c |');
      expect(result).toContain('a');
      expect(result).toContain('b');
      expect(result).toContain('c');
    });
  });

  describe('HTML tags', () => {
    it('strips HTML tags', () => {
      expect(stripMarkdown('<strong>bold</strong>')).toBe('bold');
    });

    it('strips nested HTML tags', () => {
      expect(stripMarkdown('<div><span>text</span></div>')).toBe('text');
    });
  });

  describe('whitespace collapsing', () => {
    it('collapses multiple newlines to double newline', () => {
      expect(stripMarkdown('line1\n\n\n\nline2')).toBe('line1\n\nline2');
    });

    it('collapses multiple spaces to single space', () => {
      expect(stripMarkdown('text    multiple   spaces')).toBe('text multiple spaces');
    });

    it('trims leading and trailing whitespace', () => {
      expect(stripMarkdown('  hello  ')).toBe('hello');
    });
  });

  describe('complex input', () => {
    it('handles mixed markdown elements', () => {
      const input = `# Title

## Section

Here is **bold** and _italic_ text.

- Item 1
- Item 2

> A quote

More [links](https://example.com) and \`code\`.

\`\`\`python
def hello():
    print("world")
\`\`\`
`;
      const result = stripMarkdown(input);
      expect(result).toContain('Title');
      expect(result).toContain('Section');
      expect(result).toContain('Here is bold and italic text.');
      expect(result).toContain('Item 1');
      expect(result).toContain('A quote');
      expect(result).toContain('More links and code.');
    });
  });
});