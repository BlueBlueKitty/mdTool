import { describe, expect, it } from "vitest";
import { downloadUrlForPlatform, isNewerVersion, parseReleaseManifest } from "../src/services/updater";

const manifest = {
  version: "0.2.0",
  notes: ["新增检查更新。"],
  releaseUrl: "https://github.com/BlueBlueKitty/mdTool/releases/tag/v0.2.0",
  downloads: {
    windows: "https://github.com/BlueBlueKitty/mdTool/releases/download/v0.2.0/mdTool.exe",
    macos: "https://github.com/BlueBlueKitty/mdTool/releases/download/v0.2.0/mdTool.dmg",
  },
};

describe("更新清单", () => {
  it("只接受完整的 HTTPS 更新数据", () => {
    expect(parseReleaseManifest(manifest)).toEqual(manifest);
    expect(() => parseReleaseManifest({ ...manifest, releaseUrl: "http://example.com" })).toThrow("Release 链接无效");
  });

  it("按语义版本比较并为对应平台选择安装包", () => {
    expect(isNewerVersion("0.2.0", "0.1.9")).toBe(true);
    expect(isNewerVersion("0.2.0", "0.2.0")).toBe(false);
    expect(isNewerVersion("0.2.0-beta.1", "0.2.0")).toBe(false);
    expect(downloadUrlForPlatform(parseReleaseManifest(manifest), "windows")).toContain("mdTool.exe");
    expect(downloadUrlForPlatform(parseReleaseManifest(manifest), "linux")).toBe(manifest.releaseUrl);
  });
});
