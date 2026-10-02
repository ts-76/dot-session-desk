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
    failCreate: false,
    failRead: false,
  };
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname;
    if (path === "/api/status")
      return route.fulfill({ json: { connected: true } });
    if (path === "/api/threads") {
      if (req.method() === "POST") {
        if (state.failCreate)
          return route.fulfill({ status: 503, json: { error: "temporary" } });
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
    if (state.failRead)
      return route.fulfill({ status: 503, json: { error: "temporary" } });
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

test("mobile sidebar is closed by default and dismisses with focus restored", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  await ready(page);
  const toggle = page.getByRole("button", {
    name: "会話一覧を開く",
    exact: true,
  });
  const panel = page.locator("#session-sidebar");
  await expect(panel).not.toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toHaveAttribute("aria-controls", "session-sidebar");
  const bounds = await page.locator("main").boundingBox();
  expect(bounds!.y).toBe(50);
  expect(bounds!.height).toBeGreaterThan(750);
  await toggle.click();
  const dialog = page.getByRole("dialog", { name: "会話", exact: true });
  const close = dialog.getByRole("button", {
    name: "会話一覧を閉じる",
    exact: true,
  });
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(close).toBeFocused();
  await expect(page.locator("header")).toHaveAttribute("inert", "");
  await expect(page.locator("main")).toHaveAttribute("inert", "");
  await expect(page.locator("footer")).toHaveAttribute("inert", "");
  expect(await page.evaluate(() => document.body.style.overflow)).toBe(
    "hidden",
  );
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "開発メモ、未開始" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.locator("#message").evaluate((element) => element.focus());
  await expect(close).toBeFocused();
  const scrollTop = await page
    .locator("#scroll-area")
    .evaluate((element) => element.scrollTop);
  await page.mouse.move(370, 400);
  await page.mouse.wheel(0, 500);
  expect(
    await page.locator("#scroll-area").evaluate((element) => element.scrollTop),
  ).toBe(scrollTop);
  await page.keyboard.press("Escape");
  await expect(panel).not.toBeVisible();
  await expect(toggle).toBeFocused();
  await expect(page.locator("main")).not.toHaveAttribute("inert", "");
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  await toggle.click();
  await page
    .locator(".sidebar-backdrop")
    .click({ position: { x: 370, y: 200 } });
  await expect(panel).not.toBeVisible();
  await expect(toggle).toBeFocused();
  // Some touch browsers do not focus a button when it is tapped.
  await page.locator("#message").focus();
  await toggle.evaluate((button) =>
    button.addEventListener("mousedown", (event) => event.preventDefault(), {
      once: true,
    }),
  );
  await toggle.click();
  await close.click();
  await expect(panel).not.toBeVisible();
  await expect(toggle).toBeFocused();
});

test("mobile session selection and creation close the sidebar while keeping drafts and failures", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await fixture(page);
  await ready(page);
  const toggle = page.getByRole("button", {
    name: "会話一覧を開く",
    exact: true,
  });
  const panel = page.locator("#session-sidebar");
  await page.locator("#message").fill("設計の下書き");
  await toggle.click();
  await page.getByRole("button", { name: "開発メモ、未開始" }).click();
  await expect(panel).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "開発メモ" })).toBeVisible();
  await page.locator("#message").fill("開発の下書き");
  await toggle.click();
  await page.getByRole("button", { name: "設計相談、返信済み" }).click();
  await expect(panel).not.toBeVisible();
  await expect(page.locator("#message")).toHaveValue("設計の下書き");
  await toggle.click();
  await page.getByRole("button", { name: "設計相談、返信済み" }).click();
  await expect(panel).not.toBeVisible();
  await toggle.click();
  await page.getByRole("button", { name: "ゴミ箱", exact: true }).click();
  await page.getByText("＋ 新しい会話").click();
  await page.locator("#new-title").fill("モバイル新規会話");
  state.failCreate = true;
  await page.getByRole("button", { name: "作成", exact: true }).click();
  await expect(panel).toBeVisible();
  await expect(page.locator("#new-title")).toHaveValue("モバイル新規会話");
  state.failCreate = false;
  await page.getByRole("button", { name: "作成", exact: true }).click();
  await expect(panel).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "モバイル新規会話" }),
  ).toBeVisible();
  await toggle.click();
  await expect(
    page.getByRole("button", { name: "会話", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("会話を探す")).toHaveValue("");
});

test("mobile sidebar retains state on resize and shortcuts open the correct field", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  await ready(page);
  const panel = page.locator("#session-sidebar");
  await page.locator("#message").focus();
  await page.keyboard.press("Control+k");
  await expect(panel).toBeVisible();
  await expect(page.getByLabel("会話を探す")).toBeFocused();
  await page.getByLabel("会話を探す").fill("設計");
  await page.keyboard.press("Escape");
  await expect(page.locator("#message")).toBeFocused();
  await page.keyboard.press("Control+Shift+o");
  await expect(page.locator("#new-title")).toBeFocused();
  await page.locator("#new-title").fill("入力途中");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(panel).toBeVisible();
  await expect(panel).not.toHaveAttribute("role", "dialog");
  await expect(page.locator(".sidebar-backdrop")).toHaveCount(0);
  await expect(page.locator("main")).not.toHaveAttribute("inert", "");
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  await expect(page.locator("#new-title")).toHaveValue("入力途中");
  await expect(page.getByLabel("会話を探す")).toHaveValue("設計");
  await expect(
    page.getByRole("button", { name: "会話一覧を開く", exact: true }),
  ).not.toBeVisible();
  await page.getByLabel("会話を探す").focus();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(panel).not.toBeVisible();
  const toggle = page.getByRole("button", {
    name: "会話一覧を開く",
    exact: true,
  });
  await expect(toggle).toBeFocused();
  await toggle.click();
  await expect(page.locator("#new-title")).toHaveValue("入力途中");
  await page
    .getByRole("button", { name: "会話一覧を閉じる", exact: true })
    .focus();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByLabel("会話を探す")).toBeFocused();
});

test("mobile management, filters and restore work with the collapsible list", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  await ready(page);
  const toggle = page.getByRole("button", {
    name: "会話一覧を開く",
    exact: true,
  });
  await page.getByLabel("セッションの操作").click();
  await page.getByRole("button", { name: "名前を変更", exact: true }).click();
  await page.locator("#rename-title").fill("変更後");
  await page.keyboard.press("Control+k");
  await expect(page.locator("#session-sidebar")).not.toBeVisible();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("heading", { name: "変更後" })).toBeVisible();
  await page.getByLabel("セッションの操作").click();
  await page.getByRole("button", { name: "アーカイブ", exact: true }).click();
  await toggle.click();
  await page.getByRole("button", { name: "保管", exact: true }).click();
  await page.getByLabel("会話を探す").fill("変更");
  await page.getByRole("button", { name: "変更後、返信済み" }).click();
  await expect(page.locator("#session-sidebar")).not.toBeVisible();
  await page.getByLabel("セッションの操作").click();
  await page.getByRole("button", { name: "ゴミ箱へ移動", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "ゴミ箱へ移動", exact: true })
    .click();
  await toggle.click();
  await page.getByRole("button", { name: "ゴミ箱", exact: true }).click();
  await page.getByRole("button", { name: "変更後、返信済み" }).click();
  await page.getByLabel("セッションの操作").click();
  await page.getByRole("button", { name: "復元", exact: true }).click();
  await expect(page.locator("#message")).toBeEnabled();
  await expect(page.getByText("保存済みの回答です")).toBeVisible();
  await expect(page.getByRole("status").first()).toHaveText("dot 接続済み");
});

test("sidebar fits narrow and tablet widths and scrolls independently in short viewports", async ({
  page,
}) => {
  const state = await fixture(page);
  state.threads.push(
    ...Array.from({ length: 25 }, (_, index) => ({
      id: "extra" + index,
      title: "追加会話" + index,
      messages: [],
    })),
  );
  await ready(page);
  for (const width of [320, 390, 540, 600, 760, 761]) {
    await page.setViewportSize({ width, height: 600 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    const toggle = page.getByRole("button", {
      name: "会話一覧を開く",
      exact: true,
    });
    if (width <= 760) {
      await expect(page.locator("#session-sidebar")).not.toBeVisible();
      await toggle.click();
      const box = await page.locator("#session-sidebar").boundingBox();
      expect(box!.width).toBeLessThanOrEqual(width - 48);
      const sessions = page.locator("#sessions");
      expect(
        await sessions.evaluate(
          (element) => element.scrollHeight > element.clientHeight,
        ),
      ).toBe(true);
      await page
        .getByRole("button", { name: "追加会話24、未開始" })
        .scrollIntoViewIfNeeded();
      await expect(
        page.getByRole("button", { name: "追加会話24、未開始" }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
    } else {
      await expect(toggle).not.toBeVisible();
      await expect(page.locator("#session-sidebar")).toBeVisible();
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "evidence/mobile-sidebar-closed.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "会話一覧を開く", exact: true })
    .click();
  await page.locator("#sessions").evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.screenshot({
    path: "evidence/mobile-sidebar-open.png",
    fullPage: true,
  });
});

// Fictional structured facts; these API mocks never connect to a real session.
function progressFixture(overrides: Record<string, unknown> = {}) {
  return {
    status: "needs_input",
    completed: ["サンプル仕様を整理"],
    current: "画面の試作を確認",
    blockers: ["表示方式が未決定"],
    userActions: ["案Aと案Bから選んでください"],
    nextStep: "選択後にサンプル画面を調整",
    version: 1,
    updatedAt: "2026-01-15T09:00:00.000Z",
    ...overrides,
  };
}
test("progress is explicitly unregistered rather than inferred from a reply", async ({
  page,
}) => {
  await fixture(page);
  await ready(page);
  await expect(page.locator(".session-progress")).toHaveAttribute("open", "");
  await expect(page.locator(".progress-state")).toHaveText("未登録");
  await expect(
    page.getByRole("region", { name: "セッションの進捗" }),
  ).toContainText("推測して表示しません");
  await expect(page.locator(".session-progress-label")).toHaveCount(0);
});
test("registered facts show separate fields and needs-input sidebar description", async ({
  page,
}) => {
  const s = await fixture(page);
  s.threads[0].progress = progressFixture();
  await ready(page);
  const region = page.getByRole("region", { name: "セッションの進捗" });
  for (const value of [
    "完了したこと",
    "サンプル仕様を整理",
    "現在の作業",
    "画面の試作を確認",
    "ブロッカー",
    "表示方式が未決定",
    "あなたの対応・判断",
    "案Aと案Bから選んでください",
    "次の一手",
    "選択後にサンプル画面を調整",
    "最終更新",
  ])
    await expect(region).toContainText(value);
  await expect(region.locator("time")).toHaveAttribute(
    "datetime",
    "2026-01-15T09:00:00.000Z",
  );
  await expect(
    page.getByRole("button", { name: "設計相談、返信済み" }),
  ).toHaveAccessibleDescription("進捗: ユーザー判断待ち");
  await page.screenshot({
    path: "evidence/progress-desktop.png",
    fullPage: true,
  });
});
test("progress polling updates facts without changing pending reply or draft", async ({
  page,
}) => {
  const s = await fixture(page);
  s.threads[0].progress = progressFixture();
  s.threads[0].messages.push({
    id: "pending",
    role: "user",
    body: "未返信のサンプル質問",
    created: date,
  });
  await ready(page);
  await page.locator("#message").fill("保持する下書き");
  s.threads[0].progress = progressFixture({
    status: "complete",
    completed: ["サンプル確認を完了"],
    current: "",
    blockers: [],
    userActions: [],
    nextStep: "",
    version: 2,
  });
  await expect(page.locator(".progress-state")).toHaveText("完了", {
    timeout: 6000,
  });
  await expect(page.getByText("dotの返信を待っています")).toBeVisible();
  await expect(page.locator("#message")).toHaveValue("保持する下書き");
  await page.getByRole("button", { name: "開発メモ、未開始" }).click();
  await expect(page.locator(".progress-state")).toHaveText("未登録");
  await expect(page.getByText("サンプル確認を完了")).toHaveCount(0);
});
test("mobile progress starts collapsed, expands without overflow, and preserves drafts", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const s = await fixture(page);
  s.threads[0].progress = progressFixture({
    current: "長い確認内容".repeat(100),
    blockers: Array(10).fill("長いブロッカー内容".repeat(40)),
  });
  await ready(page);
  const details = page.locator(".session-progress");
  await expect(details).not.toHaveAttribute("open", "");
  await page.locator("#message").fill("モバイルの下書き");
  await details.locator("summary").click();
  await expect(
    page.getByRole("region", { name: "セッションの進捗" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  expect(
    await page
      .locator(".progress-body")
      .evaluate((e) => e.scrollHeight > e.clientHeight),
  ).toBe(true);
  await expect(page.locator("#message")).toHaveValue("モバイルの下書き");
  await page.screenshot({
    path: "evidence/progress-mobile-expanded.png",
    fullPage: true,
  });
  await details.locator("summary").click();
  await page.getByRole("button", { name: "会話一覧を開く" }).click();
  await expect(page.locator(".session-progress-label")).toContainText(
    "ユーザー判断待ち",
  );
  await page.getByRole("button", { name: "開発メモ、未開始" }).click();
  await expect(details).not.toHaveAttribute("open", "");
  await page.getByRole("button", { name: "会話一覧を開く" }).click();
  await page.getByRole("button", { name: "設計相談、返信済み" }).click();
  await expect(page.locator("#message")).toHaveValue("モバイルの下書き");
  await expect(details).not.toHaveAttribute("open", "");
  await page.screenshot({
    path: "evidence/progress-mobile-collapsed.png",
    fullPage: true,
  });
});
test("failed refresh keeps the previous progress with a stale warning", async ({
  page,
}) => {
  const s = await fixture(page);
  s.threads[0].progress = progressFixture();
  await ready(page);
  s.failRead = true;
  await expect(page.locator(".progress-stale")).toBeVisible({ timeout: 6000 });
  await expect(
    page.getByText("案Aと案Bから選んでください", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".progress-updated time")).toHaveAttribute(
    "datetime",
    "2026-01-15T09:00:00.000Z",
  );
});
