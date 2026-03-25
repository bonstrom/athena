import { Box, Typography } from "@mui/material";
import ReactMarkdown, { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

const markdownComponents: Components = {
  p: ({ children }) => (
    <Typography
      variant="body2"
      sx={{ lineHeight: 1.4, mb: 1 }}
      component="p">
      {children}
    </Typography>
  ),
  li: ({ children }) => (
    <li style={{ marginBottom: "0.25em", lineHeight: 1.4 }}>
      <Typography
        variant="body2"
        component="span">
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
      <Box sx={{ overflowX: "auto", my: 1 }}>
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
        }}
        {...props}>
        {children}
      </code>
    );
  },
};

const MarkdownWithCode: React.FC<{ children: string }> = ({ children }) => (
  <Box sx={{ wordBreak: "break-word" }}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={markdownComponents}>
      {children}
    </ReactMarkdown>
  </Box>
);

export default MarkdownWithCode;
