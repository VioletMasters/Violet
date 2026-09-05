import { useEffect, useState } from 'react';

const PUBLISHED_SERVER_URL = 'https://Violetsolutions.replit.app';
const isTauri = typeof (window as any).__TAURI_INTERNALS__ !== 'undefined';

/**
 * Violet Enterprise is a hosted browser shell.
 *
 * The published server is the only destination by design. There is no address
 * bar, search field, Store Host setup, or Docker dependency in this app.
 */
export default function App() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function openPublishedServer() {
      try {
        if (isTauri) {
          const { invoke } = await import('@tauri-apps/api/core');
          await invoke('navigate_to', { url: PUBLISHED_SERVER_URL });
        } else {
          window.location.replace(PUBLISHED_SERVER_URL);
        }
      } catch (reason) {
        if (!cancelled) {
          setError(typeof reason === 'string' ? reason : 'The published Violet server could not be opened.');
        }
      }
    }

    void openPublishedServer();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <main className="loading">
        <h1>Violet Enterprise</h1>
        <p>{error}</p>
        <button type="button" onClick={() => window.location.reload()}>Try again</button>
      </main>
    );
  }

  return <main className="loading" aria-label="Opening Violet Enterprise" />;
}