import { Badge } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import type { TableInfo } from '@/types/extraction';
import { cn } from '@/utils/helpers';

export function TablePreview({ table }: { table: TableInfo }) {
  const previewColumns = Math.min(table.columnCount, 4);
  const headers = table.headers.slice(0, previewColumns);
  const rows = table.preview.slice(0, 2);

  if (previewColumns === 0) return null;

  return (
    <div className="mt-2 overflow-hidden rounded-md border border-slate-200/70">
      <table className="w-full table-fixed border-collapse text-[10px]">
        {headers.length > 0 ? (
          <thead>
            <tr className="bg-slate-50">
              {headers.map((header, index) => (
                <th
                  key={index}
                  className="truncate border-b border-slate-200/70 px-1.5 py-1 text-left font-medium text-slate-500"
                >
                  {header || '—'}
                </th>
              ))}
            </tr>
          </thead>
        ) : null}
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-t border-slate-100 first:border-t-0">
              {Array.from({ length: previewColumns }).map((_, columnIndex) => (
                <td key={columnIndex} className="truncate px-1.5 py-1 text-slate-600">
                  {row[columnIndex] || '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TableCard({
  table,
  selected,
  onSelect,
}: {
  table: TableInfo;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'block w-full rounded-xl border bg-white p-2.5 text-left transition-all',
        selected
          ? 'border-brand-400 ring-2 ring-brand-100 card-shadow'
          : 'border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/40',
      )}
    >
      <div className="flex items-start gap-2">
        <div
          className={cn(
            'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
            selected ? 'bg-brand-50 text-brand-600' : 'bg-slate-100 text-slate-500',
          )}
        >
          <Icon name="table" className="h-3.5 w-3.5" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[12px] font-medium leading-snug text-slate-800">
            {table.caption}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <span className="text-[10px] text-slate-400">
              {table.rowCount.toLocaleString()} rows · {table.columnCount} cols
            </span>
            {table.hasHeader ? <Badge tone="brand">header</Badge> : null}
            {table.likelyLayout ? <Badge tone="warning">layout?</Badge> : null}
            {table.nested ? <Badge>nested</Badge> : null}
          </div>
        </div>

        <span
          className={cn(
            'mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
            selected ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white',
          )}
        >
          {selected ? <Icon name="check" className="h-2.5 w-2.5" strokeWidth={3} /> : null}
        </span>
      </div>

      {selected ? <TablePreview table={table} /> : null}
    </button>
  );
}
