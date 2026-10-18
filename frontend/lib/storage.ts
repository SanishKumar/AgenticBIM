import { validateWorkspace, type Workspace } from "./workspace-backup";
const open = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("trace-workspace", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("state");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
export async function loadWorkspace(): Promise<Workspace | null> {
  await pendingSave.catch(() => {});
  const db = await open();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("state", "readonly");
    const request = transaction.objectStore("state").get("workspace");
    transaction.oncomplete = () => {
      db.close();
      try {
        resolve(
          request.result == null ? null : validateWorkspace(request.result),
        );
      } catch (error) {
        reject(error);
      }
    };
    transaction.onabort = transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}
// Preserve call order even when opening IndexedDB resolves out of order.
// A restore waits for prior autosaves and commits before replacing visible state.
let pendingSave: Promise<void> = Promise.resolve();
export function saveWorkspace(workspace: Workspace) {
  pendingSave = pendingSave
    .catch(() => {})
    .then(() => writeWorkspace(workspace));
  return pendingSave;
}
async function writeWorkspace(workspace: Workspace) {
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
