import { Component } from "react";

/**
 * Catches render errors so one broken component doesn't blank the app.
 *
 * React unmounts the whole tree when an error escapes a render, which
 * is why a single undefined property showed a white page instead of a
 * broken panel. This stops that at the boundary and shows what failed.
 */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Render error:", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="panel" style={{ margin: 24 }}>
        <h3>Something broke on this page</h3>
        <p className="notice">
          The rest of the app still works — reload to try again. If it keeps
          happening, the browser console has the details.
        </p>
        <p className="error" style={{ fontFamily: "monospace", fontSize: 13 }}>
          {this.state.error.message}
        </p>
        <button type="button" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}