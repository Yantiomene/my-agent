import { z } from "zod";
import { tool } from "ai";
import { simpleGit } from "simple-git";
// New imports for file operations and path handling
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const fileChange = z.object({
  rootDir: z.string().min(1).describe("The root directory"),
});

type FileChange = z.infer<typeof fileChange>;

const excludeFiles = ["dist", "bun.lock"];

async function getFileChangesInDirectory({ rootDir }: FileChange) {
  const git = simpleGit(rootDir);
  const summary = await git.diffSummary();
  const diffs: { file: string; diff: string }[] = [];

  for (const file of summary.files) {
    if (excludeFiles.includes(file.file)) continue;
    const diff = await git.diff(["--", file.file]);
    diffs.push({ file: file.file, diff });
  }

  return diffs;
}

export const getFileChangesInDirectoryTool = tool({
  description: "Gets the code changes made in given directory",
  inputSchema: fileChange,
  execute: getFileChangesInDirectory,
});

// Commit message generation tool
const commitMessageInput = z.object({
  rootDir: z.string().min(1).describe("The repository root directory to inspect for changes"),
  mode: z
    .enum(["staged", "unstaged"]) // staged -> --cached; unstaged -> working tree
    .default("unstaged")
    .describe("Whether to use staged (index) changes or unstaged working tree changes"),
  convention: z
    .enum(["conventional", "plain"]) // commit message style
    .default("conventional")
    .describe("Style of the commit message to generate"),
  maxSubjectLength: z
    .number()
    .int()
    .min(20)
    .max(100)
    .default(72)
    .describe("Maximum subject length for the first line")
});

type CommitMessageInput = z.infer<typeof commitMessageInput>;

type SuggestedCommitMessage = {
  subject: string;
  body?: string;
  type: string; // feat, fix, docs, refactor, chore, build, test, perf, style, ci
  scope?: string;
  files: string[];
};

function detectTypeFromFiles(files: string[]): { type: string; scope?: string } {
  const lower = (s: string) => s.toLowerCase();
  const exts = files.map((f) => lower(f.split(".").pop() || ""));

  const onlyDocs = files.every((f) => /(\.mdx?$|docs?\/)/i.test(f));
  if (onlyDocs) return { type: "docs" };

  const onlyTests = files.every((f) => /(__tests__|\.test\.|\.spec\.|\btests?\b)/i.test(f));
  if (onlyTests) return { type: "test" };

  const mostlyStyles = exts.filter((e) => ["css", "scss", "sass", "less"].includes(e)).length >= Math.ceil(files.length / 2);
  if (mostlyStyles) return { type: "style" };

  const configTouched = files.some((f) => /(package(-lock)?\.json|tsconfig|eslint|prettier|vite|next\.config|postcss|bun\.lock)/i.test(f));
  if (configTouched) return { type: "chore" };

  const perfHints = files.some((f) => /perf|optimi[sz]e/i.test(f));
  if (perfHints) return { type: "perf" };

  const serverInfra = files.some((f) => /(docker|compose\.ya?ml|infra|deployment|ci|\.github)/i.test(f));
  if (serverInfra) return { type: "ci" };

  // Default to feature when source files are changed
  const sourceTouched = files.some((f) => /(src|app|lib|server|client|components|routes|pages)/i.test(f));
  if (sourceTouched) return { type: "feat" };

  return { type: "refactor" };
}

function formatSubject(type: string, scope: string | undefined, summary: string, maxLen: number, style: "conventional" | "plain") {
  let subject = style === "conventional" ? `${type}${scope ? `(${scope})` : ""}: ${summary}` : summary;
  if (subject.length > maxLen) {
    subject = subject.slice(0, maxLen - 1) + "…";
  }
  return subject;
}

async function generateCommitMessage({ rootDir, mode, convention, maxSubjectLength }: CommitMessageInput): Promise<SuggestedCommitMessage> {
  const git = simpleGit(rootDir);
  const summary = await git.diffSummary(mode === "staged" ? ["--cached"] : []);
  const files = summary.files.map((f) => f.file).filter((f) => !excludeFiles.includes(f));

  // Fallback: if no changes detected by diffSummary, try status to see if renamed/added only
  if (files.length === 0) {
    const status = await git.status();
    const candidates = new Set<string>();
    [...status.created, ...status.modified, ...status.renamed.map((r) => r.to), ...status.not_added, ...status.deleted].forEach((f) => {
      if (f && !excludeFiles.includes(f)) candidates.add(f);
    });
    files.push(...Array.from(candidates));
  }

  const uniqueTopScopes = Array.from(
    new Set(
      files
        .map((f) => f.split("/")[0])
        .filter((s) => s && !s.startsWith("."))
    )
  );
  const scope = uniqueTopScopes.length > 0 ? uniqueTopScopes.slice(0, 2).join(",") : undefined;
  const { type } = detectTypeFromFiles(files);

  // Make a terse summary from filenames
  const displayFiles = files.slice(0, 3).map((f) => f.split("/").slice(-2).join("/")).join(", ");
  const more = files.length > 3 ? ` and ${files.length - 3} more file${files.length - 3 === 1 ? "" : "s"}` : "";
  const summaryLine = files.length > 0 ? `update ${displayFiles}${more}` : "update repository";

  const subject = formatSubject(type, scope, summaryLine, maxSubjectLength, convention as any);

  const bodyLines: string[] = [];
  bodyLines.push("Changes:");
  for (const f of files) {
    // Keep body concise and avoid relying on diff summary numeric fields for broader type compatibility
    bodyLines.push(`- ${f}`);
  }
  const body = bodyLines.join("\n");

  return { subject, body, type, scope, files };
}

export const generateCommitMessageTool = tool({
  description: "Generate a suggested commit message (subject + body) from current git changes.",
  inputSchema: commitMessageInput,
  execute: generateCommitMessage,
});

// Write review to Markdown file tool
const writeReviewInput = z.object({
  outputDir: z.string().min(1).describe("Directory where the markdown file will be written"),
  filename: z
    .string()
    .min(1)
    .describe("Markdown filename. If it does not end with .md, it will be appended automatically."),
  content: z.string().min(1).describe("Markdown content to write"),
  overwrite: z.boolean().default(true).describe("Whether to overwrite the file if it already exists"),
});

type WriteReviewInput = z.infer<typeof writeReviewInput>;

async function writeReviewToMarkdown({ outputDir, filename, content, overwrite }: WriteReviewInput) {
  const safeName = filename.endsWith(".md") ? filename : `${filename}.md`;
  const filePath = resolve(outputDir, safeName);

  await mkdir(outputDir, { recursive: true });

  // If not overwriting, try to create exclusively; if exists, add a timestamp suffix
  try {
    await writeFile(filePath, content, { encoding: "utf8", flag: overwrite ? "w" : "wx" });
    return { path: filePath, bytes: Buffer.byteLength(content, "utf8"), overwritten: overwrite };
  } catch (err: any) {
    if (!overwrite && err && err.code === "EEXIST") {
      const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15);
      const alt = filePath.replace(/\.md$/i, `.${ts}.md`);
      await writeFile(alt, content, { encoding: "utf8", flag: "w" });
      return { path: alt, bytes: Buffer.byteLength(content, "utf8"), overwritten: false };
    }
    throw err;
  }
}

export const writeReviewToMarkdownTool = tool({
  description: "Write the provided review content to a markdown file on disk.",
  inputSchema: writeReviewInput,
  execute: writeReviewToMarkdown,
});