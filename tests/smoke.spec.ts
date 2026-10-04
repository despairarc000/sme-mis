import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/rest/v1/rpc/lookup_public_prices**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "[]",
    });
  });
});

test("public price lookup shell loads", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.getByText("SME MIS", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("PUBLIC PRICE LOOKUP", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Compare current listed prices." })).toBeVisible();
  await expect(page.getByPlaceholder("Search product, brand, alias, or barcode")).toBeVisible();
  await expect(page.getByRole("button", { name: "Staff sign in" })).toBeVisible();
});

test("staff sign-in screen is reachable from the public page", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: "Staff sign in" }).click();

  await expect(page.getByRole("heading", { name: "Sign in to your store workspace." })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("public search accepts a lookup query without leaving the page", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const search = page.getByPlaceholder("Search product, brand, alias, or barcode");
  await search.fill("rice");

  await expect(page.getByRole("heading", { name: "Compare current listed prices." })).toBeVisible();
  await expect(search).toHaveValue("rice");
});
