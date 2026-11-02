import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Dataset, DatasetSummary } from '@/types/dataset';

interface Page2DataDb extends DBSchema {
  datasets: {
    key: string;
    value: Dataset;
    indexes: { extractedAt: string };
  };
}

const DB_NAME = 'page2data';
const DB_VERSION = 1;
const STORE = 'datasets';

let database: Promise<IDBPDatabase<Page2DataDb>> | null = null;

function db(): Promise<IDBPDatabase<Page2DataDb>> {
  database ??= openDB<Page2DataDb>(DB_NAME, DB_VERSION, {
    upgrade(database_) {
      if (!database_.objectStoreNames.contains(STORE)) {
        const store = database_.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('extractedAt', 'extractedAt');
      }
    },
  });
  return database;
}

export function summarizeDataset(dataset: Dataset): DatasetSummary {
  return {
    id: dataset.id,
    name: dataset.name,
    sourceTitle: dataset.sourceTitle,
    sourceUrl: dataset.sourceUrl,
    extractedAt: dataset.extractedAt,
    rowCount: dataset.rows.length,
    columnCount: dataset.columns.length,
  };
}

/** All saved datasets, newest first. */
export async function listDatasets(): Promise<DatasetSummary[]> {
  const all = await (await db()).getAll(STORE);
  return all.map(summarizeDataset).sort((a, b) => b.extractedAt.localeCompare(a.extractedAt));
}

export async function getDataset(id: string): Promise<Dataset | undefined> {
  return (await db()).get(STORE, id);
}

export async function saveDataset(dataset: Dataset): Promise<void> {
  await (await db()).put(STORE, dataset);
}

export async function deleteDataset(id: string): Promise<void> {
  await (await db()).delete(STORE, id);
}

export async function clearDatasets(): Promise<void> {
  await (await db()).clear(STORE);
}
