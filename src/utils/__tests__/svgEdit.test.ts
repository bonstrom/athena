import { normalizeSvgDocument, replaceSvgBlockInMessage } from '../svgEdit';

describe('normalizeSvgDocument', () => {
  it('returns a clean single svg document', () => {
    expect(normalizeSvgDocument('<svg><circle r="40" /></svg>')).toBe('<svg><circle r="40" /></svg>');
  });

  it('drops trailing content after the closing </svg>', () => {
    const text = '<svg><circle r="40" /></svg>\n<!-- leftover --> <g>...</g>';
    expect(normalizeSvgDocument(text)).toBe('<svg><circle r="40" /></svg>');
  });

  it('strips markdown fence markers', () => {
    expect(normalizeSvgDocument('```svg\n<svg><circle /></svg>\n```')).toBe('<svg><circle /></svg>');
  });

  it('returns null when there is no svg', () => {
    expect(normalizeSvgDocument('no svg here')).toBeNull();
  });

  it('returns null when the first svg has no closing tag', () => {
    expect(normalizeSvgDocument('<svg><circle />')).toBeNull();
  });

  it('keeps only the first balanced svg and ignores a trailing unbalanced one', () => {
    expect(normalizeSvgDocument('<svg><circle /></svg><svg>')).toBe('<svg><circle /></svg>');
  });
});

describe('replaceSvgBlockInMessage', () => {
  it('replaces the matching svg block while preserving surrounding markdown', () => {
    const content = 'Intro\n\n```svg\n<circle r="40" />\n```\n\nOutro';
    const result = replaceSvgBlockInMessage(content, '<circle r="40" />', '<circle r="60" />');
    expect(result).toBe('Intro\n\n```svg\n<circle r="60" />\n```\n\nOutro');
  });

  it('replaces only the block whose inner content matches', () => {
    const content = '```svg\n<one />\n```\n\n```svg\n<two />\n```';
    const result = replaceSvgBlockInMessage(content, '<two />', '<two-changed />');
    expect(result).toBe('```svg\n<one />\n```\n\n```svg\n<two-changed />\n```');
  });

  it('returns null when no block matches', () => {
    expect(replaceSvgBlockInMessage('no svg here', '<circle />', '<new />')).toBeNull();
  });
});
