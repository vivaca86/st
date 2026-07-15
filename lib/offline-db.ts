import type { OfflineAttempt, OfflineExamSession, OfflinePack } from "./types";

const DATABASE_NAME = "jeonsangi-offline";
const DATABASE_VERSION = 1;
const PACKS_STORE = "packs";
const META_STORE = "meta";
const SESSIONS_STORE = "sessions";
const ATTEMPTS_STORE = "attempts";

type MetaRow = { key: string; value: string };

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("로컬 저장소 요청에 실패했습니다."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("로컬 저장에 실패했습니다."));
    transaction.onabort = () => reject(transaction.error ?? new Error("로컬 저장이 취소되었습니다."));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("이 브라우저는 오프라인 저장소를 지원하지 않습니다."));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PACKS_STORE)) {
        database.createObjectStore(PACKS_STORE, { keyPath: "version" });
      }
      if (!database.objectStoreNames.contains(META_STORE)) {
        database.createObjectStore(META_STORE, { keyPath: "key" });
      }
      if (!database.objectStoreNames.contains(SESSIONS_STORE)) {
        database.createObjectStore(SESSIONS_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(ATTEMPTS_STORE)) {
        database.createObjectStore(ATTEMPTS_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("오프라인 저장소를 열지 못했습니다."));
  });
}

export async function installOfflinePack(pack: OfflinePack): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction([PACKS_STORE, META_STORE], "readwrite");
    transaction.objectStore(PACKS_STORE).put(pack);
    transaction.objectStore(META_STORE).put({ key: "installedPackVersion", value: pack.version } satisfies MetaRow);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function getOfflinePackByVersion(version: string): Promise<OfflinePack | null> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(PACKS_STORE, "readonly");
    const pack = await requestResult(
      transaction.objectStore(PACKS_STORE).get(version) as IDBRequest<OfflinePack | undefined>,
    );
    return pack ?? null;
  } finally {
    database.close();
  }
}

export async function getInstalledOfflinePack(): Promise<OfflinePack | null> {
  const database = await openDatabase();
  try {
    const metaTransaction = database.transaction(META_STORE, "readonly");
    const meta = await requestResult(
      metaTransaction.objectStore(META_STORE).get("installedPackVersion") as IDBRequest<MetaRow | undefined>,
    );
    if (!meta) return null;
    const packTransaction = database.transaction(PACKS_STORE, "readonly");
    const pack = await requestResult(
      packTransaction.objectStore(PACKS_STORE).get(meta.value) as IDBRequest<OfflinePack | undefined>,
    );
    return pack ?? null;
  } finally {
    database.close();
  }
}

export async function saveOfflineSession(session: OfflineExamSession): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(SESSIONS_STORE, "readwrite");
    transaction.objectStore(SESSIONS_STORE).put({ ...session, id: "active" });
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function getOfflineSession(): Promise<OfflineExamSession | null> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(SESSIONS_STORE, "readonly");
    const session = await requestResult(
      transaction.objectStore(SESSIONS_STORE).get("active") as IDBRequest<OfflineExamSession | undefined>,
    );
    return session ?? null;
  } finally {
    database.close();
  }
}

export async function clearOfflineSession(): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(SESSIONS_STORE, "readwrite");
    transaction.objectStore(SESSIONS_STORE).delete("active");
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function completeOfflineExam(attempt: OfflineAttempt): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction([ATTEMPTS_STORE, SESSIONS_STORE], "readwrite");
    transaction.objectStore(ATTEMPTS_STORE).put(attempt);
    transaction.objectStore(SESSIONS_STORE).delete("active");
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function deleteOfflineData(): Promise<void> {
  const database = await openDatabase();
  try {
    const stores = [PACKS_STORE, META_STORE, SESSIONS_STORE, ATTEMPTS_STORE];
    const transaction = database.transaction(stores, "readwrite");
    for (const store of stores) transaction.objectStore(store).clear();
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}
