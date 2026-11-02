import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AiSettings } from '@/types/ai';
import type { Dataset, DatasetSummary } from '@/types/dataset';
import {
  clearDatasets,
  deleteDataset,
  getDataset,
  listDatasets,
  saveDataset,
  summarizeDataset,
} from '@/storage/dataset-storage';
import { DEFAULT_AI_SETTINGS, getAiSettings, saveAiSettings } from '@/storage/settings-storage';

export type View = 'extract' | 'data' | 'clean' | 'ai' | 'settings';
export type ToastKind = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: number;
  text: string;
  kind: ToastKind;
}

interface AppContextValue {
  view: View;
  setView: (view: View) => void;
  dataset: Dataset | null;
  summaries: DatasetSummary[];
  settings: AiSettings;
  settingsLoaded: boolean;
  saving: boolean;
  savedAt: number | null;
  toast: ToastMessage | null;
  notify: (text: string, kind?: ToastKind) => void;
  dismissToast: () => void;
  addDataset: (dataset: Dataset) => void;
  openDataset: (id: string) => Promise<void>;
  removeDataset: (id: string) => Promise<void>;
  clearAllDatasets: () => Promise<void>;
  commit: (next: Dataset, message?: string, options?: { record?: boolean }) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  updateSettings: (next: AiSettings) => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

const HISTORY_LIMIT = 25;

export function AppProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<View>('extract');
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [summaries, setSummaries] = useState<DatasetSummary[]>([]);
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);

  const history = useRef<{ past: Dataset[]; future: Dataset[] }>({ past: [], future: [] });
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const pendingSaves = useRef(0);

  const notify = useCallback((text: string, kind: ToastKind = 'success') => {
    setToast({ id: Date.now() + Math.random(), text, kind });
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [loadedSettings, loadedSummaries] = await Promise.all([
        getAiSettings(),
        listDatasets().catch((error: unknown) => {
          console.warn('[Page2Data] could not list datasets', error);
          return [] as DatasetSummary[];
        }),
      ]);
      if (cancelled) return;
      setSettings(loadedSettings);
      setSettingsLoaded(true);
      setSummaries(loadedSummaries);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist every committed change, in order, so the last write always wins.
  useEffect(() => {
    if (!dataset) return;
    pendingSaves.current += 1;
    setSaving(true);

    saveQueue.current = saveQueue.current.then(async () => {
      try {
        await saveDataset(dataset);
        setSavedAt(Date.now());
        setSummaries((previous) => {
          const summary = summarizeDataset(dataset);
          return [summary, ...previous.filter((entry) => entry.id !== summary.id)].sort((a, b) =>
            b.extractedAt.localeCompare(a.extractedAt),
          );
        });
      } catch (error) {
        console.error('[Page2Data] save failed', error);
        notify('Could not save the dataset locally. Storage may be full.', 'error');
      } finally {
        pendingSaves.current -= 1;
        if (pendingSaves.current === 0) setSaving(false);
      }
    });
  }, [dataset, notify]);

  const addDataset = useCallback(
    (next: Dataset) => {
      history.current = { past: [], future: [] };
      setHistoryVersion((version) => version + 1);
      setDataset(next);
      setView('data');
      notify(`Extracted ${next.rows.length.toLocaleString()} rows.`);
    },
    [notify],
  );

  const openDataset = useCallback(
    async (id: string) => {
      try {
        const found = await getDataset(id);
        if (!found) {
          notify('That dataset could not be found.', 'error');
          setSummaries(await listDatasets());
          return;
        }
        history.current = { past: [], future: [] };
        setHistoryVersion((version) => version + 1);
        setDataset(found);
        setView('data');
      } catch (error) {
        console.error('[Page2Data] open failed', error);
        notify('Could not open that dataset.', 'error');
      }
    },
    [notify],
  );

  const removeDataset = useCallback(
    async (id: string) => {
      try {
        await deleteDataset(id);
        setSummaries((previous) => previous.filter((entry) => entry.id !== id));
        if (dataset?.id === id) {
          setDataset(null);
          setView('extract');
        }
        notify('Dataset deleted.', 'info');
      } catch (error) {
        console.error('[Page2Data] delete failed', error);
        notify('Could not delete that dataset.', 'error');
      }
    },
    [dataset?.id, notify],
  );

  const clearAllDatasets = useCallback(async () => {
    try {
      await clearDatasets();
      setSummaries([]);
      setDataset(null);
      history.current = { past: [], future: [] };
      setHistoryVersion((version) => version + 1);
      setView('extract');
      notify('All saved datasets were deleted.', 'info');
    } catch (error) {
      console.error('[Page2Data] clear failed', error);
      notify('Could not delete the datasets.', 'error');
    }
  }, [notify]);

  const commit = useCallback(
    (next: Dataset, message?: string, options: { record?: boolean } = {}) => {
      if (!dataset) return;
      if (options.record !== false) {
        history.current.past = [...history.current.past.slice(-(HISTORY_LIMIT - 1)), dataset];
        history.current.future = [];
        setHistoryVersion((version) => version + 1);
      }
      setDataset(next);
      if (message) notify(message);
    },
    [dataset, notify],
  );

  const undo = useCallback(() => {
    if (!dataset) return;
    const previous = history.current.past.at(-1);
    if (!previous) return;
    history.current.past = history.current.past.slice(0, -1);
    history.current.future = [dataset, ...history.current.future].slice(0, HISTORY_LIMIT);
    setHistoryVersion((version) => version + 1);
    setDataset(previous);
    notify('Undid the last change.', 'info');
  }, [dataset, notify]);

  const redo = useCallback(() => {
    if (!dataset) return;
    const [next, ...rest] = history.current.future;
    if (!next) return;
    history.current.future = rest;
    history.current.past = [...history.current.past.slice(-(HISTORY_LIMIT - 1)), dataset];
    setHistoryVersion((version) => version + 1);
    setDataset(next);
    notify('Redid the change.', 'info');
  }, [dataset, notify]);

  const updateSettings = useCallback(
    async (next: AiSettings) => {
      try {
        const persisted = await saveAiSettings(next);
        setSettings(persisted);
        notify('AI settings saved.');
      } catch (error) {
        console.error('[Page2Data] settings save failed', error);
        notify('Could not save AI settings.', 'error');
      }
    },
    [notify],
  );

  const canUndo = history.current.past.length > 0;
  const canRedo = history.current.future.length > 0;

  const value = useMemo<AppContextValue>(
    () => ({
      view,
      setView,
      dataset,
      summaries,
      settings,
      settingsLoaded,
      saving,
      savedAt,
      toast,
      notify,
      dismissToast,
      addDataset,
      openDataset,
      removeDataset,
      clearAllDatasets,
      commit,
      undo,
      redo,
      canUndo,
      canRedo,
      updateSettings,
    }),
    [
      view,
      dataset,
      summaries,
      settings,
      settingsLoaded,
      saving,
      savedAt,
      toast,
      notify,
      dismissToast,
      addDataset,
      openDataset,
      removeDataset,
      clearAllDatasets,
      commit,
      undo,
      redo,
      canUndo,
      canRedo,
      updateSettings,
      historyVersion,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside <AppProvider>.');
  return context;
}
