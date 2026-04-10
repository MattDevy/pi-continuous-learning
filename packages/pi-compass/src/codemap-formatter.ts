import type { CodeMap } from "./types.js";
import { formatDirectoryTree } from "./analyzers/directory-tree.js";

export function formatCodemapMarkdown(codemap: CodeMap): string {
  const sections: string[] = [
    `## Codebase Map: ${codemap.projectName}`,
    `Generated: ${codemap.generatedAt} | Hash: ${codemap.contentHash}`,
  ];

  if (codemap.directoryTree.length > 0) {
    sections.push(
      "",
      "### Directory Structure",
      "```",
      formatDirectoryTree(codemap.directoryTree),
      "```",
    );
  }

  if (codemap.packages.length > 0) {
    sections.push("", "### Packages");
    for (const pkg of codemap.packages) {
      const version = pkg.version ? ` v${pkg.version}` : "";
      sections.push(`- **${pkg.name || "(unnamed)"}**${version} (${pkg.manager})`);
      if (pkg.dependencies.length > 0) {
        const depList = pkg.dependencies.slice(0, 20).join(", ");
        const more = pkg.dependencies.length > 20 ? ` (+${pkg.dependencies.length - 20} more)` : "";
        sections.push(`  Dependencies: ${depList}${more}`);
      }
    }
  }

  if (codemap.frameworks.length > 0) {
    sections.push("", "### Frameworks");
    for (const fw of codemap.frameworks) {
      const version = fw.version ? ` v${fw.version}` : "";
      const confidence = fw.confidence === "likely" ? " (likely)" : "";
      sections.push(`- ${fw.name}${version}${confidence}`);
    }
  }

  if (codemap.entryPoints.length > 0) {
    sections.push("", "### Entry Points");
    for (const ep of codemap.entryPoints) {
      sections.push(`- \`${ep.path}\` (${ep.kind})`);
    }
  }

  if (codemap.buildScripts.length > 0) {
    sections.push("", "### Build / Test / Deploy");
    for (const script of codemap.buildScripts) {
      sections.push(`- **${script.name}**: \`${script.command}\` (${script.source})`);
    }
  }

  if (codemap.conventions.length > 0) {
    sections.push("", "### Conventions");
    for (const conv of codemap.conventions) {
      sections.push(``, `#### ${conv.source}`, conv.content);
    }
  }

  if (codemap.keyFiles.length > 0) {
    sections.push("", "### Key Files");
    for (const kf of codemap.keyFiles) {
      sections.push(`- \`${kf.path}\` -- ${kf.description}`);
    }
  }

  return sections.join("\n");
}

export function truncateCodemap(markdown: string, maxChars: number): string {
  if (markdown.length <= maxChars) return markdown;

  const lines = markdown.split("\n");
  let length = 0;
  const kept: string[] = [];

  for (const line of lines) {
    if (length + line.length + 1 > maxChars) {
      kept.push("", "... (codemap truncated, run /onboard to see full output)");
      break;
    }
    kept.push(line);
    length += line.length + 1;
  }

  return kept.join("\n");
}
