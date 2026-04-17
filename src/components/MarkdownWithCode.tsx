import { Box, Typography, IconButton } from '@mui/material';
import { ContentCopy, Check } from '@mui/icons-material';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css';
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup';
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java';
import csharp from 'react-syntax-highlighter/dist/esm/languages/prism/csharp';
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml';
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown';
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx';
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx';
import { useState, useEffect, useRef, CSSProperties } from 'react';
import { useTheme, alpha } from '@mui/material/styles';

SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('js', javascript);
SyntaxHighlighter.registerLanguage('typescript', typescript);
SyntaxHighlighter.registerLanguage('ts', typescript);
SyntaxHighlighter.registerLanguage('python', python);
SyntaxHighlighter.registerLanguage('json', json);
SyntaxHighlighter.registerLanguage('bash', bash);
SyntaxHighlighter.registerLanguage('shell', bash);
SyntaxHighlighter.registerLanguage('css', css);
SyntaxHighlighter.registerLanguage('html', markup);
SyntaxHighlighter.registerLanguage('xml', markup);
SyntaxHighlighter.registerLanguage('java', java);
SyntaxHighlighter.registerLanguage('csharp', csharp);
SyntaxHighlighter.registerLanguage('sql', sql);
SyntaxHighlighter.registerLanguage('yaml', yaml);
SyntaxHighlighter.registerLanguage('yml', yaml);
SyntaxHighlighter.registerLanguage('markdown', markdown);
SyntaxHighlighter.registerLanguage('md', markdown);
SyntaxHighlighter.registerLanguage('jsx', jsx);
SyntaxHighlighter.registerLanguage('tsx', tsx);

interface MarkdownProps {
  children: string;
  fontSize?: number;
}

const CopyButton: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => (): void => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy!', err);
    }
  };

  return (
    <IconButton
      onClick={(): void => {
        void handleCopy();
      }}
      size="small"
      aria-label={copied ? 'Copied!' : 'Copy code to clipboard'}
      className="copy-button"
      sx={{
        position: 'absolute',
        top: 8,
        right: 8,
        opacity: 0,
        transition: 'opacity 0.2s',
        color: (theme) => (theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.5)'),
        '&:hover': {
          color: (theme) => (theme.palette.mode === 'dark' ? 'white' : 'black'),
          backgroundColor: (theme) => (theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'),
        },
        zIndex: 1,
      }}
    >
      {copied ? <Check fontSize="small" /> : <ContentCopy fontSize="small" />}
    </IconButton>
  );
};

const MarkdownWithCode: React.FC<MarkdownProps> = ({ children, fontSize = 16 }) => {
  const theme = useTheme();
  const markdownComponents: Components = {
    p: ({ children }) => (
      <Typography variant="body2" sx={{ lineHeight: 1.4, mb: 1, fontSize: `${fontSize}px` }} component="p">
        {children}
      </Typography>
    ),
    h1: ({ children }) => (
      <Typography variant="h5" sx={{ fontWeight: 'bold', mt: 2, mb: 1, fontSize: `${fontSize * 1.5}px` }}>
        {children}
      </Typography>
    ),
    h2: ({ children }) => (
      <Typography variant="h6" sx={{ fontWeight: 'bold', mt: 1.5, mb: 1, fontSize: `${fontSize * 1.3}px` }}>
        {children}
      </Typography>
    ),
    h3: ({ children }) => (
      <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mt: 1, mb: 0.5, fontSize: `${fontSize * 1.1}px` }}>
        {children}
      </Typography>
    ),
    li: ({ children }) => (
      <li style={{ marginBottom: '0.25em', lineHeight: 1.4, fontSize: `${fontSize}px` }}>
        <Typography variant="body2" component="span" sx={{ fontSize: 'inherit' }}>
          {children}
        </Typography>
      </li>
    ),

    code({
      inline,
      className,
      children,
      style: _inlineCodeStyle,
      ...props
    }: React.ComponentPropsWithoutRef<'code'> & { inline?: boolean }): React.ReactElement {
      const match = /language-(\w+)/.exec(className ?? '');
      const codeString = String(children).replace(/\n$/, '');
      const darkSyntaxStyle: Record<string, CSSProperties> = {
        ...oneDark,
        comment: { ...oneDark.comment, color: '#7f8ea3' },
        'block-comment': { ...oneDark['block-comment'], color: '#7f8ea3' },
        prolog: { ...oneDark.prolog, color: '#7f8ea3' },
      };
      const lightSyntaxStyle = oneLight as Record<string, CSSProperties>;
      const syntaxStyle: Record<string, CSSProperties> = theme.palette.mode === 'dark' ? darkSyntaxStyle : lightSyntaxStyle;
      return !inline && match ? (
        <Box
          sx={{
            position: 'relative',
            overflowX: 'auto',
            my: 1,
            fontSize: `${Math.max(12, fontSize - 2)}px`,
            borderRadius: 1,
            '&:hover .copy-button': { opacity: 1 },
          }}
        >
          <CopyButton text={codeString} />
          <SyntaxHighlighter
            language={match[1]}
            style={syntaxStyle}
            PreTag="div"
            customStyle={{
              whiteSpace: 'pre',
              padding: '1em',
              margin: 0,
              lineHeight: '1.4',
            }}
            wrapLongLines={false}
            {...props}
          >
            {codeString}
          </SyntaxHighlighter>
        </Box>
      ) : (
        <code
          className={className}
          style={{
            backgroundColor: theme.palette.mode === 'dark' ? '#333' : alpha(theme.palette.primary.main, 0.08),
            color: theme.palette.mode === 'dark' ? '#e0e0e0' : theme.palette.primary.main,
            padding: '0.2em 0.4em',
            borderRadius: 4,
            fontSize: `${Math.max(12, fontSize - 2)}px`,
          }}
          {...props}
        >
          {children}
        </code>
      );
    },
  };

  return (
    <Box sx={{ wordBreak: 'break-word' }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {children}
      </ReactMarkdown>
    </Box>
  );
};

export default MarkdownWithCode;
