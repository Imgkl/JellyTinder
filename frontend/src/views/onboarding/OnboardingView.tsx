import { useState } from 'react';
import { api } from '../../lib/api';
import type { Settings } from '../../lib/types';
import { Button, Input } from '../../ui';

interface OnboardingViewProps {
  settings: Settings;
  onDone: (s: Settings) => void;
}

export function OnboardingView({ settings, onDone }: OnboardingViewProps) {
  const [step, setStep] = useState(0);

  // Step 1: Jellyfin
  const [jUrl, setJUrl] = useState(settings.jellyfinUrl || '');
  const [jUser, setJUser] = useState(settings.jellyfinUser || '');
  const [jPass, setJPass] = useState('');

  // Step 2: arr
  const [rUrl, setRUrl] = useState(settings.radarrUrl || '');
  const [rKey, setRKey] = useState('');
  const [rSkip, setRSkip] = useState(false);
  const [sUrl, setSUrl] = useState(settings.sonarrUrl || '');
  const [sKey, setSKey] = useState('');
  const [sSkip, setSSkip] = useState(false);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function testJellyfin(): Promise<boolean> {
    setTesting(true);
    setError(null);
    try {
      const res = await api.setupTest({ jellyfin: { url: jUrl, username: jUser, password: jPass } });
      const r = res.jellyfin;
      setTestResult((c) => ({ ...c, jellyfin: r! }));
      return !!r?.ok;
    } catch (e) {
      setError(String(e));
      return false;
    } finally {
      setTesting(false);
    }
  }

  async function commitJellyfin() {
    const ok = await testJellyfin();
    if (!ok) return;
    setBusy(true);
    try {
      const next = await api.saveSettings({
        jellyfinUrl: jUrl,
        jellyfinUser: jUser,
        jellyfinPassword: jPass,
      } as Partial<Settings> & Record<string, unknown>);
      setStep(1);
      // update mounted state too
      Object.assign(settings, next);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function testArrs() {
    setTesting(true);
    setError(null);
    try {
      const body: Parameters<typeof api.setupTest>[0] = {};
      if (!rSkip) body.radarr = { url: rUrl, apiKey: rKey };
      if (!sSkip) body.sonarr = { url: sUrl, apiKey: sKey };
      const res = await api.setupTest(body);
      setTestResult((c) => ({
        ...c,
        ...(res.radarr ? { radarr: res.radarr } : {}),
        ...(res.sonarr ? { sonarr: res.sonarr } : {}),
      }));
    } catch (e) {
      setError(String(e));
    } finally {
      setTesting(false);
    }
  }

  async function commitArrs() {
    setBusy(true);
    setError(null);
    try {
      const patch: Partial<Settings> & Record<string, unknown> = {};
      if (!rSkip) {
        patch.radarrUrl = rUrl;
        patch.radarrApiKey = rKey;
      } else {
        patch.radarrUrl = '';
        patch.radarrApiKey = '';
      }
      if (!sSkip) {
        patch.sonarrUrl = sUrl;
        patch.sonarrApiKey = sKey;
      } else {
        patch.sonarrUrl = '';
        patch.sonarrApiKey = '';
      }
      await api.saveSettings(patch);
      await api.completeOnboarding();
      const fresh = await api.settings();
      onDone(fresh);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex justify-center px-6 lg:px-8 py-14">
      <div className={`w-full ${step === 0 ? 'max-w-[560px]' : 'max-w-[760px]'} flex flex-col`}>
      {/* meter */}
      <StepMeter step={step} />

      {step === 0 && (
        <>
          <h1 className="font-serif italic text-[40px] lg:text-[48px] leading-[1] tracking-[0.005em] mb-3.5">
            Connect your<br />Jellyfin server.
          </h1>
          <p className="text-text-dim text-[14px] leading-[1.55] mb-12">
            We'll pull movies and TV in alphabetised batches you can review at your pace.
            Nothing is deleted until you commit a tray.
          </p>

          <div className="grid grid-cols-1 gap-6">
            <Input label="Jellyfin URL" placeholder="http://jellyfin.local:8096" value={jUrl} onChange={(e) => setJUrl(e.currentTarget.value)} />
            <Input label="Username" value={jUser} onChange={(e) => setJUser(e.currentTarget.value)} />
            <Input label="Password" type="password" value={jPass} onChange={(e) => setJPass(e.currentTarget.value)} />
          </div>

          {testResult.jellyfin && (
            <p className={`mt-6 text-[10.5px] uppercase tracking-[0.22em] ${testResult.jellyfin.ok ? 'text-text' : 'text-danger'}`}>
              {testResult.jellyfin.ok ? `Connected${testResult.jellyfin.message ? ` · ${testResult.jellyfin.message}` : ''}` : testResult.jellyfin.message}
            </p>
          )}
          {error && <p className="mt-4 text-danger text-sm">{error}</p>}

          <div className="flex gap-2.5 mt-9">
            <Button variant="line" onClick={testJellyfin} disabled={testing || !jUrl || !jUser || !jPass}>
              {testing ? 'Testing…' : 'Test connection'}
            </Button>
            <Button onClick={commitJellyfin} disabled={testing || busy || !jUrl || !jUser || !jPass}>
              Continue ━━▶
            </Button>
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <span className="block text-[14px] uppercase tracking-[0.22em] text-muted mb-3.5">The *arr stack</span>
          <h1 className="font-serif italic text-[40px] lg:text-[48px] leading-[1] tracking-[0.005em] mb-3.5">
            Hook in Radarr<br />and Sonarr.
          </h1>
          <p className="text-text-dim text-[14px] max-w-[520px] leading-[1.55] mb-10">
            API access lets JellyTinder cascade deletes — drop a file once, it's gone from disk,
            Radarr, and Sonarr in a single confirm.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 border border-border">
            <ArrCell
              name="Radarr"
              url={rUrl}
              setUrl={setRUrl}
              apiKey={rKey}
              setApiKey={setRKey}
              skip={rSkip}
              setSkip={setRSkip}
              status={testResult.radarr}
              cellClass="md:border-r border-border"
            />
            <ArrCell
              name="Sonarr"
              url={sUrl}
              setUrl={setSUrl}
              apiKey={sKey}
              setApiKey={setSKey}
              skip={sSkip}
              setSkip={setSSkip}
              status={testResult.sonarr}
            />
          </div>

          {error && <p className="mt-5 text-danger text-sm">{error}</p>}

          <div className="flex flex-wrap gap-2.5 mt-9">
            <Button variant="ghost" onClick={() => setStep(0)}>← Back</Button>
            <Button variant="line" onClick={testArrs} disabled={testing}>
              {testing ? 'Testing…' : 'Test all'}
            </Button>
            <Button onClick={commitArrs} disabled={busy}>
              {busy ? 'Saving…' : 'Begin review ━━▶'}
            </Button>
          </div>
        </>
      )}
      </div>
    </div>
  );
}

function StepMeter({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2.5 mb-12">
      <span className="text-[10px] uppercase tracking-[0.22em] text-muted font-medium mr-1.5">
        Step {step + 1} of 3
      </span>
      <span className={`h-[2px] w-[42px] ${step >= 0 ? 'bg-text' : 'bg-border'}`} />
      <span className={`h-[2px] w-[42px] ${step >= 1 ? 'bg-text' : 'bg-border'}`} />
      <span className={`h-[2px] w-[42px] ${step >= 2 ? 'bg-text' : 'bg-border'}`} />
    </div>
  );
}

interface ArrCellProps {
  name: string;
  url: string;
  setUrl: (v: string) => void;
  apiKey: string;
  setApiKey: (v: string) => void;
  skip: boolean;
  setSkip: (v: boolean) => void;
  status?: { ok: boolean; message: string };
  cellClass?: string;
}

function ArrCell({ name, url, setUrl, apiKey, setApiKey, skip, setSkip, status, cellClass = '' }: ArrCellProps) {
  return (
    <div className={`p-6 flex flex-col gap-5 ${cellClass}`}>
      <h3 className="font-serif italic text-[22px] tracking-[0.01em]">{name}</h3>
      <Input label="URL" value={url} onChange={(e) => setUrl(e.currentTarget.value)} disabled={skip} placeholder={`http://${name.toLowerCase()}:${name === 'Radarr' ? '7878' : '8989'}`} />
      <Input label="API key" type="password" value={apiKey} onChange={(e) => setApiKey(e.currentTarget.value)} disabled={skip} />
      <label className="inline-flex items-center gap-2 text-[10.5px] uppercase tracking-[0.18em] text-muted cursor-pointer">
        <input
          type="checkbox"
          checked={skip}
          onChange={(e) => setSkip(e.currentTarget.checked)}
          className="w-[14px] h-[14px] accent-text appearance-none border border-border checked:bg-text checked:border-text relative cursor-pointer
            after:content-[''] checked:after:absolute checked:after:inset-[3px] checked:after:bg-bg"
        />
        Skip {name}
      </label>
      {status && (
        <span className={`text-[10.5px] uppercase tracking-[0.22em] ${status.ok ? 'text-text' : 'text-danger'}`}>
          {status.ok ? `Connected${status.message ? ` · ${status.message}` : ''}` : status.message}
        </span>
      )}
    </div>
  );
}
