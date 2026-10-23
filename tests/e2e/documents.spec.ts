import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
const origin = process.env.E2E_BASE_URL ?? "http://localhost:3000";
test.skip(
  !process.env.E2E_PASSWORD ||
    !process.env.E2E_EMAIL_A ||
    !process.env.E2E_EMAIL_B,
  "Requires isolated synthetic fixture accounts.",
);
async function login(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.locator("#email").fill(process.env.E2E_EMAIL_A!);
  await page.locator("#password").fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByTestId("account-menu")).toBeVisible();
}
async function chooseBusiness(page: Page, id: string) {
  const menu = page.locator(".account-menu");
  if (!(await menu.evaluate((node) => (node as HTMLDetailsElement).open)))
    await page.getByTestId("account-menu").click();
  await page.locator("#account-business").selectOption(id);
  await expect(page.locator("#home-question")).toBeVisible();
}
test("private notebook upload, bilingual review, partial acceptance, lost-response retry, and source isolation", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const id = randomUUID();
  const created = await page.request.post("/api/businesses", {
    headers: { Origin: origin },
    data: {
      id,
      name: "Synthetic notebook verification " + id.slice(0, 6),
      activity: "products",
    },
  });
  expect(created.status()).toBe(200);
  await page.reload();
  await expect(page.getByTestId("account-menu")).toBeVisible();
  await chooseBusiness(page, id);
  await page
    .getByRole("button", { name: "Photograph a notebook", exact: true })
    .click();
  await expect(page.locator("#notebook-heading")).toBeVisible();
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 600;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff8e9";
    ctx.fillRect(0, 0, 900, 600);
    ctx.fillStyle = "#183f33";
    ctx.font = "26px sans-serif";
    ctx.fillText("SYNTHETIC NOTEBOOK · TEST ONLY", 40, 70);
    ctx.font = "22px sans-serif";
    ctx.fillText("Date | Description | Full amount | Payment", 40, 150);
    ctx.fillText(
      "2026-10-23 | Synthetic supplies | 125.50 | 25.25 paid",
      40,
      220,
    );
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.locator('input[type="file"]').setInputFiles({
    name: "synthetic-notebook.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(page.getByAltText("Selected notebook page")).toBeVisible();
  await page.getByRole("button", { name: "Tagalog", exact: true }).click();
  await expect(page.getByAltText("Napiling pahina")).toBeVisible();
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(
    page.getByText("Work saved on this device", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("account-menu")).toBeVisible();
  await page
    .getByRole("button", { name: "Photograph a notebook", exact: true })
    .click();
  await expect(page.getByAltText("Selected notebook page")).toBeVisible();
  let dropUpload = true;
  await page.route("**/api/documents", async (route) => {
    const body = route.request().postDataJSON();
    if (body?.action === "uploaded" && dropUpload) {
      dropUpload = false;
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await route.abort("failed");
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "Save original page", exact: true })
    .click();
  await expect(
    page.getByText(
      "This operation could not be confirmed. Your work is kept; retry the same operation.",
      { exact: true },
    ),
  ).toBeVisible({ timeout: 45000 });
  await page
    .getByRole("button", { name: "Save original page", exact: true })
    .click();
  await expect(
    page.getByText("Original page saved privately", { exact: true }),
  ).toBeVisible({ timeout: 45000 });
  await expect
    .poll(
      () =>
        page
          .getByRole("img", { name: "Original page", exact: true })
          .evaluate(
            (node) =>
              (node as HTMLImageElement).complete &&
              (node as HTMLImageElement).naturalWidth > 0,
          ),
      { timeout: 45000 },
    )
    .toBe(true);
  await expect(
    page.getByText("Automatic reading is not configured yet.", {
      exact: false,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add a missed entry", exact: true })
    .click();
  await page.getByLabel("Business date", { exact: true }).fill("2026-10-23");
  await page
    .getByLabel("What was this for?", { exact: true })
    .fill("Synthetic notebook supplies");
  await page.getByLabel("Full amount (PHP)", { exact: true }).fill("12.");
  await page.getByRole("button", { name: "Tagalog", exact: true }).click();
  await expect(
    page.getByLabel("Buong halaga (PHP)", { exact: true }),
  ).toHaveValue("12.");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.getByLabel("Full amount (PHP)", { exact: true }).fill("125.50");
  await page.getByLabel("Payment", { exact: true }).selectOption("partial");
  await page
    .getByLabel("Amount already paid (PHP)", { exact: true })
    .fill("25.25");
  await page.getByLabel("Payment date", { exact: true }).fill("2026-10-23");
  await page
    .getByRole("button", { name: "Save review changes", exact: true })
    .click();
  await expect(
    page.getByText("Review changes saved", { exact: true }),
  ).toBeVisible();
  const docList = await (
    await page.request.get(`/api/documents?businessId=${id}`)
  ).json();
  const docId = docList.data.documents[0].id as string;
  await page.screenshot({
    path: "test-results/documents-phone-review.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Review and save this entry", exact: true })
    .click();
  await page
    .getByLabel("I compared this entry with the original page.", {
      exact: true,
    })
    .check();
  await page
    .getByLabel(
      "I checked possible duplicates. This is a separate business event.",
      { exact: true },
    )
    .check();
  let drop = true;
  await page.route("**/api/documents", async (route) => {
    const body = route.request().postDataJSON();
    if (body?.action === "accept" && drop) {
      drop = false;
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await route.abort("failed");
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "Confirm and save record", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry account operation", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Retry account operation", exact: true })
    .click();
  await expect(
    page.getByText("Saved to your account", { exact: true }),
  ).toBeVisible();
  const detail = (
    await (
      await page.request.get(
        `/api/documents?businessId=${id}&documentId=${docId}`,
      )
    ).json()
  ).data;
  expect(detail.acceptedRows).toHaveLength(1);
  const txId = detail.acceptedRows[0].transactionId;
  const ledger = (
    await (
      await page.request.get(`/api/ledger/records/${txId}?businessId=${id}`)
    ).json()
  ).data;
  expect(ledger.record).toMatchObject({
    amountCentavos: "12550",
    paidCentavos: "2525",
    remainingCentavos: "10025",
    source: "document_review",
  });
  expect(ledger.record.sourceReference).toMatchObject({ documentId: docId });
  expect(ledger.payments).toHaveLength(1);
  expect(
    detail.history.filter(
      (item: { action: string }) => item.action === "uploaded",
    ),
  ).toHaveLength(1);
  const image = await page.request.get(
    `/api/documents?businessId=${id}&documentId=${docId}&image=1`,
  );
  expect(image.status()).toBe(200);
  expect(image.headers()["cache-control"]).toBe("private, no-store");
  expect(image.headers()["content-type"]).toContain("image/png");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test-results/documents-laptop-source.png",
    fullPage: true,
  });
  const other = await browser.newContext();
  try {
    const response = await other.request.post(origin + "/api/auth/sign-in", {
      headers: { Origin: origin },
      data: {
        email: process.env.E2E_EMAIL_B,
        password: process.env.E2E_PASSWORD,
      },
    });
    expect(response.status()).toBe(200);
    const denied = await other.request.get(
      origin + `/api/documents?businessId=${id}&documentId=${docId}&image=1`,
    );
    expect(denied.status()).toBe(403);
    const deniedReview = await other.request.post(origin + "/api/documents", {
      headers: { Origin: origin },
      data: {
        businessId: id,
        documentId: docId,
        operationId: randomUUID(),
        expectedRevision: detail.document.revision,
        action: "review",
        values: { rows: [] },
      },
    });
    expect(deniedReview.status()).toBe(403);
    const direct = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const signedIn = await direct.auth.signInWithPassword({
      email: process.env.E2E_EMAIL_B!,
      password: process.env.E2E_PASSWORD!,
    });
    expect(signedIn.error).toBeNull();
    const privateSource = await direct.storage
      .from("notebook-sources")
      .download(detail.document.object_path);
    expect(privateSource.data).toBeNull();
    expect(privateSource.error).not.toBeNull();
  } finally {
    await other.close();
  }
});
