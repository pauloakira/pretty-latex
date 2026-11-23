import { Component, type ErrorInfo, type ReactNode } from "react";

type State = { error: Error | null };

/**
 * Catches a render error anywhere below it. Without this, React unmounts everything and
 * the transparent window shows nothing at all; with it, the glass says what went wrong.
 */
export class CrashScreen extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="window crash" role="alert" data-tauri-drag-region>
        <p className="crash-title">pretty-latex hit an error</p>
        <pre className="crash-detail">{error.stack ?? error.message}</pre>
      </div>
    );
  }
}
