// Mirrors the public runtime configuration the official app ships inside its
// release IPK into local.properties (gitignored).
//
// Why: this build reads local.properties for the backend and integration keys, and
// falls back to the empty local.example.properties. With an empty
// NUVIO_SUPABASE_URL the app cannot initialise the account/backend and stays on the
// startup screen, so a fresh clone (or CI) has to mirror the official values first.
//
// Usage: node scripts/mirror-official-runtime-env.mjs [--tag 1.1.2]

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const OFFICIAL_REPO = "NuvioMedia/NuvioTVSmart";
const APP_ID = "space.nuvio.webos";

const tagArgIndex = process.argv.indexOf("--tag");
const requestedTag = tagArgIndex >= 0 ? process.argv[tagArgIndex + 1] : "";

async function resolveRelease() {
  const url = requestedTag
    ? `https://api.github.com/repos/${OFFICIAL_REPO}/releases/tags/${requestedTag}`
    : `https://api.github.com/repos/${OFFICIAL_REPO}/releases/latest`;
  const response = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  if (!response.ok) {
    throw new Error(`GitHub release lookup failed: HTTP ${response.status}`);
  }
  const release = await response.json();
  const asset = (release.assets || []).find((entry) => /^NuvioTV-webOS-.*\.ipk$/i.test(entry.name));
  if (!asset) {
    throw new Error(`No webOS IPK asset in release ${release.tag_name}`);
  }
  return { tag: release.tag_name, asset };
}

function parseEnvDocument(source) {
  const values = {};
  const pattern = /([A-Z][A-Z0-9_]+):"((?:[^"\\]|\\.)*)"/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    values[match[1]] = match[2].replace(/\\"/g, '"');
  }
  return values;
}

const { tag, asset } = await resolveRelease();
const workDir = mkdtempSync(path.join(tmpdir(), "nuvio-runtime-env-"));
try {
  const ipkPath = path.join(workDir, asset.name);
  process.stdout.write(`Downloading ${asset.name} from ${tag}...\n`);
  const download = await fetch(asset.browser_download_url, { redirect: "follow" });
  if (!download.ok) {
    throw new Error(`Download failed: HTTP ${download.status}`);
  }
  writeFileSync(ipkPath, Buffer.from(await download.arrayBuffer()));
  execFileSync("ar", ["x", asset.name], { cwd: workDir });
  execFileSync("tar", ["-xzf", "data.tar.gz"], { cwd: workDir });
  const envPath = path.join(workDir, "usr", "palm", "applications", APP_ID, "nuvio.env.js");
  const values = parseEnvDocument(readFileSync(envPath, "utf8"));
  const keys = Object.keys(values);
  if (!values.NUVIO_SUPABASE_URL || !values.NUVIO_SUPABASE_ANON_KEY) {
    throw new Error("The official env document has no Supabase configuration");
  }
  const lines = [
    "# Mirrored from the official app release " + tag + " by",
    "# scripts/mirror-official-runtime-env.mjs. Public client configuration only.",
    ...keys.map((key) => `${key}=${values[key]}`),
    ""
  ];
  writeFileSync(path.join(rootDir, "local.properties"), lines.join("\n"), "utf8");
  process.stdout.write(`Wrote local.properties with ${keys.length} keys from ${tag}.\n`);
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
