import { readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import type { CodeMap, CodeTour, TourStep, CacheEntry } from "./types.js";
import { loadCachedTour, saveCachedTour } from "./storage.js";

const TEST_INDICATORS = ["test", "tests", "spec", "__tests__", "e2e"];
const CI_INDICATORS = [".github", ".gitlab-ci.yml", "Jenkinsfile"];
const DB_INDICATORS = ["migrations", "prisma", "drizzle", "alembic", "db", "database"];

export function detectAvailableTopics(
  _cwd: string,
  codemap: CodeMap,
): readonly string[] {
  const topics: string[] = [];

  for (const entry of codemap.directoryTree) {
    if (entry.type === "dir" && entry.name !== "node_modules" && entry.name !== "dist") {
      topics.push(entry.name);
    }
  }

  const allNames = codemap.directoryTree.map((e) => e.name.toLowerCase());
  const keyFilePaths = codemap.keyFiles.map((k) => k.path.toLowerCase());

  if (TEST_INDICATORS.some((t) => allNames.includes(t))) {
    topics.push("testing");
  }
  if (CI_INDICATORS.some((c) => allNames.includes(c) || keyFilePaths.some((k) => k.includes(c)))) {
    topics.push("ci");
  }
  if (DB_INDICATORS.some((d) => allNames.includes(d))) {
    topics.push("database");
  }

  return [...new Set(topics)];
}

export function generateTour(
  cwd: string,
  topic: string,
  codemap: CodeMap,
): CodeTour {
  const steps = buildTourSteps(cwd, topic);

  return {
    projectId: codemap.projectId,
    topic,
    generatedAt: new Date().toISOString(),
    steps,
  };
}

function buildTourSteps(
  cwd: string,
  topic: string,
): TourStep[] {
  const steps: TourStep[] = [];

  const topicDir = join(cwd, topic);
  const srcTopicDir = join(cwd, "src", topic);

  const dir = safeIsDir(topicDir) ? topicDir : safeIsDir(srcTopicDir) ? srcTopicDir : null;

  if (dir) {
    const files = collectFiles(dir, cwd, 3);
    for (const file of files.slice(0, 15)) {
      steps.push({
        file,
        description: describeFile(file),
      });
    }
  }

  if (topic === "testing") {
    steps.push(...findTestFiles(cwd));
  } else if (topic === "ci") {
    steps.push(...findCiFiles(cwd));
  }

  return steps;
}

function collectFiles(dir: string, root: string, depth: number): string[] {
  if (depth <= 0) return [];
  const results: string[] = [];

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }

  for (const name of entries.sort()) {
    if (name.startsWith(".")) continue;
    const full = join(dir, name);
    const rel = full.slice(root.length + 1);

    try {
      const stat = statSync(full);
      if (stat.isFile() && isSourceFile(name)) {
        results.push(rel);
      } else if (stat.isDirectory()) {
        results.push(...collectFiles(full, root, depth - 1));
      }
    } catch {
      continue;
    }
  }

  return results;
}

function findTestFiles(cwd: string): TourStep[] {
  const steps: TourStep[] = [];
  for (const dir of TEST_INDICATORS) {
    const full = join(cwd, dir);
    if (safeIsDir(full)) {
      const files = collectFiles(full, cwd, 2);
      for (const file of files.slice(0, 5)) {
        steps.push({ file, description: describeFile(file) });
      }
    }
  }
  return steps;
}

function findCiFiles(cwd: string): TourStep[] {
  const steps: TourStep[] = [];
  const workflowDir = join(cwd, ".github", "workflows");
  if (safeIsDir(workflowDir)) {
    try {
      for (const name of readdirSync(workflowDir)) {
        steps.push({
          file: `.github/workflows/${name}`,
          description: `CI workflow: ${name}`,
        });
      }
    } catch {
      // ignore
    }
  }

  for (const file of [".gitlab-ci.yml", "Jenkinsfile"]) {
    if (safeExists(join(cwd, file))) {
      steps.push({ file, description: `CI configuration: ${file}` });
    }
  }

  return steps;
}

function describeFile(filePath: string): string {
  const parts = filePath.split("/");
  const fileName = parts[parts.length - 1] ?? filePath;
  const ext = extname(fileName);
  const baseName = fileName.replace(ext, "");

  if (fileName.includes("test") || fileName.includes("spec")) {
    return `Test file for ${baseName.replace(/[._-]?(test|spec)/, "")}`;
  }
  if (fileName === "index.ts" || fileName === "index.js") {
    const parent = parts[parts.length - 2];
    return parent ? `Entry point for ${parent} module` : "Package entry point";
  }
  if (fileName.includes("config")) return `Configuration: ${baseName}`;
  if (fileName.includes("route") || fileName.includes("router")) return `Routing: ${baseName}`;
  if (fileName.includes("middleware")) return `Middleware: ${baseName}`;
  if (fileName.includes("model") || fileName.includes("schema")) return `Data model: ${baseName}`;
  if (fileName.includes("service")) return `Service: ${baseName}`;
  if (fileName.includes("controller") || fileName.includes("handler")) return `Handler: ${baseName}`;
  if (fileName.includes("util") || fileName.includes("helper")) return `Utility: ${baseName}`;

  return `${baseName} module`;
}

const SOURCE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java",
  ".rb", ".php", ".ex", ".exs", ".kt", ".swift", ".c", ".cpp",
  ".h", ".yml", ".yaml", ".toml", ".json",
]);

function isSourceFile(name: string): boolean {
  return SOURCE_EXTENSIONS.has(extname(name));
}

function safeIsDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function safeExists(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

export function formatTourMarkdown(tour: CodeTour): string {
  if (tour.steps.length === 0) {
    return `No files found for topic "${tour.topic}".`;
  }

  const lines = [`## Code Tour: ${tour.topic}`, ""];
  for (let i = 0; i < tour.steps.length; i++) {
    const step = tour.steps[i]!;
    lines.push(`**${i + 1}.** \`${step.file}\``);
    lines.push(`   ${step.description}`);
    lines.push("");
  }
  return lines.join("\n");
}

export function getOrGenerateTour(
  cwd: string,
  topic: string,
  codemap: CodeMap,
  projectId: string,
  baseDir?: string,
): CodeTour {
  const cached = loadCachedTour(projectId, topic, baseDir);
  if (cached) return cached.data;

  const tour = generateTour(cwd, topic, codemap);
  const entry: CacheEntry<CodeTour> = {
    data: tour,
    contentHash: codemap.contentHash,
    createdAt: tour.generatedAt,
  };
  saveCachedTour(projectId, topic, entry, baseDir);
  return tour;
}
