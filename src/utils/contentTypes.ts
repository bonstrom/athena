export type ContentType = 'svg' | 'mermaid' | 'code';

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  svg: 'SVG',
  mermaid: 'Diagram',
  code: 'Code',
};

const CONTENT_TYPE_ORDER: ContentType[] = ['svg', 'mermaid', 'code'];

/**
 * Detects which kinds of rendered content a markdown message contains, based on
 * its fenced code blocks. Language-less ``` fences (typically closing fences)
 * are ignored, so only real code/diagram blocks register.
 */
export function detectContentTypes(content: string): ContentType[] {
  const found = new Set<ContentType>();
  const fenceRe = /```([a-zA-Z][a-zA-Z0-9_-]*)/g;
  let match: RegExpExecArray | null;
  while ((match = fenceRe.exec(content)) !== null) {
    const language = match[1].toLowerCase();
    if (language === 'svg') {
      found.add('svg');
    } else if (language === 'mermaid') {
      found.add('mermaid');
    } else {
      found.add('code');
    }
  }
  return CONTENT_TYPE_ORDER.filter((type) => found.has(type));
}
