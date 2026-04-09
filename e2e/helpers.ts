import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function clearIndexedDB(page: Page) {
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("trailprep");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onupgradeneeded = (e) =>
        resolve((e.target as IDBOpenDBRequest).result);
    });
    const storeNames = Array.from(db.objectStoreNames);
    if (storeNames.length === 0) {
      db.close();
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeNames, "readwrite");
      for (const name of storeNames) {
        tx.objectStore(name).clear();
      }
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  });
}

export async function uploadGpx(page: Page, filename = "sample.gpx") {
  const filePath = path.resolve(__dirname, "fixtures", filename);
  const input = page.locator('input[type="file"][accept=".gpx"]');
  await input.setInputFiles(filePath);
  await page.getByRole("tab", { name: "Pentes" }).waitFor();
}

export async function setupCleanPage(page: Page) {
  await page.goto("/");
  await clearIndexedDB(page);
  await page.reload();
  await page.getByRole("img", { name: "MyTrailPlan" }).waitFor();
}
