import { expect, test } from "@playwright/test";

test("公式修复菜单会打开对应的修复预览工作区", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" }); await page.locator(".editor:not(.readonly) .cm-content").click(); await page.keyboard.insertText("# 标题\n\n##副标题");
  await page.getByRole("button", { name: "公式修复" }).click(); await page.getByRole("button", { name: "清理公式首尾空白" }).click();
  await expect(page.getByRole("button", { name: "修复预览", exact: true })).toHaveClass(/active/);
  await expect(page.getByRole("button", { name: "清理公式首尾空白修复预览 · 应用预览（0）" })).toBeVisible();
});

test("全文重排编号先确认标题级别范围", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator(".editor:not(.readonly) .cm-content").click(); await page.keyboard.insertText("# 总标题\n\n## 背景");
  await page.getByRole("button", { name: "其他修复" }).click();
  await page.getByRole("button", { name: "重排所有章节编号" }).click();
  await expect(page.getByRole("heading", { name: "重排所有章节编号" })).toBeVisible();
  await page.getByLabel("编号起始级别").fill("2");
  await page.getByRole("button", { name: "生成修复预览" }).click();
  await expect(page.getByRole("button", { name: "修复预览", exact: true })).toHaveClass(/active/);
});

test("多行块级公式作为单个 MathJax 块渲染，不会生成标题", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator(".editor:not(.readonly) .cm-content").click();
  await page.keyboard.insertText("行内 $x^2 + y^2$\n\n$$\nZ(\\mathbf x)\n=\n\\sum_m w_m(\\mathbf x)\n-\n$$");
  await expect(page.locator(".preview .math-block")).toHaveCount(1);
  await expect(page.locator(".preview mjx-container")).toHaveCount(2);
  await expect(page.locator(".preview h1, .preview h2, .preview h3")).toHaveCount(0);
});

test("左侧章节和修复项可切换，并显示标准 Markdown 预览", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" }); await page.locator(".editor:not(.readonly) .cm-content").click(); await page.keyboard.insertText("# 文档\n\n## 背景\n\n**加粗** 与 $x^2$");
  await page.locator(".left nav").getByRole("button", { name: "章节" }).click(); await page.getByRole("button", { name: /背景/ }).click();
  await expect(page.locator(".preview h2")).toContainText("背景"); await expect(page.locator(".preview strong")).toContainText("加粗");
  await page.locator(".left nav").getByRole("button", { name: /修复项/ }).click(); await expect(page.getByText("当前方案未发现可修复项")).toBeVisible();
});

test("章节可通过指针拖拽重新排序", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator(".editor:not(.readonly) .cm-content").click();
  await page.keyboard.insertText("# 第一章\n内容一\n\n# 第二章\n内容二");
  const first = page.getByRole("button", { name: "第一章" });
  const second = page.getByRole("button", { name: "第二章" });
  const sourceBox = await second.boundingBox(); const targetBox = await first.boundingBox();
  if (!sourceBox || !targetBox) throw new Error("章节拖拽目标未渲染");
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator(".section-button")).toHaveText(["第二章", "第一章"]);
});

test("源码右键菜单提供剪贴板和带说明的分组修复规则", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const source = page.locator(".editor:not(.readonly) .cm-content");
  await source.click(); await page.keyboard.insertText("$  x  $");
  await source.click({ button: "right" });
  await expect(page.locator(".source-context")).toContainText("复制");
  await expect(page.locator(".source-context")).toContainText("粘贴");
  await expect(page.locator(".source-context")).toContainText("剪切");
  await page.locator(".context-submenu").filter({ hasText: "公式修复" }).hover();
  const rule = page.getByRole("button", { name: "清理公式首尾空白" }).last();
  await expect(rule).toBeVisible();
  await expect(rule).toHaveAttribute("title", /删除公式定界符内多余的首尾空白/);
});

test("源码右键菜单靠近右下角时向内展开", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const source = page.locator(".editor:not(.readonly) .cm-content");
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("未取得浏览器视口");
  await source.evaluate((node, point) => node.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: point.x, clientY: point.y })), { x: viewport.width - 2, y: viewport.height - 2 });
  await expect(page.locator(".source-context")).toHaveClass(/opens-left/);
  await expect(page.locator(".source-context")).toHaveClass(/opens-up/);
});

test("修复预览、差异和预览右键菜单只提供复制", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const source = page.locator(".editor:not(.readonly) .cm-content");
  await source.click(); await page.keyboard.insertText("$  x  $");
  await page.getByRole("button", { name: "修复预览", exact: true }).click();
  await page.locator(".editor.readonly .cm-content").click({ button: "right" });
  await expect(page.locator(".readonly-context")).toHaveText("复制");
  await expect(page.locator(".readonly-context")).not.toContainText("粘贴");
  await page.getByRole("button", { name: "差异", exact: true }).click();
  await page.locator("article.diff").click({ button: "right" });
  await expect(page.locator(".readonly-context")).toHaveText("复制");
  await page.getByRole("button", { name: "源码", exact: true }).click();
  await page.locator(".preview").click({ button: "right" });
  await expect(page.locator(".readonly-context")).toHaveText("复制");
});

test("撤销少量文字后源码视口保持不变", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const source = page.locator(".editor:not(.readonly) .cm-content");
  await source.click();
  await page.keyboard.insertText(Array.from({ length: 120 }, (_, index) => `第 ${index + 1} 行源码内容`).join("\n"));
  await page.waitForTimeout(1000);
  const scroller = page.locator(".editor:not(.readonly) .cm-scroller");
  await scroller.evaluate(element => { element.scrollTop = 900; });
  await page.waitForTimeout(50);
  const box = await scroller.boundingBox();
  if (!box) throw new Error("源码滚动容器未渲染");
  await page.mouse.click(box.x + 180, box.y + 100);
  await page.keyboard.insertText("新增文字");
  const viewportBeforeUndo = await scroller.evaluate(element => {
    const top = element.getBoundingClientRect().top;
    const line = [...element.querySelectorAll<HTMLElement>(".cm-line")].find(item => item.getBoundingClientRect().bottom > top);
    return { scrollTop: element.scrollTop, line: line?.textContent, offset: line ? line.getBoundingClientRect().top - top : undefined };
  });
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(100);
  const viewportAfterUndo = await scroller.evaluate(element => {
    const top = element.getBoundingClientRect().top;
    const line = [...element.querySelectorAll<HTMLElement>(".cm-line")].find(item => item.getBoundingClientRect().bottom > top);
    return { scrollTop: element.scrollTop, line: line?.textContent, offset: line ? line.getBoundingClientRect().top - top : undefined };
  });
  expect(viewportAfterUndo.scrollTop).toBe(viewportBeforeUndo.scrollTop);
  expect(viewportAfterUndo.line).toBe(viewportBeforeUndo.line);
  expect(viewportAfterUndo.offset).toBe(viewportBeforeUndo.offset);
});
