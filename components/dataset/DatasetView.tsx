import { useMemo, useState } from 'react';
import { ColumnPanel } from '@/components/dataset/ColumnPanel';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { controlClass } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { findMissingValues } from '@/services/cleaning/missing-values';
import { DATA_TYPE_LABELS } from '@/services/cleaning/types-inference';
import { datasetToCsv, exportFileName } from '@/services/export/csv-exporter';
import { datasetToJson } from '@/services/export/json-exporter';
import { useApp } from '@/state/app-context';
import { downloadCsv, downloadJson } from '@/utils/download';
import { cn } from '@/utils/helpers';

export function DatasetView() {
  const { dataset, canUndo, canRedo, undo, redo, notify, setView } = useApp();
  const [search, setSearch] = useState('');
  const [selectedColumnId, setSelectedColumnId] = useState<string | null>(null);

  const query = search.trim().toLowerCase();

  const indexedRows = useMemo(() => {
    if (!dataset) return [];
    const indexed = dataset.rows.map((row, index) => ({ row, index }));
    if (!query) return indexed;
    return indexed.filter(({ row }) =>
      dataset.columns.some((column) => (row[column.id] ?? '').toLowerCase().includes(query)),
    );
  }, [dataset, query]);

  const missing = useMemo(() => (dataset ? findMissingValues(dataset) : null), [dataset]);

  if (!dataset) {
    return (
      <EmptyState
        icon="table"
        title="No dataset open"
        description="Extract a table from a webpage, or open a saved dataset to start cleaning it."
      >
        <Button size="sm" variant="primary" onClick={() => setView('extract')}>
          Go to extraction
        </Button>
      </EmptyState>
    );
  }

  const selectedColumn = dataset.columns.find((column) => column.id === selectedColumnId) ?? null;
  const missingByColumn = new Map((missing?.byColumn ?? []).map((entry) => [entry.columnId, entry.missing]));
  const host = (() => {
    try {
      return new URL(dataset.sourceUrl).hostname.replace(/^www\./, '');
    } catch {
      return 'local dataset';
    }
  })();

  const handleExport = (format: 'csv' | 'json') => {
    try {
      if (format === 'csv') {
        downloadCsv(exportFileName(dataset.name, 'csv'), datasetToCsv(dataset));
      } else {
        downloadJson(exportFileName(dataset.name, 'json'), datasetToJson(dataset, { pretty: true }));
      }
      notify(`Exported ${dataset.rows.length.toLocaleString()} rows as ${format.toUpperCase()}.`);
    } catch (error) {
      console.error('[Page2Data] export failed', error);
      notify('Export failed. Try a smaller dataset.', 'error');
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-3 pt-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[14px] font-semibold text-slate-900" title={dataset.name}>
              {dataset.name}
            </h2>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px] text-slate-400">
              <span className="inline-flex items-center gap-0.5">
                <Icon name="link" className="h-2.5 w-2.5" />
                {host}
              </span>
              <span>·</span>
              <span>{dataset.rows.length.toLocaleString()} rows</span>
              <span>·</span>
              <span>{dataset.columns.length} columns</span>
              {missing && missing.missingCells > 0 ? (
                <Badge tone="warning">{missing.missingCells.toLocaleString()} missing</Badge>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="xs"
              variant="ghost"
              onClick={undo}
              disabled={!canUndo}
              aria-label="Undo"
              title="Undo"
            >
              <Icon name="undo" className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={redo}
              disabled={!canRedo}
              aria-label="Redo"
              title="Redo"
            >
              <Icon name="redo" className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-1.5">
          <div className="relative min-w-0 flex-1">
            <Icon
              name="search"
              className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search rows…"
              aria-label="Search extracted rows"
              className={cn(controlClass, 'h-8 pl-7 pr-7 text-xs')}
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <Icon name="x" className="h-3 w-3" />
              </button>
            ) : null}
          </div>

          <Button size="sm" onClick={() => handleExport('csv')} title="Download CSV">
            <Icon name="download" className="h-3.5 w-3.5" />
            CSV
          </Button>
          <Button size="sm" onClick={() => handleExport('json')} title="Download JSON">
            <Icon name="code" className="h-3.5 w-3.5" />
            JSON
          </Button>
        </div>
      </div>

      {selectedColumn ? (
        <div className="mt-2">
          <ColumnPanel
            dataset={dataset}
            column={selectedColumn}
            missingCount={missingByColumn.get(selectedColumn.id) ?? 0}
            onClose={() => setSelectedColumnId(null)}
          />
        </div>
      ) : (
        <p className="px-3 pb-1 pt-2 text-[10px] text-slate-400">
          Tap a column header to rename it, change its type, or remove it.
        </p>
      )}

      <div className="mt-1 min-h-0 flex-1 overflow-auto border-t border-slate-200/70 bg-white">
        <table className="min-w-full border-separate border-spacing-0 text-[11px]">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 w-8 border-b border-r border-slate-200 bg-slate-50 px-1.5 py-1.5 text-right text-[9px] font-medium text-slate-400">
                #
              </th>
              {dataset.columns.map((column) => {
                const missingCount = missingByColumn.get(column.id) ?? 0;
                return (
                  <th
                    key={column.id}
                    className="sticky top-0 z-10 min-w-[96px] border-b border-slate-200 bg-slate-50 p-0 text-left"
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedColumnId(column.id)}
                      className={cn(
                        'flex w-full min-w-[96px] max-w-[200px] flex-col gap-0.5 px-2 py-1.5 text-left transition-colors hover:bg-slate-100',
                        selectedColumnId === column.id && 'bg-brand-50',
                      )}
                      title={`Edit ${column.name}`}
                    >
                      <span className="flex w-full items-center gap-1">
                        <span className="truncate text-[11px] font-semibold text-slate-700">{column.name}</span>
                        {missingCount > 0 ? (
                          <span className="ml-auto rounded bg-amber-100 px-1 text-[9px] font-medium text-amber-700">
                            {missingCount}
                          </span>
                        ) : null}
                        <Icon name="chevronDown" className="h-3 w-3 shrink-0 text-slate-400" />
                      </span>
                      <span className="text-[9px] uppercase tracking-wide text-slate-400">
                        {DATA_TYPE_LABELS[column.dataType]}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {indexedRows.map(({ row, index }) => (
              <tr key={index} className="group">
                <td className="sticky left-0 z-[1] border-b border-r border-slate-100 bg-white px-1.5 py-1.5 text-right text-[9px] tabular-nums text-slate-300 group-hover:bg-slate-50">
                  {index + 1}
                </td>
                {dataset.columns.map((column) => {
                  const value = row[column.id] ?? '';
                  const isEmpty = value.trim() === '';
                  return (
                    <td
                      key={column.id}
                      className={cn(
                        'max-w-[200px] border-b border-slate-100 px-2 py-1.5 align-top',
                        isEmpty ? 'bg-amber-50/40 text-amber-700/60' : 'text-slate-700',
                      )}
                      title={value}
                    >
                      <span className="line-clamp-2 break-words">{isEmpty ? '—' : value}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
            {indexedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={dataset.columns.length + 1}
                  className="px-3 py-8 text-center text-[11px] text-slate-400"
                >
                  {query ? 'No rows match your search.' : 'This dataset has no data rows.'}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-200/80 bg-white px-3 py-1.5 text-[10px] text-slate-400">
        <span>
          {query
            ? `${indexedRows.length.toLocaleString()} of ${dataset.rows.length.toLocaleString()} rows`
            : `${dataset.rows.length.toLocaleString()} rows`}
        </span>
        <span className="inline-flex items-center gap-1">
          <Icon name="lock" className="h-2.5 w-2.5" />
          Stored locally
        </span>
      </div>
    </div>
  );
}
