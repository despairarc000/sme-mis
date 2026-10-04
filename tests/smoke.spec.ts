import { expect, test } from "@playwright/test";

test("SME MIS shell loads", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("main.app-shell")).toBeVisible();
  await expect(page.getByText("SME MIS", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Overview" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Catalog & Items" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pricing" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Stock" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reports" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Public Price Lookup" })).toBeVisible();
});

test("primary navigation switches views", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: "Catalog & Items" }).click();
  await expect(page.getByRole("heading", { name: "Catalog & Items" })).toBeVisible();

  await page.getByRole("button", { name: "Pricing" }).click();
  await expect(page.getByRole("heading", { name: "Pricing" })).toBeVisible();

  await page.getByRole("button", { name: "Stock" }).click();
  await expect(page.getByRole("heading", { name: "Stock" })).toBeVisible();

  await page.getByRole("button", { name: "Reports" }).click();
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
});
