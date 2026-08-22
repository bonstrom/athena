const React = require('react');

const SyntaxHighlighter = Object.assign(
  ({ children, language }) => React.createElement('pre', { 'data-testid': 'syntax-highlighter', 'data-language': language }, children),
  { registerLanguage: () => {}, alias: () => {} },
);

module.exports = {
  PrismLight: SyntaxHighlighter,
  Prism: SyntaxHighlighter,
  default: SyntaxHighlighter,
};
