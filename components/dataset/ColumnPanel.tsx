import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { removeColumn, renameColumn, setColumnType } from '@/services/cleaning/column-names';
import { DATA_TYPE_LABELS } from '@/services/cleaning/types-inference';
import { useApp } from '@/state/app-context';
import type { DataType, Dataset, DatasetColumn } from '@/types/dataset';

export function ColumnPanel({
  dataset,
  column,
  missingCount,
  onClose,
}: {
  dataset: Dataset;
  column: DatasetColumn;
  missingCount: number;
  onClose: () => void;
}) {
  const { commit } = useApp();
  const [name, setName] = useState(column.name);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    setName(column.name);
    setConfirmRemove(false);
  }, [column.id, column.name]);

  const typeOptions = useMemo(
    () => (Object.keys(DATA_TYPE_LABELS) as DataType[]).map((type) => ({ type, label: DATA_TYPE_LABELS[type] })),
    [],
  );

  const applyName = () => {
    const clean = name.trim();
    if (!clean || clean === column.name) {
      setName(column.name);
      return;
    }
    commit(renameColumn(dataset, column.id, clean), 'Column renamed.');
  };

  return (
    <Card className="mx-3 mb-2 border-brand-200/80 bg-brand-50/30 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-700">Edit column</p>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 text-slate-400 hover:bg-white/70 hover:text-slate-600"
          aria-label="Close column editor"
        >
          <Icon name="x" className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-2 grid grid-cols-[1fr_104px] gap-2">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={applyName}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur();
            }
            if (event.key === 'Escape') {
              setName(column.name);
              event.currentTarget.blur();
            }
          }}
          aria-label="Column name"
          maxLength={80}
          className="h-8 text-xs"
        />
        <Select
          value={column.dataType}
          onChange={(event) => {
            commit(setColumnType(dataset, column.id, event.target.value as DataType), 'Column type updated.');
          }}
          aria-label="Column data type"
          className="h-8 text-xs"
        >
          {typeOptions.map((option) => (
            <option key={option.type} value={option.type}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 text-[10px]">
        <span className={missingCount > 0 ? 'text-amber-700' : 'text-slate-500'}>
          {missingCount.toLocaleString()} missing value{missingCount === 1 ? '' : 's'}
        </span>

        {confirmRemove ? (
          <span className="flex items-center gap-1">
            <Button
              size="xs"
              variant="danger"
              onClick={() => {
                commit(removeColumn(dataset, column.id), 'Column removed.');
                onClose();
              }}
            >
              Remove
            </Button>
            <Button size="xs" variant="ghost" onClick={() => setConfirmRemove(false)}>
              Cancel
            </Button>
          </span>
        ) : (
          <Button
            size="xs"
            variant="ghost"
            className="text-rose-600 hover:bg-rose-50"
            disabled={dataset.columns.length <= 1}
            onClick={() => setConfirmRemove(true)}
          >
            <Icon name="trash" className="h-3 w-3" />
            Remove column
          </Button>
        )}
      </div>
    </Card>
  );
}
