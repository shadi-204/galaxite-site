#!/usr/bin/env node
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = resolve(ROOT, "dist");
const OMIT_DIRS = new Set([".git", ".github", "node_modules", "dist", "docs", "scripts", "supabase"]);
const OMIT_FILES = new Set(["README.md"]);

function copyPublicFiles(source, destination) {
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory() && OMIT_DIRS.has(entry.name)) continue;
    if (entry.isFile() && OMIT_FILES.has(entry.name)) continue;

    const from = join(source, entry.name);
    const to = join(destination, entry.name);

    if (entry.isDirectory()) {
      mkdirSync(to, { recursive: true });
      copyPublicFiles(from, to);
    } else if (entry.isFile()) {
      copyFileSync(from, to);
    }
  }
}

rmSync(OUTPUT, { recursive: true, force: true });
mkdirSync(OUTPUT, { recursive: true });
copyPublicFiles(ROOT, OUTPUT);
writeFileSync(join(OUTPUT, ".nojekyll"), "", "utf8");

for (const required of ["index.html", "admin.html", "404.html", "sw.js", "manifest.webmanifest"]) {
  if (!existsSync(join(OUTPUT, required))) {
    throw new Error("The static preview build is missing " + required);
  }
}

const copiedFiles = [];
function collect(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) collect(fullPath);
    else if (entry.isFile()) copiedFiles.push(relative(OUTPUT, fullPath).split(sep).join("/"));
  }
}
collect(OUTPUT);

console.log("Galaxite static preview build completed.");
console.log("Output: dist/");
console.log("Copied " + copiedFiles.length + " deployable files.");
console.log("This project is static HTML/CSS/JavaScript; no bundler or npm dependency is required.");
