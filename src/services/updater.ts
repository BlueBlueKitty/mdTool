export type Platform = "windows" | "macos" | "linux" | "unknown";

export interface ReleaseManifest {
  version: string;
  notes: string[];
  releaseUrl: string;
  downloads: Partial<Record<Exclude<Platform, "unknown">, string>>;
}

export const updateManifestUrl =
  "https://raw.githubusercontent.com/BlueBlueKitty/mdTool/main/version.json";

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function parseReleaseManifest(value: unknown): ReleaseManifest {
  if (!value || typeof value !== "object") throw new Error("版本清单格式无效");
  const source = value as Record<string, unknown>;
  if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(String(source.version ?? "")))
    throw new Error("版本号格式无效");
  if (!Array.isArray(source.notes) || !source.notes.every((note) => typeof note === "string"))
    throw new Error("版本说明格式无效");
  if (!isHttpsUrl(source.releaseUrl)) throw new Error("Release 链接无效");
  const downloads = source.downloads;
  if (!downloads || typeof downloads !== "object") throw new Error("下载链接格式无效");
  const validDownloads = Object.fromEntries(
    Object.entries(downloads).filter(
      ([platform, url]) => ["windows", "macos", "linux"].includes(platform) && isHttpsUrl(url),
    ),
  ) as ReleaseManifest["downloads"];
  return { version: source.version as string, notes: source.notes as string[], releaseUrl: source.releaseUrl as string, downloads: validDownloads };
}

export async function fetchLatestRelease(fetcher: typeof fetch = fetch): Promise<ReleaseManifest> {
  const response = await fetcher(updateManifestUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`无法获取更新信息（HTTP ${response.status}）`);
  return parseReleaseManifest(await response.json());
}

function versionParts(value: string) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([\w.-]+))?$/.exec(value);
  if (!match) return null;
  return { numbers: match.slice(1, 4).map(Number), preRelease: match[4] };
}

export function isNewerVersion(remote: string, current: string): boolean {
  const next = versionParts(remote);
  const installed = versionParts(current);
  if (!next || !installed) return false;
  for (let index = 0; index < 3; index += 1) {
    if (next.numbers[index] !== installed.numbers[index]) return next.numbers[index] > installed.numbers[index];
  }
  return !next.preRelease && Boolean(installed.preRelease);
}

export function detectBrowserPlatform(): Platform {
  const agent = navigator.userAgent.toLowerCase();
  if (agent.includes("win")) return "windows";
  if (agent.includes("mac")) return "macos";
  if (agent.includes("linux")) return "linux";
  return "unknown";
}

export function downloadUrlForPlatform(manifest: ReleaseManifest, platform: Platform): string {
  return platform === "unknown" ? manifest.releaseUrl : manifest.downloads[platform] ?? manifest.releaseUrl;
}
