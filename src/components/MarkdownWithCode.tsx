import { Box, Typography, IconButton, ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material';
import { ContentCopy, Check, LightMode, DarkMode, CheckBoxOutlineBlank, Edit } from '@mui/icons-material';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
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
import c from 'react-syntax-highlighter/dist/esm/languages/prism/c';
import cpp from 'react-syntax-highlighter/dist/esm/languages/prism/cpp';
import objectivec from 'react-syntax-highlighter/dist/esm/languages/prism/objectivec';
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml';
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown';
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx';
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx';
import { useState, useEffect, useRef, CSSProperties, useMemo, memo, Children } from 'react';
import { useTheme, alpha } from '@mui/material/styles';
import DOMPurify from 'dompurify';
import { useAuthStore } from '../store/AuthStore';

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
SyntaxHighlighter.registerLanguage('c', c);
SyntaxHighlighter.registerLanguage('cpp', cpp);
SyntaxHighlighter.registerLanguage('objectivec', objectivec);
SyntaxHighlighter.alias('cpp', 'c++');
SyntaxHighlighter.alias('objectivec', 'objective-c');
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
  disableMermaid?: boolean;
  disableSvg?: boolean;
  onEditSvg?: (svgSource: string) => void;
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
          backgroundColor: (theme) =>
            theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
        },
        zIndex: 1,
      }}>
      {copied ? <Check fontSize="small" /> : <ContentCopy fontSize="small" />}
    </IconButton>
  );
};

interface MermaidProps {
  children: string;
}

const MERMAID_DEBOUNCE_MS = 300;

const MermaidDiagram: React.FC<MermaidProps> = ({ children }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const themeMode = useAuthStore((s) => s.themeMode);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;

    const renderDiagram = async (): Promise<void> => {
      try {
        const { default: mermaid } = await import('mermaid');
        mermaid.initialize({
          startOnLoad: false,
          theme: themeMode === 'dark' ? 'dark' : 'default',
          securityLevel: 'loose',
        });
        const id = `mermaid-${crypto.randomUUID()}`;
        const { svg } = await mermaid.render(id, children.trim());
        if (cancelled) return;
        container.innerHTML = sanitizeSvg(svg);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to render diagram');
      }
    };

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      void renderDiagram();
    }, MERMAID_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [children, themeMode]);

  if (error) {
    return (
      <Box
        sx={{
          my: 1,
          p: 2,
          border: '1px solid',
          borderColor: 'error.main',
          borderRadius: 1,
          backgroundColor: 'error.dark',
          color: 'error.contrastText',
          fontSize: '0.875rem',
          fontFamily: 'monospace',
        }}>
        {error}
      </Box>
    );
  }

  return (
    <Box
      ref={containerRef}
      sx={{
        my: 2,
        display: 'flex',
        justifyContent: 'center',
        '& svg': {
          maxWidth: '100%',
          height: 'auto',
        },
      }}
    />
  );
};

const SVG_SANITIZE_CONFIG: DOMPurify.Config = {
  ADD_TAGS: [
    'svg',
    'circle',
    'rect',
    'path',
    'line',
    'polygon',
    'polyline',
    'ellipse',
    'text',
    'tspan',
    'g',
    'defs',
    'linearGradient',
    'radialGradient',
    'stop',
    'use',
    'clipPath',
    'mask',
    'pattern',
    'symbol',
    'marker',
    'animate',
    'animateTransform',
    'animateMotion',
    'filter',
    'feGaussianBlur',
    'feOffset',
    'feMerge',
    'feMergeNode',
    'feColorMatrix',
    'feBlend',
    'image',
    'foreignObject',
    'switch',
    'title',
    'desc',
    'metadata',
    'style',
  ],
  ADD_ATTR: [
    'd',
    'cx',
    'cy',
    'r',
    'rx',
    'ry',
    'x',
    'y',
    'x1',
    'x2',
    'y1',
    'y2',
    'width',
    'height',
    'viewBox',
    'fill',
    'stroke',
    'stroke-width',
    'stroke-linecap',
    'stroke-linejoin',
    'stroke-dasharray',
    'opacity',
    'transform',
    'dx',
    'dy',
    'text-anchor',
    'font-size',
    'font-family',
    'font-weight',
    'font-style',
    'text-decoration',
    'dominant-baseline',
    'alignment-baseline',
    'clip-path',
    'clip-rule',
    'fill-rule',
    'fill-opacity',
    'stroke-opacity',
    'marker-end',
    'marker-start',
    'marker-mid',
    'filter',
    'offset',
    'stdDeviation',
    'in',
    'in2',
    'mode',
    'result',
    'values',
    'keyTimes',
    'keySplines',
    'repeatCount',
    'begin',
    'dur',
    'attributeName',
    'from',
    'to',
    'gradientUnits',
    'gradientTransform',
    'xlink:href',
    'href',
    'style',
    'class',
    'id',
    'vector-effect',
    'shape-rendering',
    'text-rendering',
  ],
  // Allow sanitizing (rather than dropping) HTML content inside
  // <foreignObject> — mermaid renders flowchart labels there. Content is
  // still sanitized under normal HTML rules (scripts, on* handlers, etc.
  // are stripped), so this remains safe.
  HTML_INTEGRATION_POINTS: { 'annotation-xml': true, foreignobject: true },
};

function sanitizeSvg(svg: string): string {
  return DOMPurify.sanitize(svg, SVG_SANITIZE_CONFIG);
}

type SvgBackground = 'light' | 'dark' | 'transparent';

const SVG_BACKGROUND_COLORS: Record<SvgBackground, string> = {
  light: '#ffffff',
  dark: '#1e1e1e',
  transparent: 'transparent',
};

interface SvgDiagramProps {
  children: string;
  onEditSvg?: (svgSource: string) => void;
}

const SvgDiagram: React.FC<SvgDiagramProps> = ({ children, onEditSvg }) => {
  const [background, setBackground] = useState<SvgBackground>('transparent');

  const sanitized = useMemo(() => sanitizeSvg(children.trim()), [children]);

  const handleBackgroundChange = (_event: React.MouseEvent<HTMLElement>, value: SvgBackground | null): void => {
    if (value !== null) {
      setBackground(value);
    }
  };

  return (
    <Box sx={{ my: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
        <ToggleButtonGroup
          value={background}
          exclusive
          size="small"
          onChange={handleBackgroundChange}>
          <Tooltip title="Light background">
            <ToggleButton
              value="light"
              aria-label="Light background">
              <LightMode fontSize="small" />
            </ToggleButton>
          </Tooltip>
          <Tooltip title="Dark background">
            <ToggleButton
              value="dark"
              aria-label="Dark background">
              <DarkMode fontSize="small" />
            </ToggleButton>
          </Tooltip>
          <Tooltip title="Transparent background">
            <ToggleButton
              value="transparent"
              aria-label="Transparent background">
              <CheckBoxOutlineBlank fontSize="small" />
            </ToggleButton>
          </Tooltip>
        </ToggleButtonGroup>
        {onEditSvg && (
          <Tooltip title="Edit with AI">
            <IconButton
              size="small"
              aria-label="Edit SVG"
              onClick={(): void => onEditSvg(children.trim())}
              sx={{
                color: 'text.secondary',
                '&:hover': {
                  bgcolor: (theme) =>
                    theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                },
              }}>
              <Edit fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
      <Box
        dangerouslySetInnerHTML={{ __html: sanitized }}
        sx={{
          display: 'flex',
          justifyContent: 'center',
          '& svg': {
            maxWidth: '100%',
            height: 'auto',
            backgroundColor: SVG_BACKGROUND_COLORS[background],
            borderRadius: 1,
          },
        }}
      />
    </Box>
  );
};

/**
 * A parsed code-fence marker (``` or ~~~).
 */
interface FenceMarker {
  char: '`' | '~';
  length: number;
  info: string;
}

function parseFenceMarker(trimmed: string): FenceMarker | null {
  const match = /^(`{3,}|~{3,})(.*)$/.exec(trimmed);
  if (!match) return null;
  const marker = match[1];
  return { char: marker[0] as '`' | '~', length: marker.length, info: match[2].trim() };
}

function isOpeningFence(marker: FenceMarker): boolean {
  // A backtick fence's info string must not contain a backtick (CommonMark).
  return marker.char === '~' || !marker.info.includes('`');
}

function isClosingFence(marker: FenceMarker, open: FenceMarker): boolean {
  return marker.char === open.char && marker.length >= open.length && marker.info === '';
}

/**
 * Escapes $ signs that appear to be currency markers (followed by a digit)
 * so remark-math doesn't misinterpret them as inline math delimiters.
 * Inline code spans (`...`) are left untouched because a backslash there is
 * a literal, not an escape. A $ that is part of a $$ display-math delimiter
 * or already escaped is also left alone, so display math like $$2x = 4$$
 * starting with a digit still renders correctly.
 */
function escapeCurrencyInProse(text: string): string {
  return text.replace(/(`+)[\s\S]*?\1|(?<![$\\])\$(?=\d)/g, (match: string, backticks: string | undefined): string =>
    backticks ? match : '\\$',
  );
}

/**
 * Preprocesses markdown before parsing:
 *
 * 1. Balances fenced code blocks (``` and ~~~) using CommonMark matching
 *    (same char, closing length >= opening length), so an unclosed fence
 *    can't swallow the rest of the message as a code block.
 * 2. Auto-closes a ```svg fence right after its </svg> tag so trailing
 *    markdown renders normally (searches the whole document for a real
 *    closing fence rather than a fixed window).
 * 3. Escapes currency-style $ (followed by a digit) only outside code fences
 *    and inline code spans.
 */
function preprocessMarkdown(content: string): string {
  const lines = content.split('\n');
  const result: string[] = [];
  const openFences: FenceMarker[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (openFences.length > 0) {
      const open = openFences[openFences.length - 1];
      const marker = parseFenceMarker(trimmed);

      if (marker && isClosingFence(marker, open)) {
        openFences.pop();
        result.push(line);
        continue;
      }

      const isSvgFence = open.char === '`' && open.info.toLowerCase() === 'svg';
      if (isSvgFence && trimmed.endsWith('</svg>')) {
        const hasCloseAhead = lines.slice(i + 1).some((l) => {
          const next = parseFenceMarker(l.trim());
          return next !== null && isClosingFence(next, open);
        });
        result.push(line);
        if (!hasCloseAhead) {
          result.push(open.char.repeat(open.length));
          openFences.pop();
        }
        continue;
      }

      result.push(line);
      continue;
    }

    const marker = parseFenceMarker(trimmed);
    if (marker && isOpeningFence(marker)) {
      openFences.push(marker);
      result.push(line);
      continue;
    }

    result.push(escapeCurrencyInProse(line));
  }

  while (openFences.length > 0) {
    const open = openFences.pop();
    if (open) {
      result.push(open.char.repeat(open.length));
    }
  }

  return result.join('\n');
}

const MarkdownWithCode: React.FC<MarkdownProps> = memo(function MarkdownWithCode({
  children,
  fontSize = 16,
  disableMermaid = false,
  disableSvg = false,
  onEditSvg,
}) {
  const theme = useTheme();
  const markdownComponents: Components = useMemo(
    () => ({
      p: ({ children }) => (
        <Typography
          variant="body2"
          sx={{ lineHeight: 1.4, mb: 1, fontSize: `${fontSize}px` }}
          component="p">
          {children}
        </Typography>
      ),
      h1: ({ children }) => (
        <Typography
          variant="h5"
          sx={{ fontWeight: 'bold', mt: 2, mb: 1, fontSize: `${fontSize * 1.5}px` }}>
          {children}
        </Typography>
      ),
      h2: ({ children }) => (
        <Typography
          variant="h6"
          sx={{ fontWeight: 'bold', mt: 1.5, mb: 1, fontSize: `${fontSize * 1.3}px` }}>
          {children}
        </Typography>
      ),
      h3: ({ children }) => (
        <Typography
          variant="subtitle1"
          sx={{ fontWeight: 'bold', mt: 1, mb: 0.5, fontSize: `${fontSize * 1.1}px` }}>
          {children}
        </Typography>
      ),
      li: ({ children }) => (
        <li style={{ marginBottom: '0.25em', lineHeight: 1.4, fontSize: `${fontSize}px` }}>
          <Typography
            variant="body2"
            component="span"
            sx={{ fontSize: 'inherit' }}>
            {children}
          </Typography>
        </li>
      ),

      pre({ children }: React.ComponentPropsWithoutRef<'pre'>): React.ReactElement {
        const codeElement = Children.only(children) as React.ReactElement<{
          className?: string;
          children?: React.ReactNode;
        }>;
        const className = codeElement.props.className ?? '';
        const match = /language-([\w+-]+)/.exec(className);
        const language = match ? match[1] : '';
        const codeString = String(codeElement.props.children ?? '').replace(/\n$/, '');

        if (language === 'mermaid' && !disableMermaid) {
          return <MermaidDiagram key={codeString}>{codeString}</MermaidDiagram>;
        }
        if (language === 'svg' && !disableSvg) {
          return (
            <SvgDiagram
              key={codeString}
              onEditSvg={onEditSvg}>
              {codeString}
            </SvgDiagram>
          );
        }

        const darkSyntaxStyle: Record<string, CSSProperties> = {
          ...oneDark,
          comment: { ...oneDark.comment, color: '#7f8ea3' },
          'block-comment': { ...oneDark['block-comment'], color: '#7f8ea3' },
          prolog: { ...oneDark.prolog, color: '#7f8ea3' },
        };
        const lightSyntaxStyle = oneLight as Record<string, CSSProperties>;
        const syntaxStyle: Record<string, CSSProperties> =
          theme.palette.mode === 'dark' ? darkSyntaxStyle : lightSyntaxStyle;

        return (
          <Box
            sx={{
              position: 'relative',
              overflowX: 'auto',
              my: 1,
              fontSize: `${Math.max(12, fontSize - 2)}px`,
              borderRadius: 1,
              '&:hover .copy-button': { opacity: 1 },
            }}>
            <CopyButton text={codeString} />
            {language ? (
              <SyntaxHighlighter
                language={language}
                style={syntaxStyle}
                PreTag="div"
                customStyle={{
                  whiteSpace: 'pre',
                  padding: '1em',
                  margin: 0,
                  lineHeight: '1.4',
                }}
                wrapLongLines={false}>
                {codeString}
              </SyntaxHighlighter>
            ) : (
              <Box
                component="pre"
                sx={{
                  whiteSpace: 'pre',
                  overflowX: 'auto',
                  padding: '1em',
                  margin: 0,
                  lineHeight: '1.4',
                  fontFamily: 'monospace',
                  backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
                }}>
                {codeString}
              </Box>
            )}
          </Box>
        );
      },

      code({
        className,
        children,
        node: _node,
        ...props
      }: React.ComponentPropsWithoutRef<'code'> & { node?: unknown }): React.ReactElement {
        return (
          <code
            className={className}
            style={{
              backgroundColor: theme.palette.mode === 'dark' ? '#333' : alpha(theme.palette.primary.main, 0.08),
              color: theme.palette.mode === 'dark' ? '#e0e0e0' : theme.palette.primary.main,
              padding: '0.2em 0.4em',
              borderRadius: 4,
              fontSize: `${Math.max(12, fontSize - 2)}px`,
            }}
            {...props}>
            {children}
          </code>
        );
      },
    }),
    [fontSize, theme.palette.mode, theme.palette.primary.main, onEditSvg, disableMermaid, disableSvg],
  );

  return (
    <Box sx={{ overflowWrap: 'break-word', wordBreak: 'normal' }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={markdownComponents}>
        {preprocessMarkdown(children)}
      </ReactMarkdown>
    </Box>
  );
});

export default MarkdownWithCode;
