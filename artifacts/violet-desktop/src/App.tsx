import { useEffect, useRef, useState } from 'react';

const isTauri = typeof (window as any).__TAURI_INTERNALS__ !== 'undefined';
const STORE_FILE = 'violet-config.json';
const SERVER_URL_KEY = 'server_url';
const MODE_KEY = 'violet_mode';
const CLOUD_URL = 'https://Violetsolutions.replit.app';

type Mode = 'hosted' | 'host' | 'client';
type StoredMode = Mode | 'cloud' | 'managed-host' | 'external-host';
type Phase = 'checking' | 'choose' | 'details' | 'starting' | 'connecting';
type DockerStatus = { available: boolean; composeAvailable: boolean; message: string };

async function storeValue<T>(key: string): Promise<T | null> {
  if (!isTauri) return null;
  try {
    const { load } = await import('@tauri-apps/plugin-store');
    const store = await load(STORE_FILE);
    return (await store.get<T>(key)) ?? null;
  } catch {
    return null;
  }
}

async function saveConfig(mode: Mode, url: string) {
  if (!isTauri) return;
  const { load } = await import('@tauri-apps/plugin-store');
  const store = await load(STORE_FILE);
  await store.set(MODE_KEY, mode);
  await store.set(SERVER_URL_KEY, url);
  await store.save();
}

async function goTo(url: string) {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('navigate_to', { url });
  } else {
    window.location.replace(url);
  }
}

function normaliseUrl(raw: string) {
  let value = raw.trim().replace(/\/+$/, '');
  if (value && !/^https?:\/\//i.test(value)) value = `http://${value}`;
  return value;
}

function normaliseStoredMode(mode: StoredMode | null): Mode | null {
  if (mode === 'hosted' || mode === 'cloud') return 'hosted';
  if (mode === 'host' || mode === 'managed-host') return 'host';
  if (mode === 'client' || mode === 'external-host') return 'client';
  return null;
}

function loginUrl(url: string) {
  const parsed = new URL(url);
  parsed.pathname = `${parsed.pathname.replace(/\/+$/, '')}/login`;
  return parsed.toString().replace(/\/login\/$/, '/login');
}

export default function App() {
  const [phase, setPhase] = useState<Phase>('checking');
  const [mode, setMode] = useState<Mode | null>(null);
  const [url, setUrl] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [docker, setDocker] = useState<DockerStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const choose = () => {
    setPhase('choose');
    setMode(null);
    setError(null);
  };

  useEffect(() => {
    (window as any).__violet_show_setup = choose;
  }, []);

  useEffect(() => {
    const forced = new URLSearchParams(window.location.search).has('reconfigure');
    Promise.all([storeValue<StoredMode>(MODE_KEY), storeValue<string>(SERVER_URL_KEY)]).then(([storedMode, savedUrl]) => {
      const savedMode = normaliseStoredMode(storedMode);
      if (!forced && savedMode && savedUrl) {
        setMode(savedMode);
        setUrl(savedUrl);
        if (savedMode === 'host' && isTauri) {
          setPhase('starting');
          import('@tauri-apps/api/core')
            .then(({ invoke }) => invoke<{ url: string }>('resume_managed_host'))
            .then((host) => {
              setUrl(host.url);
              setPhase('connecting');
              return goTo(loginUrl(host.url));
            })
            .catch((reason) => {
              setPhase('details');
              setError(typeof reason === 'string' ? reason : 'Could not resume the Store Host.');
              import('@tauri-apps/api/core')
                .then(({ invoke }) => invoke<DockerStatus>('get_docker_status').then(setDocker))
                .catch(() => undefined);
            });
        } else {
          setPhase('connecting');
          goTo(loginUrl(savedUrl)).catch(() => {
            setError(`Could not connect to ${savedUrl}.`);
            setPhase('choose');
          });
        }
      } else {
        setPhase('choose');
      }
    });
  }, []);

  const selectMode = async (selected: Mode) => {
    setMode(selected);
    setError(null);
    if (selected === 'hosted') {
      return connect(selected, CLOUD_URL);
    }
    if (selected === 'host') {
      setPhase('details');
      if (isTauri) {
        import('@tauri-apps/api/core')
          .then(({ invoke }) => invoke<DockerStatus>('get_docker_status').then(setDocker))
          .catch(() => undefined);
      }
      setTimeout(() => inputRef.current?.focus(), 10);
      return;
    }
    if (selected === 'client') {
      setPhase('details');
      setTimeout(() => inputRef.current?.focus(), 10);
      return;
    }
  };

  const connect = async (m: Mode, targetUrl: string) => {
    setPhase('connecting');
    setUrl(targetUrl);
    await saveConfig(m, targetUrl);
    await goTo(loginUrl(targetUrl)).catch(() => {
      setPhase('details');
      setError(`Could not open ${targetUrl}`);
    });
  };

  const startHost = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isTauri) return;
    setPhase('starting');
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const host = await invoke<{ url: string }>('start_managed_host', {
        adminEmail: email,
        adminPassword: password,
      });
      await connect('host', host.url);
    } catch (reason) {
      setPhase('details');
      setError(typeof reason === 'string' ? reason : 'Could not start the Store Host.');
    }
  };

  const retryHost = async () => {
    setError(null);
    if (!isTauri) return;
    setPhase('starting');
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const host = await invoke<{ url: string }>('retry_managed_host');
      await connect('host', host.url);
    } catch (reason) {
      setPhase('details');
      setError(typeof reason === 'string' ? reason : 'Could not retry starting the Store Host.');
    }
  };

  const resetHost = async () => {
    if (!confirm('This will permanently delete all store data on this computer. Continue?')) return;
    setError(null);
    if (!isTauri) return;
    setPhase('starting');
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('reset_managed_host');
      setPhase('details');
      setError('Local data has been reset. You can now rebuild the Store Host.');
    } catch (reason) {
      setPhase('details');
      setError(typeof reason === 'string' ? reason : 'Could not reset the Store Host.');
    }
  };

  const submitClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const target = normaliseUrl(url);
    if (!target) return;
    setPhase('connecting');
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const parsed = new URL(target);
      if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
        throw new Error();
      }
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${target}/api/healthz`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      const health = await res.json().catch(() => null) as { status?: unknown } | null;
      if (!res.ok || health?.status !== 'ok') throw new Error();
      await connect('client', target);
    } catch {
      setPhase('details');
      setError(`Could not connect to ${target}. Verify the address and that the server is running.`);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  };

  if (phase === 'checking') return <main className="loading" aria-label="Opening Violet Enterprise" />;
  if (phase === 'connecting' || phase === 'starting') {
    return <Loading phase={phase} url={url} onCancel={choose} />;
  }

  if (phase === 'choose') {
    return (
      <Shell>
        <h1>Set up Violet</h1>
        <p>Choose how this desktop will use Violet. You can change this any time from <b>Configure Server</b>.</p>
        <div className="mode-grid">
          <ModeCard
            title="Hosted Violet"
            text="Use Violet's hosted cloud service."
            onClick={() => selectMode('hosted')}
          />
          <ModeCard
            title="Start locally"
            text="Run the Free version on this desktop, even without internet."
            onClick={() => selectMode('host')}
          />
          <ModeCard
            title="Store Client"
            text="Connect this register to an existing Store Host on your network."
            onClick={() => selectMode('client')}
          />
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <button type="button" className="back" onClick={choose}>
        ← All modes
      </button>
      <h1>{mode === 'host' ? 'Start locally' : 'Connect this Store Client'}</h1>

      {mode === 'host' ? (
        <form onSubmit={startHost}>
          <p>
            Docker Desktop runs the Free version of Violet locally. Your store's data persists on this computer,
            and the POS keeps working when the internet is unavailable. If these credentials belong to a paid
            hosted Violet account, that plan is applied only after the local sign-in can validate it online.
          </p>
          {docker && (
            <p className={docker.available && docker.composeAvailable ? 'notice good' : 'notice bad'}>
              {docker.message}
            </p>
          )}
          <label>
            Local admin email
            <input
              ref={inputRef}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
            />
          </label>
          <label>
            Local admin password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </label>
          {error && (
            <>
              <ErrorNotice text={error} />
              <button type="button" className="secondary" onClick={retryHost}>
                Retry existing Store Host
              </button>
              <button type="button" className="secondary danger" onClick={resetHost}>
                Reset local data and rebuild
              </button>
            </>
          )}
          <button disabled={!!docker && (!docker.available || !docker.composeAvailable)}>
            {error ? 'Rebuild locally' : 'Start locally (Free)'}
          </button>
        </form>
      ) : (
        <form onSubmit={submitClient}>
          <p>
            Ask your store administrator for the Store Host address. HTTP is suitable for a trusted LAN; use HTTPS for internet-facing hosts.
          </p>
          <label>
            Server address
            <input
              ref={inputRef}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://192.168.1.10"
              required
              autoComplete="url"
            />
          </label>
          {error && <ErrorNotice text={error} />}
          <button>Connect</button>
        </form>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main>
      <section>
        <Logo />
        {children}
        <small>{!isTauri && 'Browser preview mode \u00b7 '}Violet Enterprise Desktop</small>
      </section>
    </main>
  );
}

function ModeCard({ title, text, onClick }: { title: string; text: string; onClick: () => void }) {
  return (
    <button type="button" className="mode" onClick={onClick}>
      <strong>{title}</strong>
      <span>{text}</span>
    </button>
  );
}

function ErrorNotice({ text }: { text: string }) {
  return <p className="notice bad diagnostic">{text}</p>;
}

function Loading({ phase, url, onCancel }: { phase: Phase; url: string; onCancel: () => void }) {
  return (
    <main>
      <section className="loading">
        <Logo />
        <i />
        <h1>{phase === 'starting' ? 'Starting Store Host\u2026' : 'Connecting\u2026'}</h1>
        <p>
          {phase === 'starting'
            ? 'Docker is building Violet. This can take a few minutes on first setup.'
            : `Opening ${url}`}
        </p>
        <button type="button" className="link" onClick={onCancel}>
          Cancel / change mode
        </button>
      </section>
    </main>
  );
}

function Logo() {
  return (
    <div className="logo">
      <b></b>
      <strong>Violet Enterprise</strong>
    </div>
  );
}
