import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repository = "BlueBlueKitty/mdTool";

function fail(message) {
  throw new Error(`发布预检失败：${message}`);
}

async function readJson(root, relativePath) {
  try {
    return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
  } catch (error) {
    fail(`无法读取 ${relativePath}（${error.message}）`);
  }
}

function cargoVersion(source) {
  const match = /^version\s*=\s*"([^"]+)"/m.exec(source);
  if (!match) fail("src-tauri/Cargo.toml 中没有 package.version");
  return match[1];
}

export function expectedUrls(version) {
  const base = `https://github.com/${repository}/releases`;
  const downloadBase = `${base}/download/v${version}`;
  return {
    releaseUrl: `${base}/tag/v${version}`,
    downloads: {
      windows: `${downloadBase}/mdTool_${version}_x64-setup.exe`,
      macos: `${downloadBase}/mdTool_${version}_universal.dmg`,
      linux: `${downloadBase}/mdTool_${version}_amd64.AppImage`,
    },
  };
}

export async function validateRelease(tag, root = repoRoot) {
  const tagMatch = /^v(\d+\.\d+\.\d+(?:-[\w.-]+)?)$/.exec(tag ?? "");
  if (!tagMatch) fail("标签必须为 vX.Y.Z（预发布可使用 vX.Y.Z-beta.1）");
  const version = tagMatch[1];
  const [packageJson, tauriConfig, versionManifest, cargoToml] = await Promise.all([
    readJson(root, "package.json"),
    readJson(root, "src-tauri/tauri.conf.json"),
    readJson(root, "version.json"),
    readFile(path.join(root, "src-tauri/Cargo.toml"), "utf8"),
  ]);

  const versions = {
    "package.json": packageJson.version,
    "src-tauri/tauri.conf.json": tauriConfig.version,
    "src-tauri/Cargo.toml": cargoVersion(cargoToml),
    "version.json": versionManifest.version,
  };
  for (const [file, actual] of Object.entries(versions)) {
    if (actual !== version) fail(`${file} 的版本号为 ${actual ?? "缺失"}，应为 ${version}`);
  }

  if (!Array.isArray(versionManifest.notes) || versionManifest.notes.length === 0 ||
      versionManifest.notes.some((note) => typeof note !== "string" || note.trim() === "")) {
    fail("version.json.notes 必须包含至少一条非空更新说明");
  }

  const expected = expectedUrls(version);
  if (versionManifest.releaseUrl !== expected.releaseUrl) {
    fail(`version.json.releaseUrl 必须为 ${expected.releaseUrl}`);
  }
  for (const [platform, expectedUrl] of Object.entries(expected.downloads)) {
    if (versionManifest.downloads?.[platform] !== expectedUrl) {
      fail(`version.json.downloads.${platform} 必须为 ${expectedUrl}`);
    }
  }

  return {
    version,
    releaseBody: versionManifest.notes.map((note) => `- ${note.trim()}`).join("\n"),
  };
}

async function main() {
  const [tag, option] = process.argv.slice(2);
  const result = await validateRelease(tag);
  if (option === "--github-output") {
    if (!process.env.GITHUB_OUTPUT) fail("--github-output 需要 GITHUB_OUTPUT 环境变量");
    const { appendFile } = await import("node:fs/promises");
    const delimiter = "MD_TOOL_RELEASE_BODY";
    await appendFile(process.env.GITHUB_OUTPUT, `release_body<<${delimiter}\n${result.releaseBody}\n${delimiter}\n`);
  } else if (option) {
    fail(`未知参数 ${option}`);
  }
  console.log(`发布预检通过：v${result.version}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
