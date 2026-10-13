import { Component } from 'react';

/**
 * Catches a crash while rendering the page in the editor (for example a
 * change that produced data a card can't display) so the editor doesn't go
 * blank. The toolbar sits outside this boundary, and the fallback offers
 * Undo, which takes the page back to the last state that rendered.
 * The boundary resets itself whenever the page changes.
 *
 * `compact` shows a small floating notice instead of a full-page screen
 * (used around dialogs, so the page itself stays visible and usable).
 *
 * @extends {Component<{ page: object, onUndo: () => void, compact?: boolean, children: import('react').ReactNode }, { error: Error | null }>}
 */
export default class EditorErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[editor] Render error:', error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.page !== this.props.page) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.compact) {
      return (
        <div className="editor-crash editor-crash--compact" role="alert">
          <h2>That panel ran into a problem</h2>
          <p>Your page is safe. Undo the last change, or close this and try again.</p>
          <div className="button-row">
            <button type="button" className="button button--primary" onClick={this.props.onUndo}>
              Undo last change
            </button>
            <button type="button" className="button button--secondary" onClick={() => this.setState({ error: null })}>
              Close
            </button>
          </div>
        </div>
      );
    }
    return (
      <main className="layout layout--editing">
        <div className="editor-crash" role="alert">
          <h2>Something on the page can’t be shown</h2>
          <p>The last change produced something the editor couldn’t display. Your page is safe: undo the change to continue.</p>
          <div className="button-row">
            <button type="button" className="button button--primary" onClick={this.props.onUndo}>
              Undo last change
            </button>
            <button type="button" className="button button--secondary" onClick={() => window.location.reload()}>
              Reload the editor
            </button>
          </div>
        </div>
      </main>
    );
  }
}
