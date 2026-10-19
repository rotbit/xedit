/**
 * Minimal IndexedDB key-value store just for the Vault: only stores FileSystemDirectoryHandle
 * (it's structured-cloneable; localStorage can't hold it). Any failure rejects; callers handle it.
 */
import { t } from "@/i18n/t";

const DB_NAME = "xedit-vault";
const STORE = "kv";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error(t("当前环境没有 IndexedDB")));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error(t("打开 IndexedDB 失败")));
  });
}

/** One operation per transaction; close the connection when done */
async function run<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error ?? new Error(t("IndexedDB 读写失败")));
    tx.oncomplete = () => db.close();
  });
}

export function idbGet<T>(key: string): Promise<T | undefined> {
  return run<T | undefined>("readonly", (s) => s.get(key));
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  await run("readwrite", (s) => s.put(value, key));
}

export async function idbDel(key: string): Promise<void> {
  await run("readwrite", (s) => s.delete(key));
}
