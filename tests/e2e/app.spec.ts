import { expect, test } from "@playwright/test";
test("编辑、快捷键撤销、结构操作和完整粘贴均使用统一历史", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("新建空白 Markdown 文档")).toBeVisible();
  await page.locator(".cm-content").click(); await page.keyboard.insertText("# 报告\n\n## 背景\n\n正文");
  await expect(page.getByText("● 未保存")).toBeVisible(); await page.getByRole("button", { name: "差异" }).click();
  await expect(page.locator(".diff .added")).toContainText("# 报告");
  await page.locator(".cm-content").click(); await page.keyboard.press("Control+z"); await expect(page.getByText("○ 未命名")).toBeVisible();
  await page.locator(".cm-content").click(); await page.keyboard.insertText("# 报告\n\n## 背景\n\n正文");
  await page.getByRole("button", { name: /背景/ }).click(); await page.getByRole("button", { name: "提升" }).click();
  await expect(page.getByText("提升章节已应用")).toBeVisible(); await page.getByRole("button", { name: "撤销" }).click();
  await page.locator(".cm-content").evaluate(element => { const clipboard = new DataTransfer(); clipboard.setData("text/plain", "# 粘贴的文档"); element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: clipboard })); });
  await expect(page.getByText("已将粘贴源码作为新的对比基线载入")).toBeVisible(); await expect(page.getByText("当前内容与对比基线一致")).toBeVisible();
});
