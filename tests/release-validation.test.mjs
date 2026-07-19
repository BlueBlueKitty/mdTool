import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { validateRelease } from "../scripts/validate-release.mjs";
import { nextVersions, notesFromHistory } from "../scripts/publish-release.mjs";

const version = "1.2.3";
const base = `https://github.com/BlueBlueKitty/mdTool/releases`;

function fixture() {
  return {
    package: { version },
    tauri: { version },
    cargo: `[package]\nname = "mdtool"\nversion = "${version}"\n`,
    manifest: {
      version,
      notes: ["修复发布流程。", "补充跨平台安装包。"],
      releaseUrl: `${base}/tag/v${version}`,
      downloads: {
        windows: `${base}/download/v${version}/mdTool_${version}_x64-setup.exe`,
        macos: `${base}/download/v${version}/mdTool_${version}_universal.dmg`,
        linux: `${base}/download/v${version}/mdTool_${version}_amd64.AppImage`,
      },
    },
  };
}

async function withFixture(modify, action) {
  const root = await mkdtemp(path.join(tmpdir(), "mdtool-release-"));
  const files = fixture();
  modify?.(files);
  try {
    await mkdir(path.join(root, "src-tauri"));
    await Promise.all([
      writeFile(path.join(root, "package.json"), JSON.stringify(files.package)),
      writeFile(path.join(root, "version.json"), JSON.stringify(files.manifest)),
      writeFile(path.join(root, "src-tauri/tauri.conf.json"), JSON.stringify(files.tauri)),
      writeFile(path.join(root, "src-tauri/Cargo.toml"), files.cargo),
    ]);
    await action(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("发布预检接受一致的版本和下载地址", async () => {
  await withFixture(null, async (root) => {
    const result = await validateRelease("v1.2.3", root);
    assert.equal(result.version, version);
    assert.match(result.releaseBody, /修复发布流程/);
  });
});

test("发布预检拒绝不匹配的标签、版本、说明和下载地址", async () => {
  await assert.rejects(() => validateRelease("release-1.2.3"), /标签必须/);
  await withFixture((files) => { files.package.version = "1.2.2"; }, (root) =>
    assert.rejects(() => validateRelease("v1.2.3", root), /package\.json/));
  await withFixture((files) => { files.manifest.notes = []; }, (root) =>
    assert.rejects(() => validateRelease("v1.2.3", root), /notes/));
  await withFixture((files) => { files.manifest.downloads.linux = "https://example.com/mdTool.AppImage"; }, (root) =>
    assert.rejects(() => validateRelease("v1.2.3", root), /downloads\.linux/));
});

test("交互式发布提供语义化版本选项并从 Git 历史生成说明", () => {
  assert.deepEqual(nextVersions("1.2.3"), { patch: "1.2.4", minor: "1.3.0", major: "2.0.0" });
  assert.deepEqual(notesFromHistory("feat: 新功能\nfix: 修复问题\n"), ["feat: 新功能", "fix: 修复问题"]);
  assert.throws(() => nextVersions("1.2.3-beta.1"), /无法自动递增/);
  assert.throws(() => notesFromHistory("\n"), /没有可写入/);
});
