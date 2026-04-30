export function stripMarkdown(text: string): string {
  return (
    text
      // Code blocks (fenced)
      .replace(/```[\s\S]*?```/g, ' ')
      // Inline code
      .replace(/`([^`]+)`/g, '$1')
      // Images
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      // Links
      .replace(/\[([^\]]*)\]\([^)]+\)/g, '$1')
      // Bold / italic / strikethrough
      .replace(/(\*{1,3}|_{1,3})(.*?)\1/g, '$2')
      .replace(/~~(.*?)~~/g, '$1')
      // Headers
      .replace(/^#{1,6}\s+/gm, '')
      // Blockquotes
      .replace(/^>\s?/gm, '')
      // Unordered lists
      .replace(/^[\s]*[-*+]\s+/gm, '')
      // Ordered lists
      .replace(/^[\s]*\d+\.\s+/gm, '')
      // Horizontal rules
      .replace(/^[-*_]{3,}\s*$/gm, '')
      // Table separators
      .replace(/^\|?[-:| ]+\|?$/gm, '')
      // Table pipes (keep cell content)
      .replace(/\|/g, ' ')
      // HTML tags
      .replace(/<[^>]*>/g, '')
      // Collapse multiple whitespace
      .replace(/\n{3,}/g, '\n\n')
      .replace(/ {2,}/g, ' ')
      .trim()
  );
}
