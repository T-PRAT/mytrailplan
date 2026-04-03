import { expect, test } from "@playwright/test";
import { setupCleanPage, uploadGpx } from "./helpers";

test.describe("Onglet Ravitaillements", () => {
  test.beforeEach(async ({ page }) => {
    await setupCleanPage(page);
    await uploadGpx(page);
    await page.getByRole("tab", { name: "Ravitaillements" }).click();
    // Wait for the component to render (h2 heading inside the component)
    await page.getByText("Ravitaillements").nth(1).waitFor();
  });

  test("displays the aid station tab content", async ({ page }) => {
    await expect(page.getByText("Objectifs nutrition")).toBeVisible();
    await expect(page.getByText("Glucides")).toBeVisible();
    await expect(page.getByText("g/h").first()).toBeVisible();
  });

  test("can add an aid station", async ({ page }) => {
    const addBtn = page.getByRole("button", { name: "+ Ravito" });
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    // Fill in km field (total distance is ~5.4km, use 2km)
    const kmInput = page.locator('input[placeholder="km"]');
    await expect(kmInput).toBeVisible();
    await kmInput.fill("2");

    // Submit the form
    await page.getByRole("button", { name: "Ajouter" }).click();

    // Station appears in the SVG chart as a text label
    await expect(page.locator("svg text").filter({ hasText: "Ravito 1" }).first()).toBeVisible();
  });

  test("can delete an aid station with confirmation", async ({ page }) => {
    // Add a station first
    await page.getByRole("button", { name: "+ Ravito" }).click();
    await page.locator('input[placeholder="km"]').fill("2");
    await page.getByRole("button", { name: "Ajouter" }).click();
    await expect(page.locator("svg text").filter({ hasText: "Ravito 1" }).first()).toBeVisible();

    // Use keyboard navigation to open the edit popover:
    // the station <g> has tabIndex=0 and onKeyDown that opens popover on Enter
    const stationG = page
      .locator('g[tabindex="0"]')
      .filter({ hasText: "Ravito 1" });
    await stationG.focus();
    await stationG.press("Enter");

    // The editing popover has a "Supprimer" button
    const deleteInPopover = page.getByRole("button", { name: "Supprimer" });
    await expect(deleteInPopover).toBeVisible();
    await deleteInPopover.click();

    // Confirmation alert dialog
    const alertDialog = page.getByRole("alertdialog");
    await expect(alertDialog).toBeVisible();
    await alertDialog.getByRole("button", { name: "Supprimer" }).click();

    // Station should be gone from SVG
    await expect(page.locator("svg text").filter({ hasText: "Ravito 1" })).not.toBeVisible();
  });

  test("food library drawer opens with default items", async ({ page }) => {
    // Open the food library drawer
    await page.getByRole("button", { name: /Bibliothèque d'aliments/ }).click();

    // Default items should be visible in the drawer
    const drawer = page.getByRole("dialog", { name: "Bibliothèque d'aliments" });
    await expect(drawer.getByText("Flasque eau")).toBeVisible();
    await expect(drawer.getByText("Gel classique")).toBeVisible();
    await expect(drawer.getByText("Barre énergie")).toBeVisible();
    await expect(drawer.getByText("Comprimé caféine")).toBeVisible();
    // "Ajouter un aliment" button is also in the drawer
    await expect(page.getByText("Ajouter un aliment")).toBeVisible();
  });

  test("nutrition target controls are interactive", async ({ page }) => {
    await expect(page.getByText("g/h").first()).toBeVisible();
    await expect(page.getByText("mL/h").first()).toBeVisible();
    await expect(page.getByText("Eau").first()).toBeVisible();
    await expect(page.getByText("Sodium").first()).toBeVisible();
  });
});
