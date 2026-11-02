import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge, Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Note, Textarea } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/Spinner';
import {
  applyAnalysis,
  applyCleaningSuggestion,
  applyInstructionPlan,
} from '@/services/ai/apply-suggestions';
import { isAiReady, analyzeColumns, interpretInstruction, suggestCleaning } from '@/services/ai/provider-manager';
import { formatDatasetForPrompt } from '@/services/ai/prompt-builder';
import { DATA_TYPE_LABELS } from '@/services/cleaning/types-inference';
import { PROVIDER_LABELS } from '@/storage/settings-storage';
import { useApp } from '@/state/app-context';
import type { AiAnalysis, AiCleaningPlan, AiInstructionPlan, AiOperation, AiResult } from '@/types/ai';
import { cn } from '@/utils/helpers';

type TaskStatus = 'idle' | 'loading' | 'error' | 'done';

const OPERATION_LABELS: Record<AiOperation, string> = {
  trim: 'Trim',
  'remove-duplicates': 'Duplicates',
  'standardize-names': 'Names',
  'infer-types': 'Types',
  'drop-column': 'Drop column',
  'manual-review': 'Review',
};

function useAiTask<T>() {
  const [status, setStatus] = useState<TaskStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiResult<T> | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const run = useCallback(async (task: (signal: AbortSignal) => Promise<AiResult<T>>) => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setStatus('loading');
    setError(null);
    setResult(null);

    try {
      const response = await task(current.signal);
      if (current.signal.aborted) return;
      setResult(response);
      setStatus('done');
    } catch (taskError) {
      const message = taskError instanceof Error ? taskError.message : 'The AI request failed.';
      if (current.signal.aborted || /cancelled/i.test(message)) {
        setStatus('idle');
        return;
      }
      setError(message);
      setStatus('error');
    }
  }, []);

  const cancel = useCallback(() => {
    controller.current?.abort();
    setStatus('idle');
  }, []);

  const reset = useCallback(() => {
    controller.current?.abort();
    setStatus('idle');
    setError(null);
    setResult(null);
  }, []);

  return { status, error, result, run, cancel, reset };
}

function TaskCard({
  icon,
  title,
  description,
  children,
}: {
  icon: 'sparkles' | 'filter' | 'code';
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card className="p-3">
      <div className="flex items-start gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <Icon name={icon} className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[12px] font-semibold text-slate-800">{title}</h3>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{description}</p>
          {children}
        </div>
      </div>
    </Card>
  );
}

function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 p-2">
      <div className="flex items-start gap-1.5">
        <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
        <p className="text-[11px] leading-relaxed text-rose-700">{message}</p>
      </div>
      <Button size="xs" variant="ghost" className="mt-1 text-rose-700" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function ResultMeta({ result }: { result: AiResult<unknown> | null }) {
  if (!result) return null;
  return (
    <p className="mt-2 text-[9px] text-slate-400">
      {result.model} · {(result.latencyMs / 1000).toFixed(1)}s
    </p>
  );
}

export function AiView() {
  const { dataset, settings, commit, setView, canUndo, canRedo, undo, redo } = useApp();
  const [showPrompt, setShowPrompt] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set());
  const [instruction, setInstruction] = useState('');

  const analysisTask = useAiTask<AiAnalysis>();
  const cleaningTask = useAiTask<AiCleaningPlan>();
  const instructionTask = useAiTask<AiInstructionPlan>();

  const ready = isAiReady(settings);
  const context = useMemo(() => (dataset ? formatDatasetForPrompt(dataset) : ''), [dataset]);

  useEffect(() => {
    if (!analysisTask.result) {
      setSelectedColumns(new Set());
      return;
    }
    setSelectedColumns(new Set(analysisTask.result.data.columns.map((column) => column.originalName)));
  }, [analysisTask.result]);

  const resetTasks = useCallback(() => {
    analysisTask.reset();
    cleaningTask.reset();
    instructionTask.reset();
  }, [analysisTask, cleaningTask, instructionTask]);

  if (!dataset) {
    return (
      <EmptyState
        icon="sparkles"
        title="AI works on a dataset"
        description="Extract a table first. AI suggestions are optional and always reviewed by you before they are applied."
      >
        <Button size="sm" variant="primary" onClick={() => setView('extract')}>
          Extract a table
        </Button>
      </EmptyState>
    );
  }

  const toggleColumn = (name: string) => {
    setSelectedColumns((previous) => {
      const next = new Set(previous);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const applySelectedAnalysis = () => {
    if (!analysisTask.result) return;
    const applied = applyAnalysis(dataset, analysisTask.result.data, [...selectedColumns]);
    commit(applied.dataset, applied.message);
    resetTasks();
  };

  const applyOneCleaning = (suggestion: AiCleaningPlan['suggestions'][number]) => {
    const applied = applyCleaningSuggestion(dataset, suggestion);
    commit(applied.dataset, applied.message);
    resetTasks();
  };

  const applyPlan = () => {
    if (!instructionTask.result) return;
    const applied = applyInstructionPlan(dataset, instructionTask.result.data);
    commit(applied.dataset, applied.message);
    resetTasks();
  };

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-[14px] font-semibold text-slate-900">
            AI assistant
            <Badge tone={ready ? 'brand' : 'neutral'}>
              {ready ? PROVIDER_LABELS[settings.provider] : 'off'}
            </Badge>
          </h2>
          <p className="text-[11px] text-slate-400">
            {ready ? `${settings.model} · suggestions need your approval` : 'Optional — everything works without AI'}
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

      {!ready ? (
        <Note
          tone="warning"
          icon={<Icon name="alert" className="h-3.5 w-3.5" />}
        >
          <div className="flex items-center justify-between gap-2">
            <span>
              {settings.enabled
                ? 'AI is enabled but needs a valid API key and model.'
                : 'AI is turned off. Add your own provider key to use these tools.'}
            </span>
            <Button size="xs" variant="secondary" className="shrink-0" onClick={() => setView('settings')}>
              Settings
            </Button>
          </div>
        </Note>
      ) : null}

      <Card className="p-3">
        <button
          type="button"
          onClick={() => setShowPrompt((value) => !value)}
          className="flex w-full items-center justify-between gap-2"
          aria-expanded={showPrompt}
        >
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
            <Icon name="shield" className="h-3.5 w-3.5 text-emerald-600" />
            What gets sent to the provider?
          </span>
          <Icon name={showPrompt ? 'chevronUp' : 'chevronDown'} className="h-3.5 w-3.5 text-slate-400" />
        </button>

        {showPrompt ? (
          <div className="mt-2 space-y-2">
            <p className="text-[10px] leading-relaxed text-slate-500">
              Column names and up to {Math.min(20, dataset.rows.length)} sample rows ({context.length.toLocaleString()}{' '}
              characters) go to {PROVIDER_LABELS[settings.provider] ?? 'your provider'}. No images, no full page
              content, no browsing history. Requests only happen when you click an AI action.
            </p>
            <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-900 p-2 text-[9px] leading-relaxed text-slate-200">
              {context}
            </pre>
          </div>
        ) : (
          <p className="mt-1 text-[10px] text-slate-400">
            Only a small sample of this dataset — never the whole page.
          </p>
        )}
      </Card>

      <TaskCard
        icon="sparkles"
        title="Analyze columns"
        description="Suggest clearer column names and the most likely data type for each one."
      >
        <div className="mt-2 flex items-center gap-2">
          <Button
            size="sm"
            variant="primary"
            disabled={!ready || analysisTask.status === 'loading'}
            onClick={() => {
              void analysisTask.run((signal) => analyzeColumns(settings, dataset, signal));
            }}
          >
            <Icon name="sparkles" className="h-3.5 w-3.5" />
            Analyze
          </Button>
          {analysisTask.status === 'loading' ? (
            <Button size="sm" variant="ghost" onClick={analysisTask.cancel}>
              Cancel
            </Button>
          ) : null}
          {analysisTask.status === 'loading' ? <Spinner className="h-3.5 w-3.5 text-brand-600" /> : null}
        </div>

        {analysisTask.error ? (
          <ErrorBox
            message={analysisTask.error}
            onRetry={() => void analysisTask.run((signal) => analyzeColumns(settings, dataset, signal))}
          />
        ) : null}

        {analysisTask.result ? (
          <div className="mt-2 space-y-2">
            <p className="text-[11px] leading-relaxed text-slate-600">{analysisTask.result.data.summary}</p>

            {analysisTask.result.data.warnings.map((warning) => (
              <p key={warning} className="text-[10px] text-amber-700">
                ⚠ {warning}
              </p>
            ))}

            <div className="space-y-1">
              {analysisTask.result.data.columns.map((column) => (
                <label
                  key={column.originalName}
                  className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200/80 p-2 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedColumns.has(column.originalName)}
                    onChange={() => toggleColumn(column.originalName)}
                    className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 accent-brand-600"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="truncate text-[11px] font-medium text-slate-700">
                        {column.suggestedName}
                      </span>
                      <Badge tone="brand">{DATA_TYPE_LABELS[column.dataType]}</Badge>
                    </div>
                    <p className="truncate text-[10px] text-slate-400">was: {column.originalName}</p>
                    {column.reason ? (
                      <p className="mt-0.5 text-[10px] leading-relaxed text-slate-500">{column.reason}</p>
                    ) : null}
                  </div>
                </label>
              ))}
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-slate-400">{selectedColumns.size} selected</span>
              <Button
                size="sm"
                variant="primary"
                disabled={selectedColumns.size === 0}
                onClick={applySelectedAnalysis}
              >
                Apply selected
              </Button>
            </div>
            <ResultMeta result={analysisTask.result} />
          </div>
        ) : null}
      </TaskCard>

      <TaskCard
        icon="filter"
        title="Suggest cleaning"
        description="Get a short list of justified cleaning steps. Each step is applied locally, one at a time."
      >
        <div className="mt-2 flex items-center gap-2">
          <Button
            size="sm"
            variant="primary"
            disabled={!ready || cleaningTask.status === 'loading'}
            onClick={() => {
              void cleaningTask.run((signal) => suggestCleaning(settings, dataset, signal));
            }}
          >
            <Icon name="filter" className="h-3.5 w-3.5" />
            Suggest
          </Button>
          {cleaningTask.status === 'loading' ? (
            <Button size="sm" variant="ghost" onClick={cleaningTask.cancel}>
              Cancel
            </Button>
          ) : null}
        </div>

        {cleaningTask.error ? (
          <ErrorBox
            message={cleaningTask.error}
            onRetry={() => void cleaningTask.run((signal) => suggestCleaning(settings, dataset, signal))}
          />
        ) : null}

        {cleaningTask.result ? (
          <div className="mt-2 space-y-2">
            <p className="text-[11px] leading-relaxed text-slate-600">{cleaningTask.result.data.summary}</p>

            <div className="space-y-1">
              {cleaningTask.result.data.suggestions.map((suggestion, index) => (
                <div
                  key={`${suggestion.operation}-${index}`}
                  className="rounded-lg border border-slate-200/80 p-2"
                >
                  <div className="flex items-start gap-2">
                    <Badge tone={suggestion.operation === 'manual-review' ? 'warning' : 'brand'}>
                      {OPERATION_LABELS[suggestion.operation]}
                    </Badge>
                    <p className="min-w-0 flex-1 text-[10px] leading-relaxed text-slate-600">
                      {suggestion.description}
                      {suggestion.target ? (
                        <span className="text-slate-400"> · {suggestion.target}</span>
                      ) : null}
                    </p>
                  </div>
                  {suggestion.operation !== 'manual-review' ? (
                    <div className="mt-1.5 flex justify-end">
                      <Button size="xs" variant="secondary" onClick={() => applyOneCleaning(suggestion)}>
                        Apply
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            <ResultMeta result={cleaningTask.result} />
          </div>
        ) : null}
      </TaskCard>

      <TaskCard
        icon="code"
        title="Custom instruction"
        description="Describe what you want in plain language. Page2Data maps it onto existing columns — it never invents data."
      >
        <Textarea
          value={instruction}
          onChange={(event) => setInstruction(event.target.value.slice(0, 2000))}
          rows={3}
          placeholder={'e.g. Keep the product name, price, and rating. Rename "Product Name" to "product".'}
          className="mt-2 text-[11px]"
          maxLength={2000}
        />

        <div className="mt-2 flex items-center gap-2">
          <Button
            size="sm"
            variant="primary"
            disabled={!ready || instruction.trim().length === 0 || instructionTask.status === 'loading'}
            onClick={() => {
              void instructionTask.run((signal) =>
                interpretInstruction(settings, dataset, instruction, signal),
              );
            }}
          >
            <Icon name="zap" className="h-3.5 w-3.5" />
            Interpret
          </Button>
          {instructionTask.status === 'loading' ? (
            <Button size="sm" variant="ghost" onClick={instructionTask.cancel}>
              Cancel
            </Button>
          ) : null}
        </div>

        {instructionTask.error ? (
          <ErrorBox
            message={instructionTask.error}
            onRetry={() =>
              void instructionTask.run((signal) =>
                interpretInstruction(settings, dataset, instruction, signal),
              )
            }
          />
        ) : null}

        {instructionTask.result ? (
          <div className="mt-2 space-y-2">
            <p className="text-[11px] leading-relaxed text-slate-600">{instructionTask.result.data.summary}</p>

            <div>
              <p className="text-[10px] font-medium text-slate-500">Columns to keep</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {instructionTask.result.data.keepColumns.length > 0 ? (
                  instructionTask.result.data.keepColumns.map((name) => (
                    <Badge key={name} tone="brand">
                      {name}
                    </Badge>
                  ))
                ) : (
                  <span className="text-[10px] text-slate-400">All columns (no selection returned)</span>
                )}
              </div>
            </div>

            {instructionTask.result.data.columnRenames.length > 0 ? (
              <div>
                <p className="text-[10px] font-medium text-slate-500">Renames</p>
                <ul className="mt-1 space-y-0.5">
                  {instructionTask.result.data.columnRenames.map((rename) => (
                    <li key={`${rename.from}-${rename.to}`} className="text-[10px] text-slate-500">
                      <span className="line-through opacity-60">{rename.from}</span>
                      <span className="px-1 text-slate-300">→</span>
                      <span className="font-medium text-slate-700">{rename.to}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {instructionTask.result.data.notes.length > 0 ? (
              <ul className="space-y-0.5">
                {instructionTask.result.data.notes.map((note) => (
                  <li key={note} className="text-[10px] leading-relaxed text-amber-700">
                    ⚠ {note}
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="flex items-center justify-end">
              <Button size="sm" variant="primary" onClick={applyPlan}>
                Apply plan
              </Button>
            </div>
            <ResultMeta result={instructionTask.result} />
          </div>
        ) : null}
      </TaskCard>

      <p className={cn('px-1 text-[10px] leading-relaxed text-slate-400')}>
        AI output is validated against this dataset before it can be applied. Generated code is never executed.
      </p>
    </div>
  );
}
