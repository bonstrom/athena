import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: "2rem",
            color: "#ff4d4f",
            background: "#f0f2f5",
            height: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}>
          <h1>Something went wrong.</h1>
          <p>The application encountered an unexpected error and has crashed.</p>
          <pre style={{ background: "#fff", padding: "1rem", borderRadius: "8px", maxWidth: "80%", overflow: "auto" }}>
            {this.state.error?.message}
          </pre>
          <button
            onClick={(): void => window.location.reload()}
            style={{
              marginTop: "1rem",
              padding: "0.5rem 1rem",
              cursor: "pointer",
              background: "#1890ff",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
            }}>
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
