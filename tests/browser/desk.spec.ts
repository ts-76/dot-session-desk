import { test, expect, type Page } from "@playwright/test";
const date = new Date().toISOString();
async function fixture(page: Page) {
  const state: any = {
    threads: [
      {
        id: "a",
        title: "設計相談",
        pinned: 0,
        archived: 0,
        deletedAt: null,
        messages: [
          { id: "u", role: "user", body: "相談です", created: date },
          {
            id: "r",
            role: "dot",
            replyTo: "u",
            body: "保存済みの回答です",
            created: date,
          },
        ],
      },
      {
        id: "b",
        title: "開発メモ",
        pinned: 0,
        archived: 0,
        deletedAt: null,
        messages: [],
      },
    ],
    slow: false,
    failSend: false,
  };
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname;
    if (path === "/api/status")
      return route.fulfill({ json: { connected: true } });
    if (path === "/api/threads") {
      if (req.method() === "POST") {
        const t = { id: "new", ...req.postDataJSON(), messages: [] };
        state.threads.push(t);
        return route.fulfill({ json: t });
      }
      return route.fulfill({
        json: state.threads.map((t: any) => ({
          ...t,
          messageCount: t.messages.length,
          pendingCount: t.messages.at(-1)?.role === "user" ? 1 : 0,
          lastReplyId:
            t.messages.filter((m: any) => m.role === "dot").at(-1)?.id || null,
        })),
      });
    }
    const id = path.split("/")[3],
      t = state.threads.find((t: any) => t.id === id);
    if (!t) return route.fulfill({ status: 404, json: { error: "Not found" } });
    if (path.endsWith("/manage")) {
      const b = req.postDataJSON();
      if (b.action === "rename") t.title = b.title;
      if (b.action === "pin") t.pinned = Number(b.value);
      if (b.action === "archive") t.archived = Number(b.value);
      if (b.action === "trash") t.deletedAt = date;
      if (b.action === "restore") {
        t.deletedAt = null;
        t.archived = 0;
      }
      return route.fulfill({ json: t });
    }
    if (req.method() === "POST") {
      if (state.failSend)
        return route.fulfill({ status: 503, json: { error: "temporary" } });
      const b = req.postDataJSON();
      if (!t.messages.some((m: any) => m.id === b.id))
        t.messages.push({
          id: b.id,
          role: "user",
          body: b.text,
          created: new Date().toISOString(),
        });
      return route.fulfill({ json: { saved: true, id: b.id } });
    }
    if (state.slow && id === "a") await new Promise((r) => setTimeout(r, 2500));
    return route.fulfill({ json: t });
  });
  return state;
}
async function ready(page: Page) {
  await page.goto("/#a");
  await expect(page.getByText("保存済みの回答です")).toBeVisible();
}
test("rename cancel save pin archive trash restore preserve history", async ({
  page,
}) => {
  await fixture(page);
  await ready(page);
  await page.getByLabel("セッションの操作").click();
  await page.getByRole("button", { name: "名前を変更", exact: true }).click();
  await page.getByLabel("会話の名前", { exact: true }).last().fill("取り消す");
  await page.getByRole("button", { name: "キャンセル" }).click();
  await expect(page.getByRole("heading", { name: "設計相談" })).toBeVisible();
  await page.getByLabel("セッションの操作").click();
  await page.getByRole("button", { name: "名前を変更", exact: true }).click();
  await page.locator("#rename-title").fill("新しい名前");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("heading", { name: "新しい名前" })).toBeVisible();
  await page.getByLabel("セッションの操作").click();
  await page.getByRole("button", { name: "ピン留め", exact: true }).click();
  await expect(page.locator(".session-title").first()).toHaveText(
    "⌖ 新しい名前",
  );
  await page.getByLabel("セッションの操作").click();
  await page.getByRole("button", { name: "アーカイブ", exact: true }).click();
  await expect(page.locator("#message")).toBeDisabled();
  await page.getByRole("button", { name: "保管", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "新しい名前、返信済み" }),
  ).toBeVisible();
  await page.getByLabel("セッションの操作").click();
  await page.getByRole("button", { name: "ゴミ箱へ移動", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "ゴミ箱へ移動", exact: true })
    .click();
  await page.getByRole("button", { name: "ゴミ箱", exact: true }).click();
  await page.getByLabel("セッションの操作").click();
  await page.getByRole("button", { name: "復元", exact: true }).click();
  await expect(page.locator("#message")).toBeEnabled();
  await expect(page.getByText("保存済みの回答です")).toBeVisible();
});
test("send then arriving response is rendered without reload", async ({
  page,
}) => {
  const s = await fixture(page);
  await ready(page);
  await page.locator("#message").fill("新しい相談");
  await page.getByRole("button", { name: "送信 ↑" }).click();
  await expect(
    page
      .getByRole("region", { name: "会話履歴" })
      .getByText("新しい相談", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("#message")).toHaveValue("");
  const user = s.threads[0].messages.at(-1);
  s.threads[0].messages.push({
    id: "reply2",
    role: "dot",
    replyTo: user.id,
    body: "自動更新された回答",
    created: date,
  });
  await expect(page.getByText("自動更新された回答")).toBeVisible({
    timeout: 6000,
  });
  await expect(page.getByText("dotの返信を待っています")).toHaveCount(0);
});
test("cached switch keeps drafts during slow previous request", async ({
  page,
}) => {
  const s = await fixture(page);
  await ready(page);
  await page.locator("#message").fill("設計の下書き");
  await page.getByRole("button", { name: "開発メモ、未開始" }).click();
  await expect(page.getByRole("heading", { name: "開発メモ" })).toBeVisible();
  await page.locator("#message").fill("開発の下書き");
  s.slow = true;
  const start = Date.now();
  await page.getByRole("button", { name: "設計相談、返信済み" }).click();
  await expect(page.getByText("保存済みの回答です")).toBeVisible();
  expect(Date.now() - start).toBeLessThan(1000);
  await expect(page.locator("#message")).toHaveValue("設計の下書き");
  await page.getByRole("button", { name: "開発メモ、未開始" }).click();
  await expect(page.locator("#message")).toHaveValue("開発の下書き");
  await page.waitForTimeout(2700);
  await expect(page.getByRole("heading", { name: "開発メモ" })).toBeVisible();
});
test("failed send retains draft and retry does not duplicate", async ({
  page,
}) => {
  const s = await fixture(page);
  await ready(page);
  s.failSend = true;
  await page.locator("#message").fill("保持する");
  await page.getByRole("button", { name: "送信 ↑" }).click();
  await expect(page.getByRole("alert")).toContainText("入力を保持");
  await expect(page.locator("#message")).toHaveValue("保持する");
  s.failSend = false;
  await page.getByRole("button", { name: "送信 ↑" }).click();
  await expect(page.locator("#message")).toHaveValue("");
  expect(
    s.threads[0].messages.filter((m: any) => m.body === "保持する"),
  ).toHaveLength(1);
});
test("long history opens at bottom and follows new long reply", async ({
  page,
}) => {
  const s = await fixture(page);
  s.threads[0].messages = Array.from({ length: 30 }, (_, i) => ({
    id: "r" + i,
    role: "dot",
    body: "長い回答 " + i + "\n".repeat(3) + "本文".repeat(100),
    created: date,
  }));
  await page.goto("/#a");
  await expect(page.getByText(/長い回答 29/)).toBeVisible();
  const distance = () =>
    page
      .locator("#scroll-area")
      .evaluate((e) => e.scrollHeight - e.scrollTop - e.clientHeight);
  expect(await distance()).toBeLessThan(20);
  s.threads[0].messages.push({
    id: "r31",
    role: "dot",
    body: "新しい長文\n" + "長い本文\n".repeat(40),
    created: date,
  });
  await expect(page.getByText(/新しい長文/)).toBeVisible({ timeout: 6000 });
  expect(await distance()).toBeLessThan(20);
});
test("mobile layout fits viewport and menu dialog works", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  await ready(page);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.getByLabel("セッションの操作").click();
  await page.getByRole("button", { name: "名前を変更", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.screenshot({ path: "evidence/react-mobile.png", fullPage: true });
});
test("search and create from trash returns active view", async ({ page }) => {
  await fixture(page);
  await ready(page);
  await page.getByLabel("会話を探す").fill("開発");
  await expect(page.locator("#sessions .item")).toHaveCount(1);
  await page.getByRole("button", { name: "ゴミ箱", exact: true }).click();
  await page.getByText("＋ 新しい会話").click();
  await page.locator("#new-title").fill("作成テスト");
  await page.getByRole("button", { name: "作成", exact: true }).click();
  await expect(page.getByRole("heading", { name: "作成テスト" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "会話", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("会話を探す")).toHaveValue("");
});
test("desktop screenshot and browser load has no runtime errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await fixture(page);
  await ready(page);
  await page.screenshot({ path: "evidence/react-desktop.png", fullPage: true });
  expect(errors).toEqual([]);
});
