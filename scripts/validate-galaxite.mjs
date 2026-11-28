#!/usr/bin/env node
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IGNORE_DIRS = new Set([".git", "node_modules", ".next", "dist", "build"]);
const errors = [];

function walk(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) found.push(...walk(fullPath));
    } else if (entry.isFile()) {
      found.push(fullPath);
    }
  }
  return found;
}
function fail(message) { errors.push(message); }
function infoPath(file) { return relative(ROOT, file).split(sep).join("/"); }
function attr(tag, name) {
  const pattern = "\\b" + name + "\\s*=\\s*(?:\"([^\"]+)\"|'([^']+)'|([^\\s>]+))";
  const match = tag.match(new RegExp(pattern, "i"));
  return match ? (match[1] || match[2] || match[3] || "") : "";
}
function localTarget(htmlPath, raw) {
  const value = raw.trim();
  if (!value || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value)) return null;
  const clean = decodeURIComponent(value.split(/[?#]/, 1)[0]);
  if (!clean) return null;
  return clean.startsWith("/")
    ? resolve(ROOT, "." + clean)
    : resolve(dirname(htmlPath), clean);
}

const files = walk(ROOT);
const jsFiles = files.filter((file) => extname(file).toLowerCase() === ".js" || file.endsWith(".mjs"));
const htmlFiles = files.filter((file) => extname(file).toLowerCase() === ".html");

for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) fail("JavaScript syntax: " + infoPath(file) + "\n" + (result.stderr || result.stdout || "node --check failed"));
}

for (const file of htmlFiles) {
  const html = readFileSync(file, "utf8");
  const scriptTags = [...html.matchAll(/<script\b[^>]*>/gi)].map((match) => match[0]);
  const seenScripts = new Set();
  for (const tag of scriptTags) {
    const src = attr(tag, "src");
    const target = localTarget(file, src);
    if (!target) continue;
    if (seenScripts.has(target)) fail("Duplicate script reference in " + infoPath(file) + ": " + src);
    seenScripts.add(target);
    if (!existsSync(target)) fail("Missing script in " + infoPath(file) + ": " + src);
  }

  const linkTags = [...html.matchAll(/<link\b[^>]*>/gi)].map((match) => match[0]);
  for (const tag of linkTags) {
    const rel = attr(tag, "rel").toLowerCase().split(/\s+/);
    if (!rel.includes("stylesheet")) continue;
    const href = attr(tag, "href");
    const target = localTarget(file, href);
    if (target && !existsSync(target)) fail("Missing stylesheet in " + infoPath(file) + ": " + href);
  }
}

const requiredScripts = {
  "index.html": ["auth-config.js", "supabase-client.js", "account.js", "reports.js", "catalog.js", "app.js"],
  "admin.html": ["auth-config.js", "supabase-client.js", "reports.js", "admin.js"]
};
const requiredScriptOrder = {
  "index.html": ["auth-config.js", "supabase-client.js", "account.js", "catalog.js", "app.js"],
  "admin.html": ["auth-config.js", "supabase-client.js", "admin.js"]
};
for (const [htmlName, required] of Object.entries(requiredScripts)) {
  const file = resolve(ROOT, htmlName);
  if (!existsSync(file)) {
    fail("Missing required HTML entry point: " + htmlName);
    continue;
  }
  const html = readFileSync(file, "utf8");
  for (const script of required) {
    if (!html.includes('src="' + script + '"') && !html.includes("src='" + script + "'")) {
      fail(htmlName + " does not include required script " + script);
    }
  }
  const scriptSources = [...html.matchAll(/<script\b[^>]*src=["']([^"']+)["'][^>]*>/gi)].map((match) => match[1]);
  const order = requiredScriptOrder[htmlName] || [];
  const positions = order.map((script) => scriptSources.indexOf(script));
  if (positions.some((position) => position < 0) || positions.some((position, index) => index > 0 && position <= positions[index - 1])) {
    fail(htmlName + " loads shared Supabase client or app entry scripts in the wrong order.");
  }
}

// Scan repository text files, not only browser JavaScript. Exclude this validator because
// it necessarily contains the detection patterns themselves.
for (const file of files) {
  const relativeName = infoPath(file);
  if (relativeName === "scripts/validate-galaxite.mjs") continue;
  const source = readFileSync(file, "utf8");
  const secretPatterns = [
    [/\\bsb_secret_[A-Za-z0-9_-]{12,}/i, "Supabase secret key"],
    [/SERVICE_ROLE_KEY\\s*[:=]\\s*["'][^"']{20,}/i, "service-role secret"],
    [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, "private key material"],
    [/\\bAKIA[0-9A-Z]{16}\\b/, "AWS access key"],
    [/\\bgh[pousr]_[A-Za-z0-9]{30,}\\b/, "GitHub token"],
    [/\\bsk_live_[A-Za-z0-9]{20,}\\b/, "Stripe live secret"],
    [/\\bxox[baprs]-[A-Za-z0-9-]{10,}\\b/, "Slack token"]
  ];
  for (const [pattern, label] of secretPatterns) {
    if (pattern.test(source)) fail("Potential " + label + " in " + relativeName);
  }
}

const serviceWorker = resolve(ROOT, "sw.js");
if (!existsSync(serviceWorker)) {
  fail("Missing service worker: sw.js");
} else {
  const worker = readFileSync(serviceWorker, "utf8");
  const filesMatch = worker.match(/const\s+FILES\s*=\s*\[([\s\S]*?)\]\s*;/);
  if (!filesMatch) {
    fail("Could not read the service worker precache file list.");
  } else {
    try {
      const assets = JSON.parse("[" + filesMatch[1] + "]");
      for (const asset of assets) {
        if (typeof asset !== "string") {
          fail("Service worker precache entries must be string paths.");
          continue;
        }
        const target = localTarget(resolve(ROOT, "index.html"), asset);
        if (target && !existsSync(target)) fail("Missing service worker precache asset: " + asset);
      }
    } catch (error) {
      fail("Invalid service worker precache list: " + error.message);
    }
  }
  if (!/request\.mode\s*===\s*["']navigate["']/.test(worker)) {
    fail("Service worker must use index.html fallback only for navigation requests.");
  }
  if (!/key\.startsWith\(CACHE_PREFIX\)/.test(worker)) {
    fail("Service worker cache cleanup must be limited to the Galaxite cache prefix.");
  }
  if (!/response\.ok/.test(worker)) {
    fail("Service worker must not cache failed HTTP responses.");
  }
}

const manifest = resolve(ROOT, "manifest.webmanifest");
if (existsSync(manifest)) {
  try { JSON.parse(readFileSync(manifest, "utf8")); }
  catch (error) { fail("Invalid manifest.webmanifest JSON: " + error.message); }
}

if (errors.length) {
  console.error("Galaxite validation failed:");
  for (const error of errors) console.error("\n- " + error);
  process.exitCode = 1;
} else {
  console.log("Galaxite validation passed.");
  console.log("Checked " + jsFiles.length + " JavaScript files, " + htmlFiles.length + " HTML entry points, local assets, required scripts, public secret patterns, and manifest JSON.");
}
