import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PackageInfo, EntryPoint } from "../types.js";

const COMMON_ENTRY_POINTS: readonly { path: string; kind: EntryPoint["kind"] }[] = [
  { path: "src/index.ts", kind: "index" },
  { path: "src/index.tsx", kind: "index" },
  { path: "src/index.js", kind: "index" },
  { path: "src/main.ts", kind: "main" },
  { path: "src/main.tsx", kind: "main" },
  { path: "src/main.js", kind: "main" },
  { path: "src/app.ts", kind: "main" },
  { path: "src/app.tsx", kind: "main" },
  { path: "src/app.js", kind: "main" },
  { path: "index.ts", kind: "index" },
  { path: "index.js", kind: "index" },
  { path: "main.go", kind: "main" },
  { path: "cmd/main.go", kind: "main" },
  { path: "src/main.rs", kind: "main" },
  { path: "src/lib.rs", kind: "main" },
  { path: "manage.py", kind: "main" },
  { path: "app.py", kind: "main" },
  { path: "main.py", kind: "main" },
];

const ROUTE_DIRS: readonly string[] = [
  "src/routes",
  "src/pages",
  "src/api",
  "app/routes",
  "app/api",
  "pages",
  "routes",
  "api",
];

const CONFIG_FILES: readonly string[] = [
  "next.config.js",
  "next.config.ts",
  "next.config.mjs",
  "vite.config.ts",
  "vite.config.js",
  "webpack.config.js",
  "webpack.config.ts",
  "nuxt.config.ts",
  "astro.config.mjs",
];

export function detectEntryPoints(
  cwd: string,
  packages: readonly PackageInfo[],
): readonly EntryPoint[] {
  const results: EntryPoint[] = [];
  const seen = new Set<string>();

  for (const pkg of packages) {
    if (pkg.manager === "npm") {
      const mainField = extractMainField(cwd);
      if (mainField && !seen.has(mainField)) {
        seen.add(mainField);
        results.push({ path: mainField, kind: "main" });
      }
    }
  }

  for (const { path, kind } of COMMON_ENTRY_POINTS) {
    if (!seen.has(path) && existsSync(join(cwd, path))) {
      seen.add(path);
      results.push({ path, kind });
    }
  }

  for (const dir of ROUTE_DIRS) {
    if (existsSync(join(cwd, dir))) {
      results.push({ path: dir, kind: "route" });
    }
  }

  for (const config of CONFIG_FILES) {
    if (!seen.has(config) && existsSync(join(cwd, config))) {
      seen.add(config);
      results.push({ path: config, kind: "config" });
    }
  }

  return results;
}

function extractMainField(cwd: string): string | null {
  try {
    const raw = readFileSync(join(cwd, "package.json"), "utf-8");
    const pkg = JSON.parse(raw) as Record<string, unknown>;
    if (typeof pkg["main"] === "string") return pkg["main"];
  } catch {
    // absent
  }
  return null;
}
