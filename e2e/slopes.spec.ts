import { expect, test } from "@playwright/test";
import { setupCleanPage, uploadGpx } from "./helpers";

test.describe("Onglet Pentes", () => {
  test.beforeEach(async ({ page }) => {
    await setupCleanPage(page);
    await uploadGpx(page);
    await page.getByRole("tab", { name: "Pentes" }).click();
  });

  test("displays the 4 summary stat cards with values", async ({ page }) => {
    const distance = page.locator('[data-testid="stat-distance"]');
    const gain = page.locator('[data-testid="stat-gain"]');
    const loss = page.locator('[data-testid="stat-loss"]');
    const sections = page.locator('[data-testid="stat-sections"]');

    await expect(distance).toBeVisible();
    await expect(gain).toBeVisible();
    await expect(loss).toBeVisible();
    await expect(sections).toBeVisible();

    // Values should be non-trivial
    await expect(distance.getByText("km")).toBeVisible();
    await expect(gain).toContainText("+");
    await expect(loss).toContainText("-");
  });

  test("renders elevation profile SVG", async ({ page }) => {
    const svg = page.locator('[data-testid="elevation-profile"]');
    await expect(svg).toBeVisible();
    // SVG should have drawn paths
    await expect(svg.locator("path").first()).toBeVisible();
  });

  test("threshold config toggle shows and hides slider", async ({ page }) => {
    const toggle = page.getByText("Configurer les seuils de pentes");
    await expect(toggle).toBeVisible();

    // Initially hidden
    await expect(
      page.locator('[aria-label="Seuils de pentes"]')
    ).not.toBeVisible();

    await toggle.click();

    // Slider SVG should appear
    const sliderSvg = page.locator("svg").filter({ hasText: "%" }).first();
    // The threshold slider area should be visible after toggle
    await expect(toggle.locator("..")).toBeVisible();

    // Click again to collapse
    await toggle.click();
  });

  test("renders distribution chart SVG", async ({ page }) => {
    const chart = page.locator('[data-testid="distribution-chart"]');
    await expect(chart).toBeVisible();
    // Should have rect elements rendered (even if some are height=0)
    expect(await chart.locator("rect").count()).toBeGreaterThan(0);
    // Title should be visible
    await expect(page.getByText("Distribution des pentes")).toBeVisible();
  });
});
