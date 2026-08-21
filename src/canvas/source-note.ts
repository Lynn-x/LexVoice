export type SemanticCanvasSourceDocument = {
  lexvoiceSemantic?: {
    sourcePath?: unknown;
  };
};

function normalizeVaultPath(value: unknown): string {
  return typeof value === "string"
    ? value.trim().replace(/\\/g, "/").replace(/^\/+/, "")
    : "";
}

export function inferSemanticCanvasSourcePath(canvasPath: unknown): string {
  const path = normalizeVaultPath(canvasPath);
  if (!/\.canvas$/i.test(path)) return "";
  const withoutExtension = path.replace(/\.canvas$/i, "");
  const sourceStem = withoutExtension
    .replace(/\s*·\s*语义图(?:（[^）]*）|\([^)]*\)|[-_ ]*\d+)?\s*$/i, "")
    .trim();
  return sourceStem && sourceStem !== withoutExtension ? `${sourceStem}.md` : "";
}

export function resolveSemanticCanvasSourcePath(
  documentValue: unknown,
  canvasPath: unknown = "",
): string {
  if (documentValue && typeof documentValue === "object") {
    const sourcePath = normalizeVaultPath(
      (documentValue as SemanticCanvasSourceDocument).lexvoiceSemantic?.sourcePath,
    );
    if (sourcePath) return sourcePath;
  }
  return inferSemanticCanvasSourcePath(canvasPath);
}

export function parseSemanticCanvasSourcePath(raw: unknown, canvasPath: unknown = ""): string {
  if (typeof raw !== "string" || !raw.trim()) return inferSemanticCanvasSourcePath(canvasPath);
  try {
    return resolveSemanticCanvasSourcePath(JSON.parse(raw), canvasPath);
  } catch {
    return inferSemanticCanvasSourcePath(canvasPath);
  }
}
