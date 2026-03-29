import { Box, Typography, IconButton } from "@mui/material";
import { ContentCopy, Check } from "@mui/icons-material";
import ReactMarkdown, { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useState } from "react";
import { useTheme, alpha } from "@mui/material/styles";

interface MarkdownProps {
  children: string;
  fontSize?: number;
}

const CopyButton: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy!", err);
    }
  };

  return (
    <IconButton
      onClick={(): void => {
        void handleCopy();
      }}
      size="small"
      className="copy-button"
      sx={{
        position: "absolute",
        top: 8,
        right: 8,
        opacity: 0,
        transition: "opacity 0.2s",
        color: (theme) => (theme.palette.mode === "dark" ? "rgba(255, 255, 255, 0.6)" : "rgba(0, 0, 0, 0.5)"),
        "&:hover": {
          color: (theme) => (theme.palette.mode === "dark" ? "white" : "black"),
          backgroundColor: (theme) =>
            theme.palette.mode === "dark" ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
        },
        zIndex: 1,
      }}>
      {copied ? <Check fontSize="small" /> : <ContentCopy fontSize="small" />}
    </IconButton>
  );
};

const MarkdownWithCode: React.FC<MarkdownProps> = ({ children, fontSize = 16 }) => {
  const theme = useTheme();
  const markdownComponents: Components = {
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
        sx={{ fontWeight: "bold", mt: 2, mb: 1, fontSize: `${fontSize * 1.5}px` }}>
        {children}
      </Typography>
    ),
    h2: ({ children }) => (
      <Typography
        variant="h6"
        sx={{ fontWeight: "bold", mt: 1.5, mb: 1, fontSize: `${fontSize * 1.3}px` }}>
        {children}
      </Typography>
    ),
    h3: ({ children }) => (
      <Typography
        variant="subtitle1"
        sx={{ fontWeight: "bold", mt: 1, mb: 0.5, fontSize: `${fontSize * 1.1}px` }}>
        {children}
      </Typography>
    ),
    li: ({ children }) => (
      <li style={{ marginBottom: "0.25em", lineHeight: 1.4, fontSize: `${fontSize}px` }}>
        <Typography
          variant="body2"
          component="span"
          sx={{ fontSize: "inherit" }}>
          {children}
        </Typography>
      </li>
    ),

    code({
      inline,
      className,
      children,
      ...props
    }: React.ComponentPropsWithoutRef<"code"> & { inline?: boolean }): React.ReactElement {
      const match = /language-(\w+)/.exec(className ?? "");
      const codeString = String(children).replace(/\n$/, "");
      return !inline && match ? (
        <Box
          sx={{
            position: "relative",
            overflowX: "auto",
            my: 1,
            fontSize: `${Math.max(12, fontSize - 2)}px`,
            borderRadius: 1,
            "&:hover .copy-button": { opacity: 1 },
          }}>
          <CopyButton text={codeString} />
          <SyntaxHighlighter
            language={match[1]}
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
            style={(theme.palette.mode === "dark" ? oneDark : oneLight) as any}
            PreTag="div"
            customStyle={{
              whiteSpace: "pre",
              padding: "1em",
              margin: 0,
              lineHeight: "1.4",
            }}
            wrapLongLines={false}
            {...props}>
            {codeString}
          </SyntaxHighlighter>
        </Box>
      ) : (
        <code
          className={className}
          style={{
            backgroundColor: theme.palette.mode === "dark" ? "#333" : alpha(theme.palette.primary.main, 0.08),
            color: theme.palette.mode === "dark" ? "#e0e0e0" : theme.palette.primary.main,
            padding: "0.2em 0.4em",
            borderRadius: 4,
            fontSize: `${Math.max(12, fontSize - 2)}px`,
          }}
          {...props}>
          {children}
        </code>
      );
    },
  };

  return (
    <Box sx={{ wordBreak: "break-word" }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={markdownComponents}>
        {children}
      </ReactMarkdown>
    </Box>
  );
};

export default MarkdownWithCode;
