import { expect, test } from "@playwright/test";
import { setupCleanPage, uploadGpx } from "./helpers";

test.describe("Project Management", () => {
  test.beforeEach(async ({ page }) => {
    await setupCleanPage(page);
    await uploadGpx(page);
  });

  test("shows project in picker dialog after upload", async ({ page }) => {
    await page.getByRole("button", { name: "Mes projets" }).click();

    const dialog = page.getByRole("dialog", { name: "Mes projets" });
    await expect(dialog).toBeVisible();
    // Project row should contain "sample" in a button
    await expect(
      dialog.getByRole("button", { name: /sample/ }).first()
    ).toBeVisible();
  });

  test("renames project via inline edit", async ({ page }) => {
    await page.getByRole("button", { name: "Mes projets" }).click();

    const dialog = page.getByRole("dialog", { name: "Mes projets" });
    await expect(dialog).toBeVisible();

    // Hover to reveal action buttons (opacity-0 until hover)
    const projectRow = dialog.locator(".group").first();
    await projectRow.hover();

    // Click rename button (has aria-label="Renommer", hidden until hover)
    await dialog.getByRole("button", { name: "Renommer" }).click({ force: true });

    // Input appears for inline edit (no explicit type attr, use getByRole)
    const input = dialog.getByRole("textbox").first();
    await input.fill("Mon trail");
    await input.press("Enter");

    await expect(dialog.getByText("Mon trail").first()).toBeVisible();
  });

  test("deletes project with confirmation dialog", async ({ page }) => {
    await page.getByRole("button", { name: "Mes projets" }).click();

    const dialog = page.getByRole("dialog", { name: "Mes projets" });
    await expect(dialog).toBeVisible();

    // Hover to reveal action buttons
    const projectRow = dialog.locator(".group").first();
    await projectRow.hover();

    // Click delete button (has aria-label="Supprimer")
    await dialog.getByRole("button", { name: "Supprimer" }).click();

    // Confirmation alert dialog
    const confirmDialog = page.getByRole("alertdialog");
    await expect(confirmDialog).toBeVisible();
    await expect(
      confirmDialog.getByText("Supprimer le projet ?")
    ).toBeVisible();

    await confirmDialog.getByRole("button", { name: "Supprimer" }).click();

    // Project list should be empty or show "+" button
    await expect(
      dialog.getByRole("button", { name: /sample/ })
    ).not.toBeVisible();
  });

  test("opens existing project from list on home screen", async ({ page }) => {
    // Clear only the appState (removes active project ID, keeps project data)
    await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("trailprep");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onupgradeneeded = (e) =>
          resolve((e.target as IDBOpenDBRequest).result);
      });
      const tx = db.transaction(["appState"], "readwrite");
      tx.objectStore("appState").clear();
      await new Promise<void>((resolve) => {
        tx.oncomplete = () => resolve();
      });
      db.close();
    });
    await page.reload();

    // App should show home screen with project list (no active project)
    await page.getByRole("img", { name: "TrailPrep" }).waitFor();
    await expect(page.getByText("Mes projets")).toBeVisible();

    // Click on the project in the home list
    await page.getByRole("button", { name: /sample/ }).first().click();

    // Should load project with tabs
    await expect(page.getByRole("tab", { name: "Pentes" })).toBeVisible();
  });
});
