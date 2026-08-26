import { useState, useEffect, useRef } from 'react';

// ── Tauri environment detection ───────────────────────────────────────────────
const isTauri = typeof (window as any).__TAURI_INTERNALS__ !== 'undefined';

const STORE_FILE = 'violet-config.json';
const SERVER_URL_KEY = 'server_url';

// ── Store helpers (dynamic import so dev-in-browser never throws) ─────────────

async function loadSavedUrl(): Promise<string | null> {
  if (!isTauri) return null;
  try {
    const { Store } = await import('@tauri-apps/plugin-store');
    const store = await Store.load(STORE_FILE);
    return (await store.get<string>(SERVER_URL_KEY)) ?? null;
  } catch {
    return null;
  }
}

async function persistUrl(url: string): Promise<void> {
  if (!isTauri) return;
  const { Store } = await import('@tauri-apps/plugin-store');
  const store = await Store.load(STORE_FILE);
  await store.set(SERVER_URL_KEY, url);
  await store.save();
}

async function clearUrl(): Promise<void> {
  if (!isTauri) return;
  try {
    const { Store } = await import('@tauri-apps/plugin-store');
    const store = await Store.load(STORE_FILE);
    await store.delete(SERVER_URL_KEY);
    await store.save();
  } catch {
    /* ignore */
  }
}

// ── Navigation ────────────────────────────────────────────────────────────────

async function goTo(url: string): Promise<void> {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('navigate_to', { url });
  } else {
    window.location.href = url;
  }
}

// ── URL normalisation ─────────────────────────────────────────────────────────

function normaliseUrl(raw: string): string {
  let url = raw.trim().replace(/\/$/, '');
  if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'http://' + url;
  }
  return url;
}

function loginUrl(serverUrl: string): string {
  const parsed = new URL(serverUrl);
  const path = parsed.pathname.replace(/\/+$/, '');
  parsed.pathname = `${path}/login`;
  return parsed.toString().replace(/\/login\/$/, '/login');
}

// ── App states ────────────────────────────────────────────────────────────────

type Phase = 'checking' | 'setup' | 'connecting';

// ── Component ─────────────────────────────────────────────────────────────────

export default function App() {
  const [phase, setPhase] = useState<Phase>('checking');
  const [inputUrl, setInputUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [targetUrl, setTargetUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Expose reconfigure hook for the Tauri "Configure Server" menu item
  useEffect(() => {
    (window as any).__violet_show_setup = () => {
      setPhase('setup');
      setTargetUrl(null);
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 80);
    };
  }, []);

  // On mount: check for a persisted URL and auto-connect.
  // The ?reconfigure=1 query param is set by the Rust "Configure Server" menu item,
  // which navigates back to tauri://localhost?reconfigure=1 so this page loads
  // again even after the webview was pointing at a remote server.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const forceSetup = params.has('reconfigure');

    if (forceSetup) {
      // Pre-fill the last-used URL so the operator can edit it
      loadSavedUrl().then((saved) => {
        if (saved) setInputUrl(saved);
        setPhase('setup');
        setTimeout(() => inputRef.current?.focus(), 80);
      });
      return;
    }

    loadSavedUrl().then((saved) => {
      if (saved) {
        setTargetUrl(saved);
        setPhase('connecting');
        goTo(loginUrl(saved)).catch(() => {
          // navigate_to failed — fall back to setup
          setPhase('setup');
          setInputUrl(saved);
          setError(
            `Could not connect to ${saved}. Make sure your Violet server is running.`,
          );
          setTimeout(() => inputRef.current?.focus(), 80);
        });
      } else {
        setPhase('setup');
        setTimeout(() => inputRef.current?.focus(), 80);
      }
    });
  }, []);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = normaliseUrl(inputUrl);
    if (!url) return;

    // Basic URL validation
    try {
      new URL(url);
    } catch {
      setError('Please enter a valid address — e.g. http://192.168.1.10 or https://my.domain.com');
      return;
    }

    setError(null);
    setTargetUrl(url);
    setPhase('connecting');

    try {
      await persistUrl(url);
      await goTo(loginUrl(url));
      // If goTo resolves without navigating away (browser dev mode), stay on page
    } catch (err) {
      setPhase('setup');
      setError(
        `Could not connect to ${url}. Check that the server is running and the address is correct.`,
      );
      setTargetUrl(null);
    }
  };

  const handleReset = async () => {
    await clearUrl();
    setPhase('setup');
    setTargetUrl(null);
    setInputUrl('');
    setError(null);
    setTimeout(() => inputRef.current?.focus(), 80);
  };

  // ── Checking (initial load) ─────────────────────────────────────────────────
  if (phase === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#09090b]">
        <Spinner />
      </div>
    );
  }

  // ── Connecting ──────────────────────────────────────────────────────────────
  if (phase === 'connecting') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-[#09090b]">
        <Logo />
        <Spinner />
        <p className="text-sm text-zinc-400">Connecting to {targetUrl} …</p>
        <button
          onClick={handleReset}
          className="text-xs text-zinc-500 hover:text-zinc-300 underline underline-offset-2 transition-colors mt-2"
        >
          Cancel / change server
        </button>
      </div>
    );
  }

  // ── Setup screen ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-[#09090b]">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-10">
          <Logo size="lg" />
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 shadow-2xl backdrop-blur">
          <h1 className="text-2xl font-bold text-white mb-1 text-center">
            Connect to Violet
          </h1>
          <p className="text-sm text-zinc-400 text-center mb-8 leading-relaxed">
            Enter the address of your Violet Enterprise server — your local
            network IP (LAN) or a cloud URL.
          </p>

          <form onSubmit={handleConnect} className="space-y-4">
            <div>
              <label
                htmlFor="server-url"
                className="block text-xs font-medium text-zinc-400 mb-1.5"
              >
                Server address
              </label>
              <input
                ref={inputRef}
                id="server-url"
                type="text"
                value={inputUrl}
                onChange={(e) => {
                  setInputUrl(e.target.value);
                  setError(null);
                }}
                placeholder="192.168.1.10  or  https://pos.my-store.com"
                className="
                  w-full rounded-lg border border-zinc-700 bg-zinc-800
                  px-3.5 py-2.5 text-sm text-white placeholder-zinc-500
                  focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500
                  transition-colors
                "
                autoComplete="url"
                spellCheck={false}
              />
              {error && (
                <p className="mt-2 text-xs text-red-400 leading-snug">{error}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={!inputUrl.trim()}
              className="
                w-full rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white
                hover:bg-violet-500 active:bg-violet-700
                disabled:opacity-40 disabled:cursor-not-allowed
                transition-colors
              "
            >
              Connect
            </button>
          </form>

          {/* Hints */}
          <div className="mt-6 rounded-lg bg-zinc-800/60 p-4 space-y-1.5 text-xs text-zinc-500">
            <p className="font-medium text-zinc-400 mb-1">Where do I find my server address?</p>
            <p>• <span className="text-zinc-300">LAN / Docker</span> — run <code className="bg-zinc-700 px-1 rounded text-zinc-300">ipconfig</code> on the host machine and use its IPv4 address (e.g. 192.168.1.10).</p>
            <p>• <span className="text-zinc-300">Cloud</span> — use the domain or IP you deployed Violet to (e.g. https://pos.acme.com).</p>
          </div>
        </div>

        {/* Version / dev notice */}
        <div className="mt-6 text-center space-y-2">
          {!isTauri && (
            <p className="text-xs text-amber-500/80 bg-amber-500/10 rounded-lg px-3 py-2">
              Running in browser preview mode — store and navigation are simulated.
            </p>
          )}
          <p className="text-xs text-zinc-600">Violet Enterprise Desktop · v0.1.0</p>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const dim = size === 'lg' ? 'w-14 h-14' : 'w-10 h-10';
  const dot = size === 'lg' ? 'w-5 h-5' : 'w-3.5 h-3.5';
  const text = size === 'lg' ? 'text-2xl' : 'text-lg';
  return (
    <div className="flex items-center gap-3">
      <div
        className={`${dim} rounded-xl bg-violet-600 flex items-center justify-center shadow-lg shadow-violet-900/40`}
      >
        <div className={`${dot} rounded-full bg-white/90`} />
      </div>
      <span className={`${text} font-bold text-white tracking-tight`}>
        Violet Enterprise
      </span>
    </div>
  );
}

function Spinner() {
  return (
    <div
      className="w-8 h-8 rounded-full border-2 border-zinc-700 border-t-violet-500 animate-spin"
      aria-label="Loading"
    />
  );
}
