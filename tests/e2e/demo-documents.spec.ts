import { test, expect, type Page } from "@playwright/test";
import type { DemoState } from "@/features/demo/demo-store";

const origin = process.env.E2E_BASE_URL ?? "http://localhost:3002";
test.skip(process.env.E2E_DEMO !== "1", "Requires the explicit demo build.");
test.use({ baseURL: origin, serviceWorkers: "block" });
test.setTimeout(90000);

async function demoState(page: Page) {
  return page.evaluate(
    () =>
      new Promise<DemoState>((resolve, reject) => {
        const opening = indexedDB.open("msme-public-demo-v1");
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const db = opening.result;
          const transaction = db.transaction("sessions", "readonly");
          const request = transaction.objectStore("sessions").get("current");
          transaction.oncomplete = () => db.close();
          transaction.onerror = () => reject(transaction.error);
          request.onsuccess = () => {
            const state = (request.result as { value: DemoState } | undefined)
              ?.value;
            if (state) resolve(state);
            else reject(new Error("Missing local demo state"));
          };
        };
      }),
  );
}

async function originalVisible(page: Page) {
  const image = page.getByRole("img", { name: "Original page", exact: true });
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("src", /^blob:/);
  await expect
    .poll(() =>
      image.evaluate(
        (node) =>
          (node as HTMLImageElement).complete &&
          (node as HTMLImageElement).naturalWidth === 900,
      ),
    )
    .toBe(true);
}

test("demo notebook photo, bilingual manual review, source-linked partial acceptance and reload stay browser-only", async ({
  page,
  context,
}, testInfo) => {
  const forbidden: string[] = [];
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/api/") || /supabase/i.test(url.hostname)) {
      forbidden.push(url.origin + url.pathname);
      await route.abort("blockedbyclient");
    } else await route.continue();
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.locator("#home-question")).toBeVisible();
  await expect(page.locator("#email")).toHaveCount(0);
  const before = await demoState(page);
  expect(Object.keys(before.documents.documents)).toHaveLength(0);
  await page
    .getByRole("button", { name: "Photograph a notebook", exact: true })
    .click();
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 600;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff8e9";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#183f33";
    ctx.font = "26px sans-serif";
    ctx.fillText("SYNTHETIC NOTEBOOK · DEMO ONLY", 40, 70);
    ctx.font = "22px sans-serif";
    ctx.fillText("Date | Description | Full amount | Payment", 40, 150);
    ctx.fillText("2026-10-23 | Sample supplies | 125.50 | 25.25 paid", 40, 220);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.locator('input[type="file"]').setInputFiles({
    name: "synthetic-demo-notebook.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(page.getByAltText("Selected notebook page")).toBeVisible();
  await expect(
    page.getByText("Work saved on this device", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator("#home-question")).toBeVisible();
  await page
    .getByRole("button", { name: "Photograph a notebook", exact: true })
    .click();
  await expect(page.getByAltText("Selected notebook page")).toBeVisible();
  await page
    .getByRole("button", {
      name: "Keep sample photo in this browser",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Sample page saved only in this browser", { exact: true }),
  ).toBeVisible();
  await originalVisible(page);
  await expect(
    page.getByText(
      "This demo does not use external automatic reading. Review the sample page and enter its rows manually.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add a missed entry", exact: true })
    .click();
  await page.getByLabel("Business date", { exact: true }).fill("2026-10-23");
  await page
    .getByLabel("What was this for?", { exact: true })
    .fill("Sample notebook supplies · browser-only");
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
    page.getByText(/^Review changes saved(?: in this browser)?$/),
  ).toBeVisible();
  const reviewed = await demoState(page);
  expect(
    Object.values(reviewed.ledgers).flatMap((ledger) => ledger.details),
  ).toHaveLength(4);
  await page.screenshot({
    path: testInfo.outputPath("demo-notebook-phone-review.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
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
  await page
    .getByRole("button", { name: "Confirm and save record", exact: true })
    .click();
  await expect(
    page.getByText("Saved in this browser · demo", { exact: true }),
  ).toBeVisible();
  const saved = await demoState(page);
  const savedDocument = Object.values(saved.documents.documents)[0];
  expect(savedDocument.acceptedRows).toHaveLength(1);
  const details = Object.values(saved.ledgers).flatMap(
    (ledger) => ledger.details,
  );
  expect(details).toHaveLength(5);
  const accepted = details.find(
    (detail) =>
      detail.record.id === savedDocument.acceptedRows[0].transactionId,
  )!;
  expect(accepted.record).toMatchObject({
    amountCentavos: "12550",
    paidCentavos: "2525",
    remainingCentavos: "10025",
    source: "document_review",
    sourceReference: {
      documentId: savedDocument.document.id,
      rowId: savedDocument.acceptedRows[0].rowId,
      sourceType: "sales_notebook",
    },
  });
  expect(accepted.payments).toHaveLength(1);
  await page.reload();
  await expect(page.locator("#home-question")).toBeVisible();
  await page.getByRole("button", { name: "Find records", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Sample notebook supplies · browser-only",
      exact: true,
    })
    .click();
  await expect(page.getByText("₱100.25", { exact: true })).toBeVisible();
  await expect(page.locator('a[href^="/api/documents"]')).toHaveCount(0);
  await page
    .getByRole("button", { name: "Source reference", exact: true })
    .click();
  await originalVisible(page);
  await expect(
    page.getByLabel("Full amount (PHP)", { exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByLabel("Full amount (PHP)", { exact: true }),
  ).toHaveValue("125.50");
  const reloaded = await demoState(page);
  expect(
    Object.values(reloaded.documents.documents)[0].acceptedRows,
  ).toHaveLength(1);
  expect(
    Object.values(reloaded.ledgers).flatMap((ledger) => ledger.details),
  ).toHaveLength(5);
  await page.setViewportSize({ width: 1440, height: 1000 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("demo-notebook-laptop-source.png"),
    fullPage: true,
  });
  expect(forbidden).toEqual([]);
});
