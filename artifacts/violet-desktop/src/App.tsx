import { useEffect, useRef, useState } from 'react';

const isTauri = typeof (window as any).__TAURI_INTERNALS__ !== 'undefined';
const STORE_FILE = 'violet-config.json';
const SERVER_URL_KEY = 'server_url';
const MODE_KEY = 'violet_mode';
const CLOUD_URL = 'https://Violetsolutions.replit.app';

type Mode = 'cloud' | 'managed-host' | 'external-host' | 'client';
type Phase = 'checking' | 'choose' | 'details' | 'starting' | 'connecting';
type DockerStatus = { available: boolean; composeAvailable: boolean; message: string };

async function storeValue<T>(key: string): Promise<T | null> {
  if (!isTauri) return null;
  try {
    const { Store } = await import('@tauri-apps/plugin-store');
    return (await (await Store.load(STORE_FILE)).get<T>(key)) ?? null;
  } catch { return null; }
}
async function saveConfig(mode: Mode, url: string) {
  if (!isTauri) return;
  const { Store } = await import('@tauri-apps/plugin-store');
  const store = await Store.load(STORE_FILE);
  await store.set(MODE_KEY, mode); await store.set(SERVER_URL_KEY, url); await store.save();
}
async function goTo(url: string) {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('navigate_to', { url });
  } else window.location.href = url;
}
function normaliseUrl(raw: string) {
  let value = raw.trim().replace(/\/$/, '');
  if (value && !/^https?:\/\//i.test(value)) value = `http://${value}`;
  return value;
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
  const [licenseUrl, setLicenseUrl] = useState(CLOUD_URL);
  const [docker, setDocker] = useState<DockerStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const choose = () => { setPhase('choose'); setMode(null); setError(null); };
  useEffect(() => { (window as any).__violet_show_setup = choose; }, []);
  useEffect(() => {
    const forced = new URLSearchParams(window.location.search).has('reconfigure');
    Promise.all([storeValue<Mode>(MODE_KEY), storeValue<string>(SERVER_URL_KEY)]).then(([savedMode, savedUrl]) => {
      if (!forced && savedMode && savedUrl) {
        setMode(savedMode); setUrl(savedUrl);
        if (savedMode === 'managed-host' && isTauri) {
          setPhase('starting');
          import('@tauri-apps/api/core').then(({ invoke }) => invoke<{ url: string }>('resume_managed_host'))
            .then((host) => { setUrl(host.url); setPhase('connecting'); return goTo(loginUrl(host.url)); })
            .catch((reason) => {
              setPhase('details');
              setError(typeof reason === 'string' ? reason : 'Could not resume the Store Host.');
              import('@tauri-apps/api/core').then(({ invoke }) => invoke<DockerStatus>('get_docker_status').then(setDocker)).catch(() => undefined);
            });
        } else {
          setPhase('connecting');
          goTo(loginUrl(savedUrl)).catch(() => { setError(`Could not connect to ${savedUrl}.`); setPhase('choose'); });
        }
      } else setPhase('choose');
    });
  }, []);

  const selectMode = async (selected: Mode) => {
    setMode(selected); setError(null);
    if (selected === 'cloud') return connect(selected, CLOUD_URL);
    if (selected === 'managed-host') {
      setPhase('details');
      return;
    }
    setPhase('details'); setTimeout(() => inputRef.current?.focus(), 50);
  };
  const connect = async (selected: Mode, target: string) => {
    setError(null); setUrl(target); setMode(selected); setPhase('connecting');
    try { await saveConfig(selected, target); await goTo(loginUrl(target)); }
    catch { setPhase('details'); setError(`Could not connect to ${target}. Check the address and that Violet is running.`); }
  };
  const submitExternal = (event: React.FormEvent) => {
    event.preventDefault(); const target = normaliseUrl(url);
    try { const parsed = new URL(target); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(); }
    catch { setError('Enter a valid HTTP or HTTPS server address.'); return; }
    connect(mode!, target);
  };
  const startHost = async (event: React.FormEvent) => {
    event.preventDefault(); setError(null); setPhase('starting');
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<{ url: string }>('start_managed_host', { adminEmail: email, adminPassword: password, licenseUrl });
      await connect('managed-host', result.url);
    } catch (reason) { setPhase('details'); setError(typeof reason === 'string' ? reason : 'Could not start the Store Host.'); }
  };
  const retryHost = async () => {
    setError(null); setPhase('starting');
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<{ url: string }>('retry_managed_host');
      await connect('managed-host', result.url);
    } catch (reason) { setPhase('details'); setError(typeof reason === 'string' ? reason : 'Could not retry the Store Host.'); }
  };

  if (phase === 'checking' || phase === 'connecting' || phase === 'starting') return <Loading phase={phase} url={url} onCancel={choose} />;
  if (phase === 'choose') return <Shell><h1>Set up Violet</h1><p>Choose how this desktop will use Violet. You can change this any time from <b>Configure Server</b>.</p>
    <div className="mode-grid">
      <ModeCard title="Hosted Cloud" text="Use Violet’s hosted cloud service." onClick={() => selectMode('cloud')} />
      <ModeCard title="Store Host (this desktop)" text="Run this store’s server with Docker Desktop." onClick={() => selectMode('managed-host')} />
      <ModeCard title="Store Host (existing server)" text="This desktop is at the server; connect to an already installed Violet server." onClick={() => selectMode('external-host')} />
      <ModeCard title="Store Client" text="Connect this register to an existing Store Host on your network." onClick={() => selectMode('client')} />
    </div></Shell>;
  const external = mode === 'external-host';
  return <Shell><button type="button" className="back" onClick={choose}>← All modes</button>
    <h1>{mode === 'managed-host' ? 'Create your Store Host' : external ? 'Use an existing Store Host' : 'Connect this Store Client'}</h1>
    {mode === 'managed-host' ? <form onSubmit={startHost}>
      <p>Docker Desktop runs Violet locally. Your store data stays in Docker named volumes.</p>
      {docker && <p className={docker.available && docker.composeAvailable ? 'notice good' : 'notice bad'}>{docker.message}</p>}
      <label>Hosted Violet email<input ref={inputRef} type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="username" /></label>
      <label>Hosted Violet password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" /></label>
      <label>Hosted license URL<input type="url" value={licenseUrl} onChange={e => setLicenseUrl(e.target.value)} required /></label>
      {error && <><ErrorNotice text={error}/><button type="button" className="secondary" onClick={retryHost}>Retry existing Store Host</button></>}
      <button disabled={!!docker && (!docker.available || !docker.composeAvailable)}>{error ? 'Rebuild Store Host' : 'Start Store Host'}</button>
    </form> : <form onSubmit={submitExternal}>
      <p>{external ? 'Enter the local address of the separately installed server.' : 'Ask your store administrator for the Store Host address.'} HTTP is suitable for a trusted LAN; use HTTPS for internet-facing hosts.</p>
      <label>Server address<input ref={inputRef} value={url} onChange={e => setUrl(e.target.value)} placeholder="http://192.168.1.10" required autoComplete="url" /></label>
      {error && <ErrorNotice text={error}/>}<button>Connect</button>
    </form>}</Shell>;
}
function Shell({ children }: { children: React.ReactNode }) { return <main><section><Logo/>{children}<small>{!isTauri && 'Browser preview mode · '}Violet Enterprise Desktop</small></section></main>; }
function ModeCard({ title, text, onClick }: { title: string; text: string; onClick: () => void }) { return <button type="button" className="mode" onClick={onClick}><strong>{title}</strong><span>{text}</span></button>; }
function ErrorNotice({ text }: { text: string }) { return <p className="notice bad diagnostic">{text}</p>; }
function Loading({ phase, url, onCancel }: { phase: Phase; url: string; onCancel: () => void }) { return <main><section className="loading"><Logo/><i/><h1>{phase === 'starting' ? 'Starting Store Host…' : 'Connecting…'}</h1><p>{phase === 'starting' ? 'Docker is building Violet. This can take a few minutes on first setup.' : `Opening ${url}`}</p><button type="button" className="link" onClick={onCancel}>Cancel / change mode</button></section></main>; }
function Logo() { return <div className="logo"><b>●</b><strong>Violet Enterprise</strong></div>; }