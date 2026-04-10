import type { PackageInfo, FrameworkDetection } from "../types.js";

interface FrameworkRule {
  readonly dep: string;
  readonly name: string;
  readonly confidence: "definite" | "likely";
}

const FRAMEWORK_RULES: readonly FrameworkRule[] = [
  { dep: "next", name: "Next.js", confidence: "definite" },
  { dep: "react", name: "React", confidence: "definite" },
  { dep: "vue", name: "Vue", confidence: "definite" },
  { dep: "@angular/core", name: "Angular", confidence: "definite" },
  { dep: "svelte", name: "Svelte", confidence: "definite" },
  { dep: "express", name: "Express", confidence: "definite" },
  { dep: "fastify", name: "Fastify", confidence: "definite" },
  { dep: "hono", name: "Hono", confidence: "definite" },
  { dep: "koa", name: "Koa", confidence: "definite" },
  { dep: "nestjs", name: "NestJS", confidence: "likely" },
  { dep: "@nestjs/core", name: "NestJS", confidence: "definite" },
  { dep: "nuxt", name: "Nuxt", confidence: "definite" },
  { dep: "remix", name: "Remix", confidence: "likely" },
  { dep: "@remix-run/react", name: "Remix", confidence: "definite" },
  { dep: "astro", name: "Astro", confidence: "definite" },
  { dep: "gatsby", name: "Gatsby", confidence: "definite" },
  { dep: "tailwindcss", name: "Tailwind CSS", confidence: "definite" },
  { dep: "prisma", name: "Prisma", confidence: "definite" },
  { dep: "@prisma/client", name: "Prisma", confidence: "definite" },
  { dep: "drizzle-orm", name: "Drizzle", confidence: "definite" },
  { dep: "django", name: "Django", confidence: "definite" },
  { dep: "flask", name: "Flask", confidence: "definite" },
  { dep: "fastapi", name: "FastAPI", confidence: "definite" },
  { dep: "spring-boot", name: "Spring Boot", confidence: "likely" },
  { dep: "actix-web", name: "Actix Web", confidence: "definite" },
  { dep: "rocket", name: "Rocket", confidence: "definite" },
  { dep: "axum", name: "Axum", confidence: "definite" },
  { dep: "tokio", name: "Tokio", confidence: "definite" },
  { dep: "gin-gonic/gin", name: "Gin", confidence: "definite" },
  { dep: "labstack/echo", name: "Echo", confidence: "definite" },
  { dep: "gofiber/fiber", name: "Fiber", confidence: "definite" },
  { dep: "laravel/framework", name: "Laravel", confidence: "definite" },
  { dep: "symfony/framework-bundle", name: "Symfony", confidence: "definite" },
  { dep: "vitest", name: "Vitest", confidence: "definite" },
  { dep: "jest", name: "Jest", confidence: "definite" },
  { dep: "playwright", name: "Playwright", confidence: "definite" },
  { dep: "@playwright/test", name: "Playwright", confidence: "definite" },
  { dep: "cypress", name: "Cypress", confidence: "definite" },
  { dep: "pytest", name: "pytest", confidence: "definite" },
];

export function detectFrameworks(
  packages: readonly PackageInfo[],
): readonly FrameworkDetection[] {
  const allDeps = new Set<string>();
  for (const pkg of packages) {
    for (const dep of pkg.dependencies) {
      allDeps.add(dep);
    }
  }

  const seen = new Set<string>();
  const results: FrameworkDetection[] = [];

  for (const rule of FRAMEWORK_RULES) {
    if (allDeps.has(rule.dep) && !seen.has(rule.name)) {
      seen.add(rule.name);
      results.push({
        name: rule.name,
        confidence: rule.confidence,
        source: rule.dep,
      });
    }
  }

  return results;
}
