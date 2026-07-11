import { expect, test } from "@playwright/test";

test("菜单规则先生成修复预览，再通过一次应用修改源码", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" }); await page.locator(".cm-content").click(); await page.keyboard.insertText("# 标题\n\n$  x + y  $");
  await page.getByRole("button", { name: "修复规则" }).click(); await page.getByRole("button", { name: "清理公式首尾空白" }).click();
  await expect(page.getByRole("button", { name: "修复预览" })).toHaveClass(/active/); await expect(page.locator(".cm-content")).toContainText("$x + y$");
  await page.getByRole("button", { name: /应用预览/ }).click(); await page.getByRole("button", { name: "源码" }).click(); await expect(page.locator(".cm-content")).toContainText("$x + y$");
  await page.getByRole("button", { name: "撤销" }).click(); await expect(page.locator(".cm-content")).toContainText("$  x + y  $");
});

test("左侧章节和修复项可切换，并显示标准 Markdown 预览", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" }); await page.locator(".cm-content").click(); await page.keyboard.insertText("# 文档\n\n## 背景\n\n**加粗** 与 $x^2$");
  await page.locator(".left nav").getByRole("button", { name: "章节" }).click(); await page.getByRole("button", { name: /背景/ }).click();
  await expect(page.locator(".preview h2")).toContainText("背景"); await expect(page.locator(".preview strong")).toContainText("加粗");
  await page.locator(".left nav").getByRole("button", { name: /修复项/ }).click(); await expect(page.getByText("当前方案未发现可修复项")).toBeVisible();
});
