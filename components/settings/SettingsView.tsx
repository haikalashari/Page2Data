import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge, Card } from '@/components/ui/Card';
import { Field, Input, Note, Select, Textarea, Toggle } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { isAiReady, listModels, testConnection } from '@/services/ai/provider-manager';
import { clearApiKey, PROVIDER_DEFAULT_MODELS, PROVIDER_LABELS } from '@/storage/settings-storage';
import { useApp } from '@/state/app-context';
import type { AiConnectionResult, AiProviderId, AiSettings } from '@/types/ai';

const PROVIDER_IDS: AiProviderId[] = ['openai', 'gemini', 'compatible'];

const BASE_URL_PLACEHOLDER: Record<AiProviderId, string> = {
  openai: 'https://api.openai.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  compatible: 'http://localhost:11434/v1',
};

export function SettingsView() {
  const { settings, settingsLoaded, updateSettings, summaries, clearAllDatasets } = useApp();
  const [draft, setDraft] = useState<AiSettings>(settings);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<AiConnectionResult | null>(null);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [confirmRemoveKey, setConfirmRemoveKey] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (!settingsLoaded) return;
    setDraft(settings);
    setTestResult(null);
  }, [settings, settingsLoaded]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);

  const update = (patch: Partial<AiSettings>) => {
    setDraft((previous) => ({ ...previous, ...patch }));
    setTestResult(null);
  };

  const changeProvider = (provider: AiProviderId) => {
    const previousDefault = PROVIDER_DEFAULT_MODELS[draft.provider];
    const nextDefault = PROVIDER_DEFAULT_MODELS[provider];
    update({
      provider,
      model: !draft.model.trim() || draft.model === previousDefault ? nextDefault : draft.model,
      baseUrl: '',
      temperature: provider === 'gemini' ? 0.2 : draft.temperature,
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateSettings(draft);
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testConnection({ ...draft, enabled: true });
      setTestResult(result);
    } finally {
      setTesting(false);
    }
  };

  const loadModels = async () => {
    setLoadingModels(true);
    setModelError(null);
    try {
      const models = await listModels({ ...draft, enabled: true });
      setModelOptions(models);
      if (models.length === 0) {
        setModelError('The endpoint returned no models. Type a model name manually.');
      }
    } catch (error) {
      setModelError(error instanceof Error ? error.message : 'Could not load models.');
    } finally {
      setLoadingModels(false);
    }
  };

  const removeKey = async () => {
    const cleared = await clearApiKey();
    await updateSettings(cleared);
    setDraft(cleared);
    setConfirmRemoveKey(false);
  };

  return (
    <div className="space-y-3 p-3 pb-10">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-[14px] font-semibold text-slate-900">
            AI settings
            <Badge tone={isAiReady(draft) ? 'success' : 'neutral'}>
              {isAiReady(draft) ? 'Ready' : 'Inactive'}
            </Badge>
          </h2>
          <p className="text-[11px] text-slate-400">
            Bring your own key. Page2Data has no backend and never ships a shared API key.
          </p>
        </div>
      </div>

      <Card className="space-y-3 p-3">
        <Toggle
          checked={draft.enabled}
          onChange={(enabled) => update({ enabled })}
          label="Enable AI assistance"
          description="When off, extraction, cleaning, and export keep working normally."
        />

        <div className="h-px bg-slate-100" />

        <Field label="Provider" htmlFor="provider">
          <Select
            id="provider"
            value={draft.provider}
            onChange={(event) => changeProvider(event.target.value as AiProviderId)}
          >
            {PROVIDER_IDS.map((provider) => (
              <option key={provider} value={provider}>
                {PROVIDER_LABELS[provider]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="API key"
          htmlFor="api-key"
          hint="Stored locally in chrome.storage.local — not encrypted, and never sent anywhere except your chosen provider."
        >
          <div className="relative">
            <Input
              id="api-key"
              type={showKey ? 'text' : 'password'}
              value={draft.apiKey}
              onChange={(event) => update({ apiKey: event.target.value })}
              placeholder="Paste your API key"
              autoComplete="off"
              spellCheck={false}
              className="pr-9 font-mono text-[11px]"
            />
            <button
              type="button"
              onClick={() => setShowKey((value) => !value)}
              aria-label={showKey ? 'Hide API key' : 'Show API key'}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <Icon name={showKey ? 'eyeOff' : 'eye'} className="h-3.5 w-3.5" />
            </button>
          </div>
        </Field>

        <Field
          label="Model"
          htmlFor="model"
          right={
            <button
              type="button"
              onClick={() => void loadModels()}
              disabled={loadingModels}
              className="text-[10px] font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50"
            >
              {loadingModels ? 'Loading…' : 'Load models'}
            </button>
          }
          hint={modelError ? <span className="text-rose-600">{modelError}</span> : undefined}
        >
          <Input
            id="model"
            value={draft.model}
            onChange={(event) => update({ model: event.target.value })}
            placeholder={PROVIDER_DEFAULT_MODELS[draft.provider]}
            list="p2d-model-options"
            spellCheck={false}
            className="font-mono text-[11px]"
          />
          <datalist id="p2d-model-options">
            {modelOptions.map((model) => (
              <option key={model} value={model} />
            ))}
          </datalist>
        </Field>

        <Field
          label={`Base URL${draft.provider === 'compatible' ? ' (required)' : ' (optional)'}`}
          htmlFor="base-url"
          hint={
            draft.provider === 'compatible'
              ? 'The full endpoint root, for example http://localhost:11434/v1.'
              : 'Leave empty to use the provider default.'
          }
        >
          <Input
            id="base-url"
            value={draft.baseUrl}
            onChange={(event) => update({ baseUrl: event.target.value })}
            placeholder={BASE_URL_PLACEHOLDER[draft.provider]}
            spellCheck={false}
            className="font-mono text-[11px]"
          />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label={`Temperature (${draft.temperature.toFixed(1)})`} htmlFor="temperature">
            <input
              id="temperature"
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={draft.temperature}
              onChange={(event) => update({ temperature: Number(event.target.value) })}
              className="mt-2 w-full accent-brand-600"
            />
          </Field>

          <Field label="Max output tokens" htmlFor="max-tokens">
            <Input
              id="max-tokens"
              type="number"
              min={128}
              max={32000}
              step={128}
              value={draft.maxTokens}
              onChange={(event) => update({ maxTokens: Number(event.target.value) })}
              className="h-8 text-[11px]"
            />
          </Field>
        </div>

        <Field
          label="Custom instructions"
          htmlFor="system-instructions"
          hint="Added to Page2Data's built-in rules. The built-in safety constraints always win."
        >
          <Textarea
            id="system-instructions"
            value={draft.systemInstructions}
            onChange={(event) => update({ systemInstructions: event.target.value })}
            rows={3}
            maxLength={4000}
            placeholder="Use clear column names, preserve original values, never invent information."
            className="text-[11px]"
          />
        </Field>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" size="sm" onClick={() => void save()} loading={saving} disabled={!dirty}>
            Save settings
          </Button>
          <Button size="sm" onClick={() => void test()} loading={testing}>
            Test connection
          </Button>
          {dirty ? <span className="text-[10px] text-amber-600">Unsaved changes</span> : null}
        </div>

        {testResult ? (
          <Note
            tone={testResult.ok ? 'brand' : 'warning'}
            icon={<Icon name={testResult.ok ? 'check' : 'alert'} className="h-3.5 w-3.5" />}
          >
            <p className="font-medium">{testResult.ok ? 'Connection works' : 'Connection failed'}</p>
            <p className="mt-0.5">{testResult.message}</p>
            {testResult.ok ? (
              <p className="mt-0.5 text-slate-500">
                {testResult.model} · {testResult.latencyMs} ms
              </p>
            ) : null}
          </Note>
        ) : null}
      </Card>

      <Card className="p-3">
        <h3 className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-800">
          <Icon name="shield" className="h-3.5 w-3.5 text-emerald-600" />
          Privacy & storage
        </h3>
        <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-slate-500">
          <li>• Extracted data stays in your browser (IndexedDB) until you delete it.</li>
          <li>• AI requests only happen when you click an AI action, and only send a small sample.</li>
          <li>• API keys are stored locally without encryption. Treat them as sensitive credentials.</li>
          <li>• There is no Page2Data-owned server, analytics, or telemetry.</li>
        </ul>
      </Card>

      <Card className="border-rose-200/70 p-3">
        <h3 className="text-[12px] font-semibold text-rose-800">Delete local data</h3>
        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
          These actions cannot be undone.
        </p>

        <div className="mt-2 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-600">Saved API key</span>
            {confirmRemoveKey ? (
              <span className="flex items-center gap-1">
                <Button size="xs" variant="danger" onClick={() => void removeKey()}>
                  Delete key
                </Button>
                <Button size="xs" variant="ghost" onClick={() => setConfirmRemoveKey(false)}>
                  Cancel
                </Button>
              </span>
            ) : (
              <Button
                size="xs"
                variant="secondary"
                disabled={!settings.apiKey}
                onClick={() => setConfirmRemoveKey(true)}
              >
                Delete key
              </Button>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-600">
              {summaries.length} saved dataset{summaries.length === 1 ? '' : 's'}
            </span>
            {confirmClear ? (
              <span className="flex items-center gap-1">
                <Button
                  size="xs"
                  variant="danger"
                  onClick={() => {
                    setConfirmClear(false);
                    void clearAllDatasets();
                  }}
                >
                  Delete all
                </Button>
                <Button size="xs" variant="ghost" onClick={() => setConfirmClear(false)}>
                  Cancel
                </Button>
              </span>
            ) : (
              <Button
                size="xs"
                variant="secondary"
                disabled={summaries.length === 0}
                onClick={() => setConfirmClear(true)}
              >
                Delete all
              </Button>
            )}
          </div>
        </div>
      </Card>

      <p className="px-1 text-center text-[10px] leading-relaxed text-slate-400">
        {settingsLoaded ? 'Settings are saved locally in this browser.' : 'Loading settings…'} Page2Data
        v0.1.0
      </p>
    </div>
  );
}
