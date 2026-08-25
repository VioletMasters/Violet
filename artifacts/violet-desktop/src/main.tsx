import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './App.css';

type ErrorBoundaryState = { hasError: boolean };

class DesktopErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Violet Enterprise frontend failed to render', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main
          style={{
            minHeight: '100vh',
            display: 'grid',
            placeItems: 'center',
            padding: '2rem',
            background: '#09090b',
            color: '#f4f4f5',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <section style={{ maxWidth: 520, textAlign: 'center' }}>
            <h1 style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>
              Violet Enterprise could not load
            </h1>
            <p style={{ color: '#a1a1aa', lineHeight: 1.6 }}>
              The desktop interface encountered an unexpected error. Close and
              reopen Violet, then try again.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                marginTop: '1rem',
                border: 0,
                borderRadius: 8,
                padding: '0.65rem 1rem',
                background: '#7c3aed',
                color: 'white',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DesktopErrorBoundary>
      <App />
    </DesktopErrorBoundary>
  </React.StrictMode>,
);
