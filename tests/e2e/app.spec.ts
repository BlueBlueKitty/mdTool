import { expect, test } from "@playwright/test";

test("公式修复菜单会打开对应的修复预览工作区", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" }); await page.locator(".cm-content").click(); await page.keyboard.insertText("# 标题\n\n##副标题");
  await page.getByRole("button", { name: "公式修复" }).click(); await page.getByRole("button", { name: "清理公式首尾空白" }).click();
  await expect(page.getByRole("button", { name: "修复预览" })).toHaveClass(/active/);
  await expect(page.getByRole("button", { name: /应用预览/ })).toBeVisible();
});

test("全文添加编号先询问是否排除一级标题", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator(".cm-content").click(); await page.keyboard.insertText("# 总标题\n\n## 背景");
  await page.getByRole("button", { name: "其他修复" }).click();
  await page.getByRole("button", { name: "为所有章节添加编号" }).click();
  await expect(page.getByRole("heading", { name: "为所有章节添加编号" })).toBeVisible();
  await page.getByLabel("排除，一级标题不编号").check();
  await page.getByRole("button", { name: "生成修复预览" }).click();
  await expect(page.getByRole("button", { name: "修复预览" })).toHaveClass(/active/);
});

test("多行块级公式作为单个 MathJax 块渲染，不会生成标题", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator(".cm-content").click();
  await page.keyboard.insertText("$$\nZ(\\mathbf x)\n=\n\\sum_m w_m(\\mathbf x)\n$$");
  await expect(page.locator(".preview .math-block")).toHaveCount(1);
  await expect(page.locator(".preview h1, .preview h2, .preview h3")).toHaveCount(0);
});

test("左侧章节和修复项可切换，并显示标准 Markdown 预览", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" }); await page.locator(".cm-content").click(); await page.keyboard.insertText("# 文档\n\n## 背景\n\n**加粗** 与 $x^2$");
  await page.locator(".left nav").getByRole("button", { name: "章节" }).click(); await page.getByRole("button", { name: /背景/ }).click();
  await expect(page.locator(".preview h2")).toContainText("背景"); await expect(page.locator(".preview strong")).toContainText("加粗");
  await page.locator(".left nav").getByRole("button", { name: /修复项/ }).click(); await expect(page.getByText("当前方案未发现可修复项")).toBeVisible();
});
