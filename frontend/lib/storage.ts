import type { Decisions, ModelSnapshot, ReviewPolicy } from "./model";

export type Workspace = {
  model: ModelSnapshot;
  baseline: ModelSnapshot | null;
  policy: ReviewPolicy;
  decisions: Decisions;
  decisionContext: string;
};
const open = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("trace-workspace", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("state");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
export async function loadWorkspace(): Promise<Workspace | null> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("state", "readonly");
    const request = transaction.objectStore("state").get("workspace");
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}
export async function saveWorkspace(workspace: Workspace) {
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("state", "readwrite");
    transaction.objectStore("state").put(workspace, "workspace");
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
    transaction.onabort = () => {
      db.close();
      reject(transaction.error);
    };
  });
}
