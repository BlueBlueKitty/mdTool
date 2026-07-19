import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { expectedUrls, validateRelease } from "./validate-release.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  throw new Error(`无法发布：${message}`);
}

function run(command, args) {
  execFileSync(command, args, { cwd: root, stdio: "inherit" });
}

function output(command, args) {
  return execFileSync(command, args, { cwd: root, encoding: "utf8" }).trim();
}

export function nextVersions(current) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
  if (!match) fail(`当前版本 ${current} 不是普通的 X.Y.Z 版本，无法自动递增`);
  const [major, minor, patch] = match.slice(1).map(Number);
  return {
    patch: `${major}.${minor}.${patch + 1}`,
    minor: `${major}.${minor + 1}.0`,
    major: `${major + 1}.0.0`,
  };
}

export function notesFromHistory(history) {
  const notes = history.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (notes.length === 0) fail("自上个发布标签以来没有可写入 Release 的 Git 提交");
  return notes;
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
}

async function chooseVersion(current) {
  const candidates = nextVersions(current);
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log(`当前版本：${current}`);
    console.log(`1) 补丁版本  ${candidates.patch}`);
    console.log(`2) 次版本    ${candidates.minor}`);
    console.log(`3) 主版本    ${candidates.major}`);
    console.log("4) 自定义版本（支持 1.2.3-beta.1）");
    const answer = (await prompt.question("选择下一版本 [1]: ")).trim() || "1";
    if (answer === "1") return candidates.patch;
    if (answer === "2") return candidates.minor;
    if (answer === "3") return candidates.major;
    if (answer === "4") {
      const custom = (await prompt.question("输入版本号: ")).trim();
      if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(custom)) fail("自定义版本必须为 X.Y.Z 或 X.Y.Z-beta.1");
      return custom;
    }
    fail("请选择 1、2、3 或 4");
  } finally {
    prompt.close();
  }
}

function latestReleaseTag() {
  try {
    return output("git", ["describe", "--tags", "--abbrev=0", "--match", "v*"]);
  } catch {
    return null;
  }
}

function releaseNotes() {
  const tag = latestReleaseTag();
  const range = tag ? `${tag}..HEAD` : "HEAD";
  const history = output("git", ["log", "--format=%s", range]);
  return notesFromHistory(history);
}

async function updateReleaseMetadata(version, notes) {
  const [packageJson, tauriConfig, versionManifest, cargoToml] = await Promise.all([
    readJson("package.json"),
    readJson("src-tauri/tauri.conf.json"),
    readJson("version.json"),
    readFile(path.join(root, "src-tauri/Cargo.toml"), "utf8"),
  ]);
  packageJson.version = version;
  tauriConfig.version = version;
  const urls = expectedUrls(version);
  Object.assign(versionManifest, { version, notes, ...urls });
  const nextCargoToml = cargoToml.replace(
    /^(\[package\][\s\S]*?^version\s*=\s*)"[^"]+"/m,
    `$1"${version}"`,
  );
  if (nextCargoToml === cargoToml) fail("无法更新 src-tauri/Cargo.toml 的 package.version");
  await Promise.all([
    writeFile(path.join(root, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`),
    writeFile(path.join(root, "src-tauri/tauri.conf.json"), `${JSON.stringify(tauriConfig, null, 2)}\n`),
    writeFile(path.join(root, "version.json"), `${JSON.stringify(versionManifest, null, 2)}\n`),
    writeFile(path.join(root, "src-tauri/Cargo.toml"), nextCargoToml),
  ]);
}

async function main() {
  if (process.argv.length > 2) fail("无需传入版本号；运行 npm run release 后按提示选择版本");
  if (output("git", ["branch", "--show-current"]) !== "main") fail("必须在 main 分支运行发布命令");
  if (output("git", ["status", "--porcelain"]) !== "") fail("工作区必须干净；请先提交或暂存无关改动");

  const packageJson = await readJson("package.json");
  const version = await chooseVersion(packageJson.version);
  const tag = `v${version}`;
  try {
    output("git", ["rev-parse", "--verify", "--quiet", tag]);
    fail(`标签 ${tag} 已存在`);
  } catch (error) {
    if (error.message.startsWith("无法发布")) throw error;
  }

  const notes = releaseNotes();
  console.log("\n本次 Release 内容：");
  console.log(notes.map((note) => `- ${note}`).join("\n"));
  await updateReleaseMetadata(version, notes);
  await validateRelease(tag, root);
  run("npm", ["test"]);
  run("npm", ["run", "build"]);
  run("git", ["add", "package.json", "version.json", "src-tauri/tauri.conf.json", "src-tauri/Cargo.toml"]);
  run("git", ["commit", "-m", `release: ${tag}`]);
  run("git", ["push", "origin", "main"]);
  run("git", ["tag", tag]);
  run("git", ["push", "origin", tag]);
  console.log(`已推送 ${tag}，GitHub Actions 将开始创建 Release。`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
