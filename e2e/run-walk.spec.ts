import { expect, test } from "@playwright/test";
import { setupCleanPage, uploadGpx } from "./helpers";

test.describe("Onglet Course / Marche", () => {
  test.beforeEach(async ({ page }) => {
    await setupCleanPage(page);
    await uploadGpx(page);
    await page.getByRole("tab", { name: "Course / Marche" }).click();
  });

  test("displays run/walk split with default threshold", async ({ page }) => {
    await expect(page.getByText("Seuil de marche")).toBeVisible();

    const runDist = page.locator('[data-testid="run-distance"]');
    const walkDist = page.locator('[data-testid="walk-distance"]');

    await expect(runDist).toBeVisible();
    await expect(walkDist).toBeVisible();

    await expect(runDist).toContainText("Course —");
    await expect(walkDist).toContainText("Marche —");
    await expect(runDist).toContainText("km");
    await expect(walkDist).toContainText("km");
  });

  test("walk threshold slider is visible and interactive", async ({ page }) => {
    const slider = page.getByRole("slider");
    await expect(slider).toBeVisible();

    // Default value should be 15%
    await expect(slider).toHaveAttribute("aria-valuenow", "15");
  });

  test("changing slider updates run/walk split", async ({ page }) => {
    const runDist = page.locator('[data-testid="run-distance"]');
    const initialText = await runDist.textContent();

    const slider = page.getByRole("slider");
    // Move slider right to increase threshold (more walking)
    await slider.press("ArrowRight");
    await slider.press("ArrowRight");
    await slider.press("ArrowRight");
    await slider.press("ArrowRight");
    await slider.press("ArrowRight");

    const updatedText = await runDist.textContent();
    // Text should have changed (more threshold = more walk = less run)
    expect(updatedText).not.toBe(initialText);
  });

  test("renders colored elevation profile SVG", async ({ page }) => {
    const svg = page.locator('[aria-label="Profil course/marche"]');
    await expect(svg).toBeVisible();
    // Should have colored rect segments
    expect(await svg.locator("rect").count()).toBeGreaterThan(0);
  });
});
