import { Box, Typography } from "@mui/material";
import ReactMarkdown, { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

interface MarkdownProps {
  children: string;
  fontSize?: number;
}

const MarkdownWithCode: React.FC<MarkdownProps> = ({ children, fontSize = 16 }) => {
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
      return !inline && match ? (
        <Box sx={{ overflowX: "auto", my: 1, fontSize: `${Math.max(12, fontSize - 2)}px` }}>
          <SyntaxHighlighter
            language={match[1]}
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
            style={oneDark as any}
            PreTag="div"
            customStyle={{
              whiteSpace: "pre",
              padding: "1em",
              margin: 0,
              lineHeight: "1.4",
            }}
            wrapLongLines={false}
            {...props}>
            {String(children).replace(/\n$/, "")}
          </SyntaxHighlighter>
        </Box>
      ) : (
        <code
          className={className}
          style={{
            backgroundColor: "#333",
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
