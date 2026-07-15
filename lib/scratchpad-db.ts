export type ScratchpadTool = "pen" | "eraser";

export type ScratchpadPoint = {
  /** Canvas-relative coordinate in the range 0..1. */
  x: number;
  /** Canvas-relative coordinate in the range 0..1. */
  y: number;
  /** Pointer pressure in the range 0..1. */
  pressure: number;
};

export type ScratchpadStroke = {
  id: string;
  tool: ScratchpadTool;
  color: string;
  width: number;
  /** Canvas aspect ratio when the stroke was written, used to prevent rotation distortion. */
  aspectRatio?: number;
  points: ScratchpadPoint[];
};

type ScratchpadRecord = {
  storageKey: string;
  strokes: ScratchpadStroke[];
  updatedAt: string;
};

const DATABASE_NAME = "jeonsangi-scratchpads";
const DATABASE_VERSION = 1;
const STORE_NAME = "scratchpads";

const writeQueues = new Map<string, Promise<void>>();

function assertStorageKey(storageKey: string): void {
  if (!storageKey.trim()) {
    throw new Error("필기장을 저장하려면 문제 식별자가 필요합니다.");
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("필기장 저장소 요청에 실패했습니다."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("필기장 저장소 작업에 실패했습니다."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("필기장 저장소 작업이 취소되었습니다."));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("이 브라우저는 기기 내 필기 저장을 지원하지 않습니다."));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "storageKey" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("기기 내 필기 저장소를 열 수 없습니다."));
  });
}

function enqueueWrite(storageKey: string, operation: () => Promise<void>): Promise<void> {
  const previous = writeQueues.get(storageKey) ?? Promise.resolve();
  const queued = previous.catch(() => undefined).then(operation);
  writeQueues.set(storageKey, queued);
  queued.then(
    () => {
      if (writeQueues.get(storageKey) === queued) writeQueues.delete(storageKey);
    },
    () => {
      if (writeQueues.get(storageKey) === queued) writeQueues.delete(storageKey);
    },
  );
  return queued;
}

function isScratchpadStroke(value: unknown): value is ScratchpadStroke {
  if (!value || typeof value !== "object") return false;
  const stroke = value as Partial<ScratchpadStroke>;
  return (
    typeof stroke.id === "string" &&
    (stroke.tool === "pen" || stroke.tool === "eraser") &&
    typeof stroke.color === "string" &&
    typeof stroke.width === "number" &&
    (stroke.aspectRatio === undefined ||
      (typeof stroke.aspectRatio === "number" && stroke.aspectRatio > 0)) &&
    Array.isArray(stroke.points) &&
    stroke.points.every(
      (point) =>
        point !== null &&
        typeof point === "object" &&
        typeof (point as ScratchpadPoint).x === "number" &&
        typeof (point as ScratchpadPoint).y === "number" &&
        typeof (point as ScratchpadPoint).pressure === "number",
    )
  );
}

export async function loadScratchpad(storageKey: string): Promise<ScratchpadStroke[]> {
  assertStorageKey(storageKey);
  await writeQueues.get(storageKey)?.catch(() => undefined);

  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const record = await requestResult(
      transaction.objectStore(STORE_NAME).get(storageKey) as IDBRequest<ScratchpadRecord | undefined>,
    );
    if (!record || !Array.isArray(record.strokes)) return [];
    return record.strokes.filter(isScratchpadStroke);
  } finally {
    database.close();
  }
}

export function saveScratchpad(storageKey: string, strokes: ScratchpadStroke[]): Promise<void> {
  assertStorageKey(storageKey);
  const record: ScratchpadRecord = {
    storageKey,
    strokes,
    updatedAt: new Date().toISOString(),
  };

  return enqueueWrite(storageKey, async () => {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(record);
      await transactionDone(transaction);
    } finally {
      database.close();
    }
  });
}

export function deleteScratchpad(storageKey: string): Promise<void> {
  assertStorageKey(storageKey);
  return enqueueWrite(storageKey, async () => {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(storageKey);
      await transactionDone(transaction);
    } finally {
      database.close();
    }
  });
}
