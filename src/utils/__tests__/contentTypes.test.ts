import { detectContentTypes, CONTENT_TYPE_LABELS } from '../contentTypes';

describe('detectContentTypes', () => {
  it('returns an empty array for plain text', () => {
    expect(detectContentTypes('Just some text, no code.')).toEqual([]);
  });

  it('detects an svg block', () => {
    expect(detectContentTypes('```svg\n<svg></svg>\n```')).toEqual(['svg']);
  });

  it('detects a mermaid block', () => {
    expect(detectContentTypes('```mermaid\ngraph TD\n A --> B\n```')).toEqual(['mermaid']);
  });

  it('detects a code block', () => {
    expect(detectContentTypes('```javascript\nconst x = 1;\n```')).toEqual(['code']);
  });

  it('detects multiple types and returns them in canonical order', () => {
    const content = [
      '```python',
      'print("hi")',
      '```',
      '',
      '```svg',
      '<svg></svg>',
      '```',
      '',
      '```mermaid',
      'graph TD',
      '```',
    ].join('\n');

    expect(detectContentTypes(content)).toEqual(['svg', 'mermaid', 'code']);
  });

  it('ignores closing fences without a language', () => {
    expect(detectContentTypes('```svg\n<svg></svg>\n```')).toEqual(['svg']);
  });

  it('is case-insensitive for the language tag', () => {
    expect(detectContentTypes('```SVG\n<svg></svg>\n```')).toEqual(['svg']);
  });

  it('does not treat currency as content', () => {
    expect(detectContentTypes('That costs $5.00 total.')).toEqual([]);
  });
});

describe('CONTENT_TYPE_LABELS', () => {
  it('has labels for all types', () => {
    expect(CONTENT_TYPE_LABELS.svg).toBe('SVG');
    expect(CONTENT_TYPE_LABELS.mermaid).toBe('Diagram');
    expect(CONTENT_TYPE_LABELS.code).toBe('Code');
  });
});
