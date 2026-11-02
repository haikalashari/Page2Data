import { useEffect, useRef } from 'react';
import { AppHeader } from '@/components/layout/AppHeader';
import { TabBar } from '@/components/layout/TabBar';
import { ToastViewport } from '@/components/ui/Toast';
import { AiView } from '@/components/ai/AiView';
import { CleaningView } from '@/components/cleaning/CleaningView';
import { DatasetView } from '@/components/dataset/DatasetView';
import { ExtractionView } from '@/components/extraction/ExtractionView';
import { SettingsView } from '@/components/settings/SettingsView';
import { AppProvider, useApp } from '@/state/app-context';

function Shell() {
  const { view } = useApp();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, [view]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f5f6fa]">
      <AppHeader />
      <TabBar />
      <main ref={mainRef} className="min-h-0 flex-1 overflow-y-auto">
        {view === 'extract' ? <ExtractionView /> : null}
        {view === 'data' ? <DatasetView /> : null}
        {view === 'clean' ? <CleaningView /> : null}
        {view === 'ai' ? <AiView /> : null}
        {view === 'settings' ? <SettingsView /> : null}
      </main>
      <ToastViewport />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
