import type { AiAnalysis, AiCleaningSuggestion, AiInstructionPlan } from '@/types/ai';
import type { Dataset } from '@/types/dataset';
import { removeColumn, renameColumn, setColumnType, standardizeColumnNames } from '../cleaning/column-names';
import { removeDuplicates } from '../cleaning/duplicates';
import { applyInferredTypes, DATA_TYPE_LABELS } from '../cleaning/types-inference';
import { trimValues } from '../cleaning/whitespace';

export interface ApplyResult {
  dataset: Dataset;
  message: string;
  changed: boolean;
}

/** Applies selected schema suggestions (renames + data types). */
export function applyAnalysis(
  dataset: Dataset,
  analysis: AiAnalysis,
  selectedOriginalNames: string[] = analysis.columns.map((column) => column.originalName),
): ApplyResult {
  const selected = new Set(selectedOriginalNames);
  const targets = analysis.columns
    .map((suggestion) => ({
      suggestion,
      column: dataset.columns.find((column) => column.name === suggestion.originalName),
    }))
    .filter((entry): entry is { suggestion: AiAnalysis['columns'][number]; column: Dataset['columns'][number] } =>
      Boolean(entry.column),
    );

  let next = dataset;
  let renames = 0;
  let types = 0;

  for (const { suggestion, column } of targets) {
    if (!selected.has(suggestion.originalName)) continue;
    if (suggestion.suggestedName && suggestion.suggestedName !== column.name) {
      next = renameColumn(next, column.id, suggestion.suggestedName);
      renames += 1;
    }
    if (suggestion.dataType !== column.dataType) {
      next = setColumnType(next, column.id, suggestion.dataType);
      types += 1;
    }
  }

  const parts: string[] = [];
  if (renames) parts.push(`${renames} rename${renames === 1 ? '' : 's'}`);
  if (types) parts.push(`${types} type${types === 1 ? '' : 's'}`);

  return {
    dataset: next,
    changed: renames + types > 0,
    message: parts.length ? `Applied ${parts.join(' and ')}.` : 'Nothing to change.',
  };
}

/** Applies one AI cleaning suggestion using the local cleaning engine. */
export function applyCleaningSuggestion(dataset: Dataset, suggestion: AiCleaningSuggestion): ApplyResult {
  switch (suggestion.operation) {
    case 'trim': {
      const result = trimValues(dataset);
      return { dataset: result.dataset, message: result.message, changed: result.changed > 0 };
    }
    case 'remove-duplicates': {
      const result = removeDuplicates(dataset);
      return { dataset: result.dataset, message: result.message, changed: result.changed > 0 };
    }
    case 'standardize-names': {
      const result = standardizeColumnNames(dataset, 'snake');
      return {
        dataset: result.dataset,
        message: result.changes.length
          ? `Renamed ${result.changes.length} column${result.changes.length === 1 ? '' : 's'}.`
          : 'Column names were already consistent.',
        changed: result.changes.length > 0,
      };
    }
    case 'infer-types': {
      const result = applyInferredTypes(dataset);
      return {
        dataset: result.dataset,
        message: result.changes.length
          ? `Updated ${result.changes.length} column type${result.changes.length === 1 ? '' : 's'} (${result.changes
              .map((change) => `${change.column}: ${DATA_TYPE_LABELS[change.to]}`)
              .join(', ')}).`
          : 'Column types were already correct.',
        changed: result.changes.length > 0,
      };
    }
    case 'drop-column': {
      const column = suggestion.target
        ? dataset.columns.find((entry) => entry.name === suggestion.target)
        : undefined;
      if (!column) {
        return { dataset, message: 'That column no longer exists.', changed: false };
      }
      if (dataset.columns.length <= 1) {
        return { dataset, message: 'The dataset needs at least one column.', changed: false };
      }
      return { dataset: removeColumn(dataset, column.id), message: `Removed "${column.name}".`, changed: true };
    }
    case 'manual-review':
      return { dataset, message: 'Marked for manual review — no automatic change applied.', changed: false };
  }
}

/** Applies a column selection/rename plan from a free-form instruction. */
export function applyInstructionPlan(dataset: Dataset, plan: AiInstructionPlan): ApplyResult {
  const keep = plan.keepColumns.length
    ? new Set(plan.keepColumns.map((name) => name.toLowerCase()))
    : null;

  let next = dataset;
  let removed = 0;

  if (keep && keep.size < dataset.columns.length) {
    for (const column of [...dataset.columns]) {
      if (!keep.has(column.name.toLowerCase()) && next.columns.length > 1) {
        next = removeColumn(next, column.id);
        removed += 1;
      }
    }
  }

  let renames = 0;
  for (const rename of plan.columnRenames) {
    const column = next.columns.find((entry) => entry.name.toLowerCase() === rename.from.toLowerCase());
    if (column && column.name !== rename.to) {
      next = renameColumn(next, column.id, rename.to);
      renames += 1;
    }
  }

  const parts: string[] = [];
  if (removed) parts.push(`kept ${next.columns.length} columns`);
  if (renames) parts.push(`renamed ${renames}`);

  return {
    dataset: next,
    changed: removed + renames > 0,
    message: parts.length ? `Plan applied — ${parts.join(', ')}.` : 'Nothing to change.',
  };
}
