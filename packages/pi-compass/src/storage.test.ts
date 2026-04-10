import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getBaseDir,
  getProjectDir,
  getCodemapPath,
  getToursDir,
  getTourPath,
  ensureStorageLayout,
  loadCachedCodemap,
  saveCachedCodemap,
  loadCachedTour,
  saveCachedTour,
} from "./storage.js";
import type { CacheEntry, CodeMap, CodeTour } from "./types.js";

const tmpBase = mkdtempSync(join(tmpdir(), "compass-storage-test-"));

afterAll(() => {
  rmSync(tmpBase, { recursive: true, force: true });
});

const MINIMAL_CODEMAP: CodeMap = {
  projectId: "abc123",
  projectName: "test-project",
  generatedAt: "2026-01-01T00:00:00Z",
  contentHash: "hash123",
  directoryTree: [],
  packages: [],
  frameworks: [],
  entryPoints: [],
  buildScripts: [],
  conventions: [],
  keyFiles: [],
};

const MINIMAL_TOUR: CodeTour = {
  projectId: "abc123",
  topic: "auth",
  generatedAt: "2026-01-01T00:00:00Z",
  steps: [{ file: "src/auth.ts", description: "Auth module" }],
};

describe("path helpers", () => {
  it("getBaseDir returns a path under ~/.pi/compass", () => {
    expect(getBaseDir()).toContain(".pi");
    expect(getBaseDir()).toContain("compass");
  });

  it("getProjectDir nests under projects/", () => {
    expect(getProjectDir("abc", tmpBase)).toBe(join(tmpBase, "projects", "abc"));
  });

  it("getCodemapPath returns codemap.json", () => {
    expect(getCodemapPath("abc", tmpBase)).toBe(join(tmpBase, "projects", "abc", "codemap.json"));
  });

  it("getToursDir returns tours/", () => {
    expect(getToursDir("abc", tmpBase)).toBe(join(tmpBase, "projects", "abc", "tours"));
  });

  it("getTourPath returns topic.json", () => {
    expect(getTourPath("abc", "auth", tmpBase)).toBe(join(tmpBase, "projects", "abc", "tours", "auth.json"));
  });
});

describe("ensureStorageLayout", () => {
  it("creates project and tours directories", () => {
    ensureStorageLayout("layout-test", tmpBase);
    expect(existsSync(getToursDir("layout-test", tmpBase))).toBe(true);
  });

  it("is idempotent", () => {
    ensureStorageLayout("idem-test", tmpBase);
    ensureStorageLayout("idem-test", tmpBase);
  });
});

describe("codemap cache", () => {
  it("returns null when no cache exists", () => {
    ensureStorageLayout("no-cache", tmpBase);
    expect(loadCachedCodemap("no-cache", tmpBase)).toBeNull();
  });

  it("round-trips codemap cache", () => {
    ensureStorageLayout("roundtrip", tmpBase);
    const entry: CacheEntry<CodeMap> = {
      data: MINIMAL_CODEMAP,
      contentHash: "hash123",
      createdAt: "2026-01-01T00:00:00Z",
    };
    saveCachedCodemap("roundtrip", entry, tmpBase);
    const loaded = loadCachedCodemap("roundtrip", tmpBase);
    expect(loaded).toEqual(entry);
  });
});

describe("tour cache", () => {
  it("returns null when no tour cached", () => {
    ensureStorageLayout("no-tour", tmpBase);
    expect(loadCachedTour("no-tour", "auth", tmpBase)).toBeNull();
  });

  it("round-trips tour cache", () => {
    ensureStorageLayout("tour-rt", tmpBase);
    const entry: CacheEntry<CodeTour> = {
      data: MINIMAL_TOUR,
      contentHash: "hash456",
      createdAt: "2026-01-01T00:00:00Z",
    };
    saveCachedTour("tour-rt", "auth", entry, tmpBase);
    const loaded = loadCachedTour("tour-rt", "auth", tmpBase);
    expect(loaded).toEqual(entry);
  });
});
