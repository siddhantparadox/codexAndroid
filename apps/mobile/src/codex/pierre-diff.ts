export type PierreDiffLineKind = "context" | "add" | "delete";

export type PierreDiffLine = {
  kind: PierreDiffLineKind;
  oldLine: number | null;
  newLine: number | null;
  text: string;
};

export type PierreDiffHunk = {
  header: string;
  lines: PierreDiffLine[];
};

export type PierreDiffFile = {
  oldPath: string | null;
  newPath: string | null;
  displayPath: string;
  hunks: PierreDiffHunk[];
};

export type PierreDiffDocument = {
  files: PierreDiffFile[];
  totalAdded: number;
  totalDeleted: number;
  totalContext: number;
  truncated: boolean;
};

export type ParseUnifiedDiffOptions = {
  maxFiles?: number;
  maxLinesPerHunk?: number;
};

const DEFAULT_MAX_FILES = 6;
const DEFAULT_MAX_LINES_PER_HUNK = 120;

const parsePathToken = (line: string, marker: "--- " | "+++ "): string | null => {
  if (!line.startsWith(marker)) {
    return null;
  }

  const raw = line.slice(marker.length).trim();
  if (!raw || raw === "/dev/null") {
    return null;
  }

  if (raw.startsWith("a/") || raw.startsWith("b/")) {
    return raw.slice(2);
  }

  return raw;
};

const parseHunkStart = (header: string): { oldStart: number; newStart: number } | null => {
  const match = /^@@\s*-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s*@@/.exec(header);
  if (!match) {
    return null;
  }

  return {
    oldStart: Number(match[1]),
    newStart: Number(match[2])
  };
};

const displayPathFromDiffHeader = (line: string): string | null => {
  if (!line.startsWith("diff --git ")) {
    return null;
  }

  const parts = line.split(" ");
  if (parts.length < 4) {
    return null;
  }

  const nextPath = parts[3];
  if (!nextPath) {
    return null;
  }

  return nextPath.startsWith("b/") ? nextPath.slice(2) : nextPath;
};

const createFile = (displayPath: string): PierreDiffFile => ({
  oldPath: null,
  newPath: null,
  displayPath,
  hunks: []
});

export const parseUnifiedDiff = (
  unifiedDiff: string,
  options: ParseUnifiedDiffOptions = {}
): PierreDiffDocument => {
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const maxLinesPerHunk = options.maxLinesPerHunk ?? DEFAULT_MAX_LINES_PER_HUNK;

  const lines = unifiedDiff.split(/\r?\n/);
  const files: PierreDiffFile[] = [];
  let currentFile: PierreDiffFile | null = null;
  let currentHunk: PierreDiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  let totalAdded = 0;
  let totalDeleted = 0;
  let totalContext = 0;
  let truncated = false;

  const ensureFile = (fallbackPath = "untitled.patch"): PierreDiffFile | null => {
    if (currentFile) {
      return currentFile;
    }
    if (files.length >= maxFiles) {
      truncated = true;
      return null;
    }
    const file = createFile(fallbackPath);
    files.push(file);
    currentFile = file;
    return file;
  };

  for (const rawLine of lines) {
    const headerPath = displayPathFromDiffHeader(rawLine);
    if (headerPath) {
      currentHunk = null;
      if (files.length >= maxFiles) {
        truncated = true;
        currentFile = null;
        continue;
      }
      currentFile = createFile(headerPath);
      files.push(currentFile);
      continue;
    }

    const parsedOldPath = parsePathToken(rawLine, "--- ");
    if (parsedOldPath !== null) {
      const file = ensureFile(parsedOldPath);
      if (!file) {
        continue;
      }
      file.oldPath = parsedOldPath;
      if (!file.displayPath || file.displayPath === "untitled.patch") {
        file.displayPath = parsedOldPath;
      }
      currentHunk = null;
      continue;
    }

    const parsedNewPath = parsePathToken(rawLine, "+++ ");
    if (parsedNewPath !== null) {
      const file = ensureFile(parsedNewPath);
      if (!file) {
        continue;
      }
      file.newPath = parsedNewPath;
      file.displayPath = parsedNewPath;
      currentHunk = null;
      continue;
    }

    if (rawLine.startsWith("@@")) {
      const file = ensureFile();
      if (!file) {
        continue;
      }
      const start = parseHunkStart(rawLine);
      if (!start) {
        continue;
      }
      oldLine = start.oldStart;
      newLine = start.newStart;
      currentHunk = { header: rawLine, lines: [] };
      file.hunks.push(currentHunk);
      continue;
    }

    if (!currentHunk) {
      continue;
    }

    if (currentHunk.lines.length >= maxLinesPerHunk) {
      truncated = true;
      continue;
    }

    if (rawLine.startsWith("+") && !rawLine.startsWith("+++")) {
      currentHunk.lines.push({
        kind: "add",
        oldLine: null,
        newLine,
        text: rawLine.slice(1)
      });
      newLine += 1;
      totalAdded += 1;
      continue;
    }

    if (rawLine.startsWith("-") && !rawLine.startsWith("---")) {
      currentHunk.lines.push({
        kind: "delete",
        oldLine,
        newLine: null,
        text: rawLine.slice(1)
      });
      oldLine += 1;
      totalDeleted += 1;
      continue;
    }

    currentHunk.lines.push({
      kind: "context",
      oldLine,
      newLine,
      text: rawLine.startsWith(" ") ? rawLine.slice(1) : rawLine
    });
    oldLine += 1;
    newLine += 1;
    totalContext += 1;
  }

  for (const file of files) {
    if (!file.displayPath || file.displayPath === "untitled.patch") {
      file.displayPath = file.newPath ?? file.oldPath ?? "untitled.patch";
    }
  }

  return {
    files,
    totalAdded,
    totalDeleted,
    totalContext,
    truncated
  };
};
