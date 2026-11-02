import { useCallback, useEffect, useRef, useState } from 'react';
import { SavedDatasets } from '@/components/extraction/SavedDatasets';
import { TableCard } from '@/components/extraction/TableCard';
import { Button } from '@/components/ui/Button';
import { Badge, Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { extractTableFromPage, scanActivePage, type ScannedPage } from '@/services/browser/page-bridge';
import { rankTables } from '@/services/extraction/table-detector';
import { useApp } from '@/state/app-context';

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'this page';
  }
}

function ScanningSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      {[0, 1, 2].map((item) => (
        <div key={item} className="animate-pulse rounded-xl border border-slate-200/70 bg-white p-3">
          <div className="flex gap-2">
            <div className="h-7 w-7 rounded-lg bg-slate-100" />
            <div className="flex-1 space-y-1.5">
              <div className="h-2.5 w-3/4 rounded bg-slate-100" />
              <div className="h-2 w-1/2 rounded bg-slate-100" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ExtractionView() {
  const { addDataset } = useApp();
  const [page, setPage] = useState<ScannedPage | null>(null);
  const [scanning, setScanning] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [headerRowCount, setHeaderRowCount] = useState(0);
  const [extracting, setExtracting] = useState(false);
  const autoScanned = useRef(false);

  const scan = useCallback(async () => {
    setScanning(true);
    setError(null);
    try {
      const scanned = await scanActivePage();
      setPage(scanned);
      const best = rankTables(scanned.tables)[0];
      setSelectedIndex(best ? best.index : null);
      setHeaderRowCount(best ? best.headerRowCount : 0);
    } catch (scanError) {
      setPage(null);
      setSelectedIndex(null);
      setError(scanError instanceof Error ? scanError.message : 'Could not read this page.');
    } finally {
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    if (autoScanned.current) return;
    autoScanned.current = true;
    void scan();
  }, [scan]);

  const selectTable = (index: number) => {
    setSelectedIndex(index);
    const table = page?.tables.find((entry) => entry.index === index);
    setHeaderRowCount(table ? table.headerRowCount : 0);
  };

  const selectedTable = page?.tables.find((table) => table.index === selectedIndex) ?? null;

  const handleExtract = async () => {
    if (!page || !selectedTable) return;
    setExtracting(true);
    setError(null);
    try {
      const dataset = await extractTableFromPage(page, selectedTable.index, { headerRowCount });
      addDataset(dataset);
    } catch (extractError) {
      setError(extractError instanceof Error ? extractError.message : 'Could not extract this table.');
    } finally {
      setExtracting(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {error ? (
          <Card className="border-rose-200 bg-rose-50/60 p-3">
            <div className="flex items-start gap-2">
              <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-rose-900">Could not read this page</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-rose-700">{error}</p>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Button size="sm" onClick={() => void scan()} loading={scanning}>
                Try again
              </Button>
              <span className="text-[10px] text-rose-600/80">Reload the page first if this keeps happening.</span>
            </div>
          </Card>
        ) : null}

        {scanning && !page ? <ScanningSkeleton /> : null}

        {!scanning && !page && !error ? (
          <EmptyState
            icon="table"
            title="Scan a page to begin"
            description="Page2Data reads HTML tables locally in your browser. Nothing leaves your device."
          >
            <Button variant="primary" size="sm" onClick={() => void scan()}>
              Scan this page
            </Button>
          </EmptyState>
        ) : null}

        {page ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-slate-800">Tables on this page</p>
                <p className="truncate text-[10px] text-slate-400">
                  {hostOf(page.url)} · {page.tables.length} found
                </p>
              </div>
              <Button size="xs" variant="ghost" onClick={() => void scan()} loading={scanning}>
                <Icon name="refresh" className="h-3 w-3" />
                Rescan
              </Button>
            </div>

            {page.tables.length === 0 ? (
              <EmptyState
                icon="table"
                title="No tables found"
                description="This page has no HTML table to extract. Try a page with a data table."
              >
                <Button size="sm" onClick={() => void scan()} loading={scanning}>
                  Scan again
                </Button>
              </EmptyState>
            ) : (
              <div className="space-y-2">
                {rankTables(page.tables).map((table) => (
                  <TableCard
                    key={table.index}
                    table={table}
                    selected={table.index === selectedIndex}
                    onSelect={() => selectTable(table.index)}
                  />
                ))}
              </div>
            )}
          </>
        ) : null}

        <SavedDatasets />
      </div>

      {selectedTable ? (
        <div className="shrink-0 border-t border-slate-200/80 bg-white/95 px-3 py-2 backdrop-blur">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-semibold text-slate-700">{selectedTable.caption}</p>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="text-[10px] text-slate-400">
                  {selectedTable.rowCount.toLocaleString()} rows · {selectedTable.columnCount} columns
                </span>
                {selectedTable.headerRowCount > 1 ? (
                  <Badge tone="brand">{selectedTable.headerRowCount} header rows</Badge>
                ) : null}
              </div>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void handleExtract()}
              loading={extracting}
              disabled={selectedTable.columnCount === 0}
            >
              Extract
              <Icon name="arrowRight" className="h-3.5 w-3.5" />
            </Button>
          </div>

          {selectedTable.headerRowCount <= 1 ? (
            <label className="mt-1.5 flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-500">
              <input
                type="checkbox"
                checked={headerRowCount === 1}
                onChange={(event) => setHeaderRowCount(event.target.checked ? 1 : 0)}
                className="h-3.5 w-3.5 rounded border-slate-300 accent-brand-600"
              />
              First row contains column names
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
