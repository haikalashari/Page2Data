import { useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge, Card, type BadgeTone } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Note, Select } from '@/components/ui/Field';
import { Icon, type IconName } from '@/components/ui/Icon';
import { NAME_STYLE_LABELS, standardizeColumnNames, type NameStyle } from '@/services/cleaning/column-names';
import { findDuplicates, removeDuplicates } from '@/services/cleaning/duplicates';
import { findMissingValues, removeRowsWithMissing } from '@/services/cleaning/missing-values';
import { applyInferredTypes, DATA_TYPE_LABELS, inferColumnTypes } from '@/services/cleaning/types-inference';
import { countUntrimmedCells, trimValues } from '@/services/cleaning/whitespace';
import { useApp } from '@/state/app-context';
import { cn, pluralize } from '@/utils/helpers';

function CleaningCard({
  icon,
  title,
  description,
  metric,
  tone = 'neutral',
  action,
  children,
}: {
  icon: IconName;
  title: string;
  description: string;
  metric?: string;
  tone?: BadgeTone;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Card className="p-3">
      <div className="flex items-start gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
          <Icon name={icon} className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[12px] font-semibold text-slate-800">{title}</h3>
            {metric ? <Badge tone={tone}>{metric}</Badge> : null}
          </div>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{description}</p>
          {children}
          {action ? <div className="mt-2 flex items-center justify-end gap-2">{action}</div> : null}
        </div>
      </div>
    </Card>
  );
}

export function CleaningView() {
  const { dataset, commit, canUndo, canRedo, undo, redo, setView } = useApp();
  const [nameStyle, setNameStyle] = useState<NameStyle>('snake');

  const untrimmed = useMemo(() => (dataset ? countUntrimmedCells(dataset) : 0), [dataset]);
  const duplicates = useMemo(() => (dataset ? findDuplicates(dataset) : null), [dataset]);
  const missing = useMemo(() => (dataset ? findMissingValues(dataset) : null), [dataset]);
  const inferredTypes = useMemo(() => (dataset ? inferColumnTypes(dataset) : {}), [dataset]);
  const namePreview = useMemo(
    () => (dataset ? standardizeColumnNames(dataset, nameStyle) : null),
    [dataset, nameStyle],
  );

  if (!dataset) {
    return (
      <EmptyState
        icon="filter"
        title="Nothing to clean yet"
        description="Extract a table first. Cleaning tools work on the dataset you have open."
      >
        <Button size="sm" variant="primary" onClick={() => setView('extract')}>
          Extract a table
        </Button>
      </EmptyState>
    );
  }

  const nameChanges = namePreview?.changes ?? [];
  const missingColumns = (missing?.byColumn ?? [])
    .filter((column) => column.missing > 0)
    .sort((a, b) => b.missing - a.missing);
  const typeEntries = dataset.columns.map((column) => ({
    column,
    inferred: inferredTypes[column.id] ?? column.dataType,
  }));
  const changedTypes = typeEntries.filter((entry) => entry.inferred !== entry.column.dataType);

  const applyTrim = () => {
    const result = trimValues(dataset);
    commit(result.dataset, result.message);
  };

  const applyNames = () => {
    if (!namePreview) return;
    commit(
      namePreview.dataset,
      nameChanges.length
        ? `Renamed ${pluralize(nameChanges.length, 'column')}.`
        : 'Column names were already consistent.',
    );
  };

  const applyDuplicates = () => {
    const result = removeDuplicates(dataset);
    commit(result.dataset, result.message);
  };

  const applyMissing = () => {
    const result = removeRowsWithMissing(dataset);
    commit(result.dataset, result.message);
  };

  const applyTypes = () => {
    const result = applyInferredTypes(dataset);
    commit(
      result.dataset,
      result.changes.length
        ? `Applied ${pluralize(result.changes.length, 'column type')}: ${result.changes
            .map((change) => `${change.column} → ${DATA_TYPE_LABELS[change.to]}`)
            .join(', ')}.`
        : 'Column types were already up to date.',
    );
  };

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold text-slate-900">Clean & validate</h2>
          <p className="text-[11px] text-slate-400">
            {dataset.rows.length.toLocaleString()} rows · {dataset.columns.length} columns · every step can
            be undone
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button size="xs" variant="ghost" onClick={undo} disabled={!canUndo} title="Undo">
            <Icon name="undo" className="h-3.5 w-3.5" />
          </Button>
          <Button size="xs" variant="ghost" onClick={redo} disabled={!canRedo} title="Redo">
            <Icon name="redo" className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <CleaningCard
        icon="refresh"
        title="Trim whitespace"
        description="Remove leading and trailing spaces so values match and deduplicate reliably."
        metric={untrimmed > 0 ? `${untrimmed} cells` : 'clean'}
        tone={untrimmed > 0 ? 'warning' : 'success'}
        action={
          <Button size="sm" variant="primary" onClick={applyTrim} disabled={untrimmed === 0}>
            Trim values
          </Button>
        }
      >
        {untrimmed > 0 ? (
          <p className="mt-1.5 text-[10px] text-slate-400">
            {pluralize(untrimmed, 'cell')} still have extra whitespace.
          </p>
        ) : null}
      </CleaningCard>

      <CleaningCard
        icon="columns"
        title="Standardize column names"
        description="Normalize headers for databases, spreadsheets, and code."
        metric={nameChanges.length > 0 ? `${nameChanges.length} changes` : 'consistent'}
        tone={nameChanges.length > 0 ? 'brand' : 'success'}
        action={
          <Button size="sm" variant="primary" onClick={applyNames} disabled={nameChanges.length === 0}>
            Apply names
          </Button>
        }
      >
        <div className="mt-2 flex items-center gap-2">
          <Select
            value={nameStyle}
            onChange={(event) => setNameStyle(event.target.value as NameStyle)}
            aria-label="Naming style"
            className="h-7 flex-1 text-[11px]"
          >
            {(Object.keys(NAME_STYLE_LABELS) as NameStyle[]).map((style) => (
              <option key={style} value={style}>
                {NAME_STYLE_LABELS[style]}
              </option>
            ))}
          </Select>
        </div>

        {nameChanges.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {nameChanges.slice(0, 4).map((change) => (
              <li key={change.from} className="flex items-center gap-1 text-[10px] text-slate-500">
                <span className="max-w-[42%] truncate text-slate-400 line-through">{change.from}</span>
                <Icon name="arrowRight" className="h-2.5 w-2.5 shrink-0 text-slate-300" />
                <span className="truncate font-medium text-slate-700">{change.to}</span>
              </li>
            ))}
            {nameChanges.length > 4 ? (
              <li className="text-[10px] text-slate-400">+{nameChanges.length - 4} more</li>
            ) : null}
          </ul>
        ) : null}
      </CleaningCard>

      <CleaningCard
        icon="copy"
        title="Duplicate rows"
        description="Find rows whose values are identical across every column."
        metric={
          duplicates && duplicates.duplicateIndexes.length > 0
            ? `${duplicates.duplicateIndexes.length} duplicates`
            : 'none'
        }
        tone={duplicates && duplicates.duplicateIndexes.length > 0 ? 'warning' : 'success'}
        action={
          <Button
            size="sm"
            variant="primary"
            onClick={applyDuplicates}
            disabled={!duplicates || duplicates.duplicateIndexes.length === 0}
          >
            Remove duplicates
          </Button>
        }
      >
        {duplicates && duplicates.groups.length > 0 ? (
          <p className="mt-1.5 text-[10px] text-slate-400">
            {pluralize(duplicates.groups.length, 'duplicate group')} · the first row of each group is kept.
          </p>
        ) : null}
      </CleaningCard>

      <CleaningCard
        icon="alert"
        title="Missing values"
        description="Blank cells are highlighted in the preview. Remove incomplete rows only when that is safe."
        metric={missing && missing.missingCells > 0 ? `${missing.missingCells} missing` : 'complete'}
        tone={missing && missing.missingCells > 0 ? 'warning' : 'success'}
        action={
          <Button
            size="sm"
            variant="secondary"
            onClick={applyMissing}
            disabled={!missing || missing.rowsWithMissing === 0}
          >
            Remove incomplete rows
          </Button>
        }
      >
        {missingColumns.length > 0 ? (
          <div className="mt-2 space-y-1">
            {missingColumns.slice(0, 4).map((column) => (
              <div key={column.columnId} className="flex items-center gap-2">
                <span className="w-24 truncate text-[10px] text-slate-500" title={column.columnName}>
                  {column.columnName}
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-amber-400"
                    style={{
                      width: `${dataset.rows.length > 0 ? Math.max(4, (column.missing / dataset.rows.length) * 100) : 0}%`,
                    }}
                  />
                </div>
                <span className="w-6 text-right text-[10px] tabular-nums text-slate-400">{column.missing}</span>
              </div>
            ))}
            {missingColumns.length > 4 ? (
              <p className="text-[10px] text-slate-400">+{missingColumns.length - 4} more columns</p>
            ) : null}
          </div>
        ) : (
          <p className="mt-1.5 text-[10px] text-emerald-600">No blank cells found.</p>
        )}
      </CleaningCard>

      <CleaningCard
        icon="zap"
        title="Column types"
        description="Detect whether each column is text, a number, a date, or a boolean."
        metric={changedTypes.length > 0 ? `${changedTypes.length} suggestions` : 'up to date'}
        tone={changedTypes.length > 0 ? 'brand' : 'success'}
        action={
          <Button size="sm" variant="primary" onClick={applyTypes} disabled={changedTypes.length === 0}>
            Apply types
          </Button>
        }
      >
        <div className="mt-2 flex flex-wrap gap-1">
          {typeEntries.slice(0, 8).map(({ column, inferred }) => (
            <span
              key={column.id}
              className={cn(
                'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px]',
                inferred !== column.dataType
                  ? 'border-brand-200 bg-brand-50 text-brand-700'
                  : 'border-slate-200 bg-slate-50 text-slate-500',
              )}
            >
              <span className="max-w-[90px] truncate">{column.name}</span>
              <Icon name="arrowRight" className="h-2.5 w-2.5 opacity-50" />
              <span className="font-medium">{DATA_TYPE_LABELS[inferred]}</span>
            </span>
          ))}
          {typeEntries.length > 8 ? (
            <span className="px-1 py-0.5 text-[10px] text-slate-400">+{typeEntries.length - 8}</span>
          ) : null}
        </div>
      </CleaningCard>

      <Note icon={<Icon name="info" className="h-3.5 w-3.5" />}>
        Missing values are shown as <span className="font-medium">—</span> and highlighted in the Data tab.
        Undo is available until you open another dataset.
      </Note>
    </div>
  );
}
