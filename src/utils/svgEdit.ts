/**
 * Extracts the first complete <svg>...</svg> document from arbitrary text,
 * stripping markdown fence markers and any trailing/duplicated content that may
 * have leaked in from a model response. Returns null when no balanced SVG
 * document is found.
 */
export function normalizeSvgDocument(text: string): string | null {
  const withoutFences = text.replace(/```/g, '');
  const start = withoutFences.search(/<svg[\s>]/i);
  if (start === -1) return null;

  const openRe = /<svg[\s>]/gi;
  const closeRe = /<\/svg\s*>/gi;
  let depth = 0;
  let position = start;

  while (position < withoutFences.length) {
    openRe.lastIndex = position;
    closeRe.lastIndex = position;
    const openMatch = openRe.exec(withoutFences);
    const closeMatch = closeRe.exec(withoutFences);

    if (openMatch && (!closeMatch || openMatch.index < closeMatch.index)) {
      depth += 1;
      position = openMatch.index + openMatch[0].length;
    } else if (closeMatch) {
      depth -= 1;
      position = closeMatch.index + closeMatch[0].length;
      if (depth === 0) {
        return withoutFences.slice(start, position).trim();
      }
    } else {
      break;
    }
  }
  return null;
}

/**
 * Replaces the ```svg fenced block whose inner content matches svgSource with
 * newSvg, keeping the surrounding markdown intact. Returns null if no block
 * matches.
 */
export function replaceSvgBlockInMessage(content: string, svgSource: string, newSvg: string): string | null {
  const regex = /```svg[^\n]*\n([\s\S]*?)\n?```/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (match[1].trim() === svgSource.trim()) {
      const start = match.index;
      const end = start + match[0].length;
      return `${content.slice(0, start)}\`\`\`svg\n${newSvg.trim()}\n\`\`\`${content.slice(end)}`;
    }
  }
  return null;
}
