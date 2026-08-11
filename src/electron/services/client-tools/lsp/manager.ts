import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";

import * as ts from "typescript-lsp";

export type Diagnostic = {
  severity?: number;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  message: string;
  code?: number;
  source?: string;
};

export type LspLocation = {
  filePath: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  preview: string;
};

export type LspTextEditResult = {
  text: string;
  edits: number;
};

type ProjectState = {
  key: string;
  root: string;
  configPath?: string;
  options: ts.CompilerOptions;
  rootFiles: Set<string>;
  extraFiles: Set<string>;
  manualVersions: Map<string, number>;
  observedVersions: Map<string, string>;
  service: ts.LanguageService;
  projectVersion: number;
  lastUsed: number;
};

const SUPPORTED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"]);
const MAX_PROJECTS = 8;
const projects = new Map<string, ProjectState>();
const diagnosticsByFile = new Map<string, Diagnostic[]>();

function normalizePath(filePath: string): string {
  return resolve(filePath);
}

function isSupportedFile(filePath: string): boolean {
  return SUPPORTED_EXTENSIONS.has(extname(filePath).toLowerCase());
}

function fileVersion(project: ProjectState, filePath: string): string {
  try {
    const info = statSync(filePath);
    return `${info.mtimeMs}:${info.size}:${project.manualVersions.get(filePath) ?? 0}`;
  } catch {
    return `missing:${project.manualVersions.get(filePath) ?? 0}`;
  }
}

function parseProject(configPath: string): { root: string; options: ts.CompilerOptions; files: string[] } {
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) {
    throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
  }
  const root = dirname(configPath);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, configPath);
  return { root, options: parsed.options, files: parsed.fileNames.map(normalizePath) };
}

function createProject(key: string, configPath: string | undefined, seedPath: string): ProjectState {
  const parsed = configPath
    ? parseProject(configPath)
    : {
        root: existsSync(seedPath) && statSync(seedPath).isDirectory() ? seedPath : dirname(seedPath),
        options: {
          allowJs: true,
          checkJs: false,
          jsx: ts.JsxEmit.Preserve,
          module: ts.ModuleKind.ESNext,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
          target: ts.ScriptTarget.ESNext,
        } satisfies ts.CompilerOptions,
        files: isSupportedFile(seedPath) ? [seedPath] : [],
      };

  const project: ProjectState = {
    key,
    root: parsed.root,
    configPath,
    options: parsed.options,
    rootFiles: new Set(parsed.files),
    extraFiles: new Set(),
    manualVersions: new Map(),
    observedVersions: new Map(),
    service: undefined as unknown as ts.LanguageService,
    projectVersion: 0,
    lastUsed: Date.now(),
  };
  const host: ts.LanguageServiceHost = {
    getCompilationSettings: () => project.options,
    getScriptFileNames: () => [...project.rootFiles, ...project.extraFiles],
    getScriptVersion: (fileName) => fileVersion(project, normalizePath(fileName)),
    getScriptSnapshot: (fileName) => {
      try {
        return ts.ScriptSnapshot.fromString(readFileSync(fileName, "utf8"));
      } catch {
        return undefined;
      }
    },
    getCurrentDirectory: () => project.root,
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    getProjectVersion: () => String(project.projectVersion),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
    realpath: ts.sys.realpath,
    useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
    getNewLine: () => ts.sys.newLine,
  };

  project.service = ts.createLanguageService(host, ts.createDocumentRegistry());
  return project;
}

function evictOldProjects(): void {
  if (projects.size <= MAX_PROJECTS) return;
  const oldest = [...projects.values()].sort((left, right) => left.lastUsed - right.lastUsed)[0];
  if (!oldest) return;
  oldest.service.dispose();
  projects.delete(oldest.key);
}

function findProjectConfig(startPath: string): string | undefined {
  const startDirectory = existsSync(startPath) && statSync(startPath).isDirectory() ? startPath : dirname(startPath);
  return ts.findConfigFile(startDirectory, ts.sys.fileExists, "tsconfig.json");
}

function getProject(startPath: string): ProjectState {
  const normalized = normalizePath(startPath);
  const configPath = findProjectConfig(normalized);
  const key = configPath ? normalizePath(configPath) : `inferred:${existsSync(normalized) && statSync(normalized).isDirectory() ? normalized : dirname(normalized)}`;
  let project = projects.get(key);
  if (!project) {
    project = createProject(key, configPath, normalized);
    projects.set(key, project);
    evictOldProjects();
  }
  project.lastUsed = Date.now();
  return project;
}

function refreshConfiguredFiles(project: ProjectState): void {
  if (!project.configPath) return;
  const parsed = parseProject(project.configPath);
  let changed = false;
  for (const file of parsed.files) {
    if (!project.rootFiles.has(file)) {
      project.rootFiles.add(file);
      changed = true;
    }
  }
  if (changed) project.projectVersion += 1;
}

function diagnosticSeverity(category: ts.DiagnosticCategory): number {
  if (category === ts.DiagnosticCategory.Error) return 1;
  if (category === ts.DiagnosticCategory.Warning) return 2;
  if (category === ts.DiagnosticCategory.Suggestion) return 4;
  return 3;
}

function convertDiagnostic(diagnostic: ts.Diagnostic): Diagnostic | null {
  if (!diagnostic.file || diagnostic.start === undefined) return null;
  const start = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  const end = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start + (diagnostic.length ?? 0));
  return {
    severity: diagnosticSeverity(diagnostic.category),
    range: { start, end },
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    code: diagnostic.code,
    source: "typescript",
  };
}

function spanToLocation(filePath: string, span: ts.TextSpan): LspLocation | null {
  try {
    const text = readFileSync(filePath, "utf8");
    const source = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, false);
    const start = source.getLineAndCharacterOfPosition(span.start);
    const end = source.getLineAndCharacterOfPosition(span.start + span.length);
    return {
      filePath: normalizePath(filePath),
      line: start.line + 1,
      column: start.character + 1,
      endLine: end.line + 1,
      endColumn: end.character + 1,
      preview: text.split(/\r?\n/)[start.line]?.trim().slice(0, 300) ?? "",
    };
  } catch {
    return null;
  }
}

function symbolPositions(text: string, symbol: string): number[] {
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`\\b${escaped}\\b`, "g");
  const positions: number[] = [];
  for (let match = pattern.exec(text); match && positions.length < 20; match = pattern.exec(text)) {
    positions.push(match.index);
  }
  return positions;
}

function projectSourceFiles(project: ProjectState, searchPath: string): ts.SourceFile[] {
  const normalizedSearch = normalizePath(searchPath);
  const searchIsDirectory = existsSync(normalizedSearch) && statSync(normalizedSearch).isDirectory();
  return (project.service.getProgram()?.getSourceFiles() ?? []).filter((source) => {
    const filePath = normalizePath(source.fileName);
    if (source.isDeclarationFile || filePath.split(/[\\/]/).includes("node_modules")) return false;
    if (!searchIsDirectory) return filePath === normalizedSearch;
    const scopedPath = relative(normalizedSearch, filePath);
    return scopedPath === "" || (!scopedPath.startsWith("..") && !isAbsolute(scopedPath));
  });
}

function uniqueLocations(locations: LspLocation[], limit: number): LspLocation[] {
  const seen = new Set<string>();
  const result: LspLocation[] = [];
  for (const location of locations) {
    const key = `${location.filePath}:${location.line}:${location.column}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(location);
    if (result.length >= limit) break;
  }
  return result;
}

function applyTextChanges(text: string, changes: readonly ts.TextChange[]): LspTextEditResult {
  const sorted = [...changes].sort((left, right) => right.span.start - left.span.start);
  let updated = text;
  let previousStart = text.length;
  for (const change of sorted) {
    const start = change.span.start;
    const end = start + change.span.length;
    if (start < 0 || end > previousStart || end > updated.length) {
      throw new Error("Language service returned overlapping or out-of-range text edits");
    }
    updated = `${updated.slice(0, start)}${change.newText}${updated.slice(end)}`;
    previousStart = start;
  }
  return { text: updated, edits: sorted.length };
}

function formatSettings(text: string): ts.FormatCodeSettings {
  return {
    ...ts.getDefaultFormatCodeSettings(text.includes("\r\n") ? "\r\n" : "\n"),
    indentSize: 2,
    tabSize: 2,
    convertTabsToSpaces: true,
    semicolons: ts.SemicolonPreference.Insert,
  };
}

export const lspManager = {
  async touchFile(filePath: string, force: boolean): Promise<void> {
    const normalized = normalizePath(filePath);
    if (!isSupportedFile(normalized) || !existsSync(normalized)) {
      diagnosticsByFile.set(normalized, []);
      return;
    }
    const project = getProject(normalized);
    if (!project.rootFiles.has(normalized) && !project.extraFiles.has(normalized)) {
      project.extraFiles.add(normalized);
      project.projectVersion += 1;
    }
    const previousVersion = project.observedVersions.get(normalized);
    if (force) project.manualVersions.set(normalized, (project.manualVersions.get(normalized) ?? 0) + 1);
    const currentVersion = fileVersion(project, normalized);
    if (force || previousVersion !== currentVersion) {
      project.observedVersions.set(normalized, currentVersion);
      project.projectVersion += 1;
    }
    const diagnostics = [
      ...project.service.getSyntacticDiagnostics(normalized),
      ...project.service.getSemanticDiagnostics(normalized),
    ].map(convertDiagnostic).filter((item): item is Diagnostic => item !== null);
    diagnosticsByFile.set(normalized, diagnostics);
  },

  getDiagnostics(filePath: string): Diagnostic[] {
    return diagnosticsByFile.get(normalizePath(filePath)) ?? [];
  },

  async formatFile(filePath: string): Promise<LspTextEditResult> {
    const normalized = normalizePath(filePath);
    if (!isSupportedFile(normalized)) throw new Error("TypeScript formatting supports only JavaScript and TypeScript files");
    if (!existsSync(normalized) || !statSync(normalized).isFile()) throw new Error("File does not exist");
    await this.touchFile(normalized, true);
    const project = getProject(normalized);
    const text = readFileSync(normalized, "utf8");
    const changes = project.service.getFormattingEditsForDocument(normalized, formatSettings(text));
    return applyTextChanges(text, changes);
  },

  async organizeImports(
    filePath: string,
    mode: "all" | "sort-and-combine" | "remove-unused" = "all",
  ): Promise<LspTextEditResult> {
    const normalized = normalizePath(filePath);
    if (!isSupportedFile(normalized)) throw new Error("Import organization supports only JavaScript and TypeScript files");
    if (!existsSync(normalized) || !statSync(normalized).isFile()) throw new Error("File does not exist");
    await this.touchFile(normalized, true);
    const project = getProject(normalized);
    const text = readFileSync(normalized, "utf8");
    const organizeMode = mode === "sort-and-combine"
      ? ts.OrganizeImportsMode.SortAndCombine
      : mode === "remove-unused"
        ? ts.OrganizeImportsMode.RemoveUnused
        : ts.OrganizeImportsMode.All;
    const changes = project.service.organizeImports(
      { type: "file", fileName: normalized, mode: organizeMode },
      formatSettings(text),
      undefined,
    );
    const fileChanges = changes.find((change) => normalizePath(change.fileName) === normalized)?.textChanges ?? [];
    return applyTextChanges(text, fileChanges);
  },

  async findDefinitions(symbol: string, searchPath: string, limit = 50): Promise<LspLocation[]> {
    return this.findSymbolLocations("definition", symbol, searchPath, limit);
  },

  async findReferences(symbol: string, searchPath: string, limit = 100): Promise<LspLocation[]> {
    return this.findSymbolLocations("references", symbol, searchPath, limit);
  },

  async findSymbolLocations(kind: "definition" | "references", symbol: string, searchPath: string, limit: number): Promise<LspLocation[]> {
    if (!symbol.trim()) return [];
    const normalizedSearch = normalizePath(searchPath);
    const project = getProject(normalizedSearch);
    refreshConfiguredFiles(project);
    project.projectVersion += 1;
    const locations: LspLocation[] = [];
    const sources = projectSourceFiles(project, normalizedSearch);

    for (const source of sources) {
      for (const position of symbolPositions(source.text, symbol)) {
        if (kind === "definition") {
          for (const definition of project.service.getDefinitionAtPosition(source.fileName, position) ?? []) {
            const location = spanToLocation(definition.fileName, definition.textSpan);
            if (location) locations.push(location);
          }
        } else {
          for (const group of project.service.findReferences(source.fileName, position) ?? []) {
            for (const reference of group.references) {
              const location = spanToLocation(reference.fileName, reference.textSpan);
              if (location) locations.push(location);
            }
          }
        }
        if (locations.length >= limit) return uniqueLocations(locations, limit);
      }
    }
    return uniqueLocations(locations, limit);
  },

  dispose(): void {
    for (const project of projects.values()) project.service.dispose();
    projects.clear();
    diagnosticsByFile.clear();
  },
};
