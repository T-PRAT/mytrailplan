import { expect, test } from "@playwright/test";
import { setupCleanPage, uploadGpx } from "./helpers";

test.describe("Onglet Simulateur VAP", () => {
  test.beforeEach(async ({ page }) => {
    await setupCleanPage(page);
    await uploadGpx(page);
    await page.getByRole("tab", { name: "Simulateur VAP" }).click();
  });

  test("shows VAP mode by default with pace slider and stats", async ({
    page,
  }) => {
    await expect(page.getByRole("button", { name: "VAP cible" })).toBeVisible();
    await expect(page.getByRole("slider")).toBeVisible();

    // Stats should appear
    const stats = page.locator('[data-testid="gap-stats"]');
    await expect(stats).toBeVisible();
    await expect(stats.getByText("Temps estimé")).toBeVisible();
  });

  test("toggles to duration mode and shows input", async ({ page }) => {
    await page.getByRole("button", { name: "Durée cible" }).click();

    const input = page.locator("#gap-duration-input");
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute("placeholder", "ex: 4:30 ou 4h30");
  });

  test("entering valid duration in duration mode updates stats", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Durée cible" }).click();

    const input = page.locator("#gap-duration-input");
    await input.fill("5:00");

    const stats = page.locator('[data-testid="gap-stats"]');
    await expect(stats).toBeVisible();
    await expect(stats.getByText("VAP correspondante")).toBeVisible();
  });

  test("invalid duration shows error state on input", async ({ page }) => {
    await page.getByRole("button", { name: "Durée cible" }).click();

    const input = page.locator("#gap-duration-input");
    await input.fill("abc");

    await expect(input).toHaveClass(/border-red-700/);
  });

  test("pace curve toggle switch works", async ({ page }) => {
    const paceSwitch = page.getByRole("switch", {
      name: "Afficher la courbe d'allure",
    });
    await expect(paceSwitch).toBeVisible();
    await expect(paceSwitch).toHaveAttribute("aria-checked", "false");

    await paceSwitch.click();

    await expect(paceSwitch).toHaveAttribute("aria-checked", "true");
  });

  test("chart SVG is visible", async ({ page }) => {
    const svg = page.locator('[aria-label="Simulateur VAP — profil altimétrique"]');
    await expect(svg).toBeVisible();
  });
});
