import { describe, it, expect } from "vitest";
import { detectFrameworks } from "./framework-detector.js";
import type { PackageInfo } from "../types.js";

function npmPkg(deps: string[]): PackageInfo {
  return { manager: "npm", name: "test", dependencies: deps };
}

describe("detectFrameworks", () => {
  it("detects React from dependencies", () => {
    const result = detectFrameworks([npmPkg(["react", "react-dom"])]);
    expect(result).toEqual([
      expect.objectContaining({ name: "React", confidence: "definite" }),
    ]);
  });

  it("detects Next.js", () => {
    const result = detectFrameworks([npmPkg(["next", "react"])]);
    expect(result.map((f) => f.name)).toContain("Next.js");
    expect(result.map((f) => f.name)).toContain("React");
  });

  it("detects Express", () => {
    const result = detectFrameworks([npmPkg(["express"])]);
    expect(result).toEqual([
      expect.objectContaining({ name: "Express", confidence: "definite" }),
    ]);
  });

  it("detects Vitest", () => {
    const result = detectFrameworks([npmPkg(["vitest"])]);
    expect(result.map((f) => f.name)).toContain("Vitest");
  });

  it("detects Python frameworks from pip deps", () => {
    const pkg: PackageInfo = { manager: "pip", name: "myapp", dependencies: ["django", "celery"] };
    const result = detectFrameworks([pkg]);
    expect(result.map((f) => f.name)).toContain("Django");
  });

  it("detects Rust frameworks from cargo deps", () => {
    const pkg: PackageInfo = { manager: "cargo", name: "myapp", dependencies: ["actix-web", "tokio"] };
    const result = detectFrameworks([pkg]);
    expect(result.map((f) => f.name)).toContain("Actix Web");
    expect(result.map((f) => f.name)).toContain("Tokio");
  });

  it("deduplicates frameworks", () => {
    const result = detectFrameworks([
      npmPkg(["@nestjs/core", "nestjs"]),
    ]);
    const nestCounts = result.filter((f) => f.name === "NestJS");
    expect(nestCounts).toHaveLength(1);
  });

  it("returns empty for no matches", () => {
    expect(detectFrameworks([npmPkg(["lodash"])])).toEqual([]);
  });

  it("handles multiple package managers", () => {
    const result = detectFrameworks([
      npmPkg(["react"]),
      { manager: "pip", name: "backend", dependencies: ["flask"] },
    ]);
    expect(result.map((f) => f.name)).toContain("React");
    expect(result.map((f) => f.name)).toContain("Flask");
  });
});
