import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
const origin = process.env.E2E_BASE_URL ?? "http://localhost:3000";
test.skip(
  !process.env.E2E_PASSWORD ||
    !process.env.E2E_EMAIL_A ||
    !process.env.E2E_EMAIL_B,
  "Requires isolated synthetic accounts.",
);
test.setTimeout(120000);
async function login(
  request: APIRequestContext,
  email = process.env.E2E_EMAIL_A!,
) {
  expect(
    (
      await request.post("/api/auth/sign-in", {
        headers: { Origin: origin },
        data: { email, password: process.env.E2E_PASSWORD },
      })
    ).status(),
  ).toBe(200);
}
async function signIn(page: Page) {
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(20000);
  await page.goto("/");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.locator("#email").fill(process.env.E2E_EMAIL_A!);
  await page.locator("#password").fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByTestId("account-menu")).toBeVisible();
}
async function business(request: APIRequestContext, name: string) {
  const id = randomUUID();
  const response = await request.post("/api/businesses", {
    headers: { Origin: origin },
    data: { id, name: "Synthetic " + name, activity: "products" },
  });
  expect(response.status()).toBe(200);
  return id;
}
async function selectBusiness(page: Page, id: string) {
  // The fixture was created through HTTP after this page loaded; reload owned profiles.
  await page.reload();
  await expect(page.locator("#home-question")).toBeVisible();
  if (
    !(await page
      .locator(".account-menu")
      .evaluate((node) => (node as HTMLDetailsElement).open))
  )
    await page.getByTestId("account-menu").click();
  await page.locator("#account-business").selectOption(id);
  await expect(page.locator("#home-question")).toBeVisible();
}
async function mutate(
  request: APIRequestContext,
  businessId: string,
  action: string,
  values: Record<string, unknown>,
  recordId?: string,
  expectedRevision = 0,
  operationId = randomUUID(),
) {
  const response = await request.post("/api/ledger", {
    headers: { Origin: origin },
    data: {
      businessId,
      operationId,
      action,
      ...(recordId ? { recordId } : {}),
      expectedRevision,
      values,
    },
  });
  expect(response.status()).toBe(200);
  return (await response.json()).data as { id: string; revision: number };
}
async function detail(
  request: APIRequestContext,
  businessId: string,
  id: string,
) {
  const response = await request.get(
    `/api/ledger/records/${id}?businessId=${businessId}`,
  );
  expect(response.status()).toBe(200);
  return (await response.json()).data;
}
async function checkWidth(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

test("phone partial sale, later settlement, correction and linked-payment rejection stay understandable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  const id = await business(
    page.request,
    "phone lifecycle " + randomUUID().slice(0, 6),
  );
  await selectBusiness(page, id);
  await page.getByTestId("record-sale").click();
  await page.locator("#amount").fill("500.25");
  await page.locator("#businessDate").fill("2026-10-20");
  await page
    .getByRole("button", { name: "Add a detail (optional)", exact: true })
    .click();
  await page.locator("#description").fill("Synthetic notebook sale");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator('input[name="payment"][value="partial"]').check();
  await page.locator("#paymentAmount").fill("200.10");
  await page.locator("#paymentDate").fill("2026-10-21");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Save sale", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Add another", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to home", exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: "Find records", exact: true }).click();
  await page
    .getByRole("button", { name: "Synthetic notebook sale", exact: true })
    .click();
  await expect(page.getByText("₱300.15", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Record a later payment", exact: true })
    .click();
  await page.getByLabel(/Amount received or paid/).fill("300.15");
  await page.getByLabel("Payment date", { exact: false }).fill("2026-10-22");
  await page
    .getByRole("button", { name: "Review change", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm and save", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Correct this record", exact: true }),
  ).toBeVisible();
  const rows = (
    await (await page.request.get(`/api/ledger?businessId=${id}`)).json()
  ).data.records;
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    amountCentavos: "50025",
    paidCentavos: "50025",
    remainingCentavos: "0",
    revision: 2,
    paymentStatus: "paid",
  });
  await page
    .getByRole("button", { name: "Correct this record", exact: true })
    .click();
  await page.getByLabel("Amount", { exact: false }).first().fill("550.25");
  await page
    .getByLabel(/Why are you changing this/)
    .fill("Synthetic amount correction");
  await page.getByRole("button", { name: "Tagalog", exact: true }).click();
  await expect(page.getByLabel("Halaga", { exact: false }).first()).toHaveValue(
    "550.25",
  );
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page
    .getByRole("button", { name: "Review change", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm and save", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Correct this record", exact: true }),
  ).toBeVisible();
  const changed = await detail(page.request, id, rows[0].id);
  expect(changed.record).toMatchObject({
    amountCentavos: "55025",
    paidCentavos: "50025",
    remainingCentavos: "5000",
    revision: 3,
  });
  expect(changed.history).toHaveLength(3);
  expect(changed.payments).toHaveLength(2);
  const firstRevision = page
    .getByRole("heading", { name: "Correction history", exact: true })
    .locator("..")
    .locator("ol")
    .first()
    .locator("li")
    .first();
  await expect(
    firstRevision.getByText("Business date: 2026-10-20", { exact: true }),
  ).toBeVisible();
  await expect(
    firstRevision.getByText("Payment date: 2026-10-21", { exact: true }),
  ).toBeVisible();
  await checkWidth(page);
  await page.screenshot({
    path: "test-results/records-detail-phone.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Void this record", exact: true })
    .click();
  await page
    .getByLabel(/Why are you changing this/)
    .fill("Synthetic void attempt with active payments");
  await page
    .getByRole("button", { name: "Review change", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm and save", exact: true })
    .click();
  await expect(
    page.getByText(
      "The change conflicts with active payments. Correct or void the linked payments first, then review this record again.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Refresh record and revise", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeVisible();
  expect((await detail(page.request, id, rows[0].id)).record.status).toBe(
    "active",
  );
});

test("records search reaches beyond recent fifty and supports real pagination", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page);
  const id = await business(
    page.request,
    "older records " + randomUUID().slice(0, 6),
  );
  for (let index = 0; index < 55; index++)
    await mutate(page.request, id, "create", {
      businessDate: "2026-09-01",
      kind: "sale",
      amountCentavos: String(100 + index),
      description: "Synthetic archive entry " + String(index).padStart(2, "0"),
      paymentStatus: "unpaid",
      paymentAmountCentavos: null,
      paymentDate: null,
    });
  const recent = (
    await (await page.request.get(`/api/transactions?businessId=${id}`)).json()
  ).data.records;
  expect(recent).toHaveLength(50);
  expect(
    recent.some(
      (row: { description: string }) =>
        row.description === "Synthetic archive entry 00",
    ),
  ).toBe(false);
  await selectBusiness(page, id);
  await page.getByRole("button", { name: "Find records", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Next page", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.getByText("Page 2 of 3", { exact: true })).toBeVisible();
  await page
    .getByLabel("Description", { exact: true })
    .fill("Synthetic archive entry 00");
  await page.getByRole("button", { name: "Find records", exact: true }).click();
  await page
    .getByRole("button", { name: "Synthetic archive entry 00", exact: true })
    .click();
  await expect(page.getByText("₱1.00", { exact: true }).first()).toBeVisible();
  await checkWidth(page);
  await page.screenshot({
    path: "test-results/records-search-laptop.png",
    fullPage: true,
  });
});

test("hosted payment/correction/void totals, export snapshot and preparation evidence retain isolation and freshness", async ({
  playwright,
}) => {
  const a = await playwright.request.newContext({ baseURL: origin }),
    b = await playwright.request.newContext({ baseURL: origin });
  try {
    await Promise.all([login(a), login(b, process.env.E2E_EMAIL_B!)]);
    const id = await business(a, "summary fixtures");
    const sale = await mutate(a, id, "create", {
      businessDate: "2026-10-20",
      kind: "sale",
      amountCentavos: "10000",
      description: "=Synthetic formula-safe sale",
      paymentStatus: "paid",
      paymentAmountCentavos: "10000",
      paymentDate: "2026-10-21",
    });
    const expense = await mutate(a, id, "create", {
      businessDate: "2026-10-20",
      kind: "expense",
      amountCentavos: "5000",
      description: "Synthetic unpaid expense",
      paymentStatus: "unpaid",
      paymentAmountCentavos: null,
      paymentDate: null,
    });
    await mutate(a, id, "create", {
      businessDate: "2026-10-20",
      kind: "sale",
      amountCentavos: "2500",
      description: "Synthetic unknown sale",
      paymentStatus: "unknown",
      paymentAmountCentavos: null,
      paymentDate: null,
    });
    await mutate(
      a,
      id,
      "add_payment",
      { amountCentavos: "2000", paymentDate: "2026-10-22" },
      expense.id,
      1,
    );
    const summary = (
      await (
        await a.get(
          `/api/ledger/summary?businessId=${id}&from=2026-10-01&to=2026-10-31`,
        )
      ).json()
    ).data;
    expect(summary.totals).toMatchObject({
      salesCentavos: "12500",
      expensesCentavos: "5000",
      receivedCentavos: "10000",
      paidCentavos: "2000",
      payableCentavos: "3000",
      unknownCount: 1,
      recordCount: 3,
    });
    const profileValues = {
      year: 2026,
      registration: "unknown",
      taxTreatment: "unknown",
      evidence: "",
      priorIncomeCentavos: null,
      priorTaxPaymentsCentavos: null,
      otherCreditsCentavos: null,
      coverage: "unknown",
      notes: "Synthetic evidence gap",
    };
    const savedProfile = await a.post("/api/preparation/profile", {
      headers: { Origin: origin },
      data: {
        businessId: id,
        operationId: randomUUID(),
        expectedRevision: 0,
        values: profileValues,
      },
    });
    expect(savedProfile.status()).toBe(200);
    const profile = (await savedProfile.json()).data.profile;
    expect(profile.values.priorTaxPaymentsCentavos).toBeNull();
    const command = {
      businessId: id,
      operationId: randomUUID(),
      from: "2026-10-01",
      to: "2026-10-31",
      preparation: {
        profileRevision: profile.revision,
        profile: profile.values,
      },
    };
    const generated = await a.post("/api/ledger/snapshots", {
      headers: { Origin: origin },
      data: command,
    });
    expect(generated.status()).toBe(200);
    const snapshot = (await generated.json()).data;
    expect(snapshot.stale).toBe(false);
    expect(
      (
        await (
          await a.post("/api/ledger/snapshots", {
            headers: { Origin: origin },
            data: command,
          })
        ).json()
      ).data.id,
    ).toBe(snapshot.id);
    const csv = await a.get(
      `/api/ledger/export?businessId=${id}&snapshotId=${snapshot.id}`,
    );
    expect(csv.status()).toBe(200);
    const csvText = await csv.text();
    expect(csvText).toContain("'=Synthetic formula-safe sale");
    expect(csvText).toContain("100.00");
    expect(csvText).not.toContain(process.env.E2E_EMAIL_A!);
    await mutate(
      a,
      id,
      "correct",
      {
        kind: "sale",
        businessDate: "2026-10-20",
        amountCentavos: "11000",
        description: "Synthetic corrected sale",
        reason: "Synthetic typo correction",
      },
      sale.id,
      1,
    );
    expect(
      (
        await (
          await a.get(`/api/ledger/snapshots/${snapshot.id}?businessId=${id}`)
        ).json()
      ).data.stale,
    ).toBe(true);
    const expenseDetail = await detail(a, id, expense.id);
    await mutate(
      a,
      id,
      "void_payment",
      {
        paymentId: expenseDetail.payments[0].id,
        expectedPaymentRevision: 1,
        reason: "Synthetic payment reversal",
      },
      expense.id,
      2,
    );
    await mutate(
      a,
      id,
      "void",
      { reason: "Synthetic expense void" },
      expense.id,
      3,
    );
    const final = (
      await (
        await a.get(
          `/api/ledger/summary?businessId=${id}&from=2026-10-01&to=2026-10-31`,
        )
      ).json()
    ).data;
    expect(final.totals).toMatchObject({
      salesCentavos: "13500",
      expensesCentavos: "0",
      paidCentavos: "0",
      voidCount: 1,
      recordCount: 2,
    });
    for (const path of [
      `/api/ledger?businessId=${id}`,
      `/api/ledger/records/${sale.id}?businessId=${id}`,
      `/api/ledger/export?businessId=${id}&snapshotId=${snapshot.id}`,
      `/api/preparation/profile?businessId=${id}`,
    ])
      expect((await b.get(path)).status()).toBe(403);
    expect(
      (
        await b.post("/api/ledger", {
          headers: { Origin: origin },
          data: {
            businessId: id,
            operationId: randomUUID(),
            action: "void",
            expectedRevision: 2,
            recordId: sale.id,
            values: { reason: "Synthetic denied" },
          },
        })
      ).status(),
    ).toBe(403);
  } finally {
    await Promise.all([a.dispose(), b.dispose()]);
  }
});

test("preparation UI preserves unknown evidence, generates a printable package and downloads its CSV", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await signIn(page);
  const id = await business(page.request, "preparation UI");
  await selectBusiness(page, id);
  await mutate(page.request, id, "create", {
    businessDate: "2026-10-20",
    kind: "sale",
    amountCentavos: "22050",
    description: "Synthetic package sale",
    paymentStatus: "unpaid",
    paymentAmountCentavos: null,
    paymentDate: null,
  });
  await page
    .getByRole("button", { name: "Prepare records", exact: true })
    .click();
  await expect(page.getByText(/Quezon City business/)).toBeVisible();
  await page
    .getByLabel("Where can you find the supporting evidence?", { exact: false })
    .fill("Synthetic document title only");
  await page
    .getByRole("button", { name: "Save and continue", exact: true })
    .click();
  await page
    .getByLabel("From business date", { exact: true })
    .fill("2026-10-01");
  await page.getByLabel("To business date", { exact: true }).fill("2026-10-31");
  await page
    .getByLabel("Actual earlier tax payments (PHP)", { exact: true })
    .fill("0");
  await page
    .getByRole("button", { name: "Save and continue", exact: true })
    .click();
  await expect(
    page.getByText(
      "A record-preparation package is available. Tax-specific draft fields and calculations remain blocked pending verified rules and evidence.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Generate record-preparation package",
      exact: true,
    })
    .click();
  await expect(page.getByTestId("saved-period-report")).toBeVisible();
  await expect(
    page.getByText("Synthetic package sale", { exact: true }),
  ).toBeVisible();
  const profile = (
    await (
      await page.request.get(`/api/preparation/profile?businessId=${id}`)
    ).json()
  ).data.profile;
  expect(profile.values).toMatchObject({
    registration: "unknown",
    taxTreatment: "unknown",
    priorIncomeCentavos: null,
    priorTaxPaymentsCentavos: "0",
    otherCreditsCentavos: null,
  });
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download accepted-record CSV", exact: true })
    .click();
  const download = await downloadEvent;
  const path = await download.path();
  expect(path).toBeTruthy();
  expect(await readFile(path!, "utf8")).toContain("220.50");
  await checkWidth(page);
  await page.screenshot({
    path: "test-results/preparation-laptop.png",
    fullPage: true,
  });
  await page.emulateMedia({ media: "print" });
  await page.screenshot({
    path: "test-results/preparation-print.png",
    fullPage: true,
  });
});
