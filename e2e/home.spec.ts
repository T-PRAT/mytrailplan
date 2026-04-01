import { expect, test } from "@playwright/test";
import { clearIndexedDB, setupCleanPage, uploadGpx } from "./helpers";

test.describe("Home / File Upload", () => {
  test.beforeEach(async ({ page }) => {
    await setupCleanPage(page);
  });

  test("shows upload zone when no projects exist", async ({ page }) => {
    await expect(
      page.getByText("Déposez votre fichier GPX ici")
    ).toBeVisible();
    await expect(page.getByText("Parcourir les fichiers")).toBeVisible();
  });

  test("uploads GPX via file picker and navigates to project view", async ({
    page,
  }) => {
    await uploadGpx(page);

    await expect(page.getByRole("tab", { name: "Pentes" })).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "Course / Marche" })
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "Simulateur VAP" })
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "Ravitaillements" })
    ).toBeVisible();

    // Project name from filename
    await expect(page.getByText("sample")).toBeVisible();
  });

  test("shows error for invalid file", async ({ page }) => {
    const input = page.locator('input[type="file"][accept=".gpx"]');
    await input.setInputFiles({
      name: "bad.gpx",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("not valid xml"),
    });

    await expect(page.locator(".border-red-800")).toBeVisible();
  });

  test("shows project list when projects exist", async ({ page }) => {
    await uploadGpx(page);

    // Go back to home
    await page.goto("/");
    await clearIndexedDB(page);

    // Re-upload to have a project in DB
    await page.goto("/");
    await uploadGpx(page);

    // Navigate home again (simulate by clearing IDB via the link)
    // The app shows project list on home when projects exist
    await page.goto("/");
    await page.reload();

    await expect(page.getByText("Mes projets")).toBeVisible();
    await expect(page.getByText("sample")).toBeVisible();
  });
});
