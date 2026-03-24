import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import type { MatchRule } from "@/lib/pdf-interactions";
import { getMongoDb } from "@/lib/server/mongodb";

export type PdfAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type IndexRule = {
  id: string;
  match: MatchRule;
};

export type PdfIndexResult = {
  pageNumber: number;
  basePageWidth: number;
  basePageHeight: number;
  anchorsByRuleId: Record<string, PdfAnchor[]>;
};

type CachedIndex = {
  key: string;
  value: PdfIndexResult;
};

type MongoCacheDoc = {
  cacheKey: string;
  value: PdfIndexResult;
  updatedAt: Date;
  expiresAt: Date;
};

const indexCache = new Map<string, CachedIndex>();
const inFlight = new Map<string, Promise<PdfIndexResult>>();
const CACHE_COLLECTION = "pdf_index_cache";
const CACHE_TTL_HOURS = 24;
const MEMORY_CACHE_MAX_ITEMS = 500;
let mongoIndexesReady = false;

async function getMongoCollection() {
  const db = await getMongoDb();
  if (!db) {
    return null;
  }

  const collection = db.collection<MongoCacheDoc>(CACHE_COLLECTION);
  if (!mongoIndexesReady) {
    await collection.createIndex({ cacheKey: 1 }, { unique: true });
    await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    mongoIndexesReady = true;
  }

  return collection;
}

function normalizePublicPath(filePath: string): string {
  const relative = filePath.startsWith("/") ? filePath.slice(1) : filePath;
  const resolved = path.resolve(process.cwd(), "public", relative);
  const publicRoot = path.resolve(process.cwd(), "public");
  const rel = path.relative(publicRoot, resolved);

  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Invalid file path.");
  }

  return resolved;
}

function normalizePublicUrlPath(filePath: string): string {
  const relative = filePath.startsWith("/") ? filePath.slice(1) : filePath;
  const normalized = path.posix.normalize(relative.replaceAll("\\", "/"));
  if (normalized.startsWith("../") || normalized === ".." || normalized.length === 0) {
    throw new Error("Invalid file path.");
  }
  return `/${normalized}`;
}

async function loadPdfBytesFromStaticHost(filePath: string, baseUrl: string): Promise<Uint8Array> {
  const safePublicPath = normalizePublicUrlPath(filePath);
  const base = new URL(baseUrl);
  const url = new URL(safePublicPath, base);
  if (url.origin !== base.origin) {
    throw new Error("Invalid file path.");
  }

  const response = await fetch(url.toString(), { cache: "force-cache" });
  if (!response.ok) {
    throw new Error(`Failed to load PDF from static host (${response.status}).`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

function setMemoryCache(cacheKey: string, value: PdfIndexResult) {
  if (indexCache.has(cacheKey)) {
    indexCache.delete(cacheKey);
  }
  indexCache.set(cacheKey, { key: cacheKey, value });

  if (indexCache.size > MEMORY_CACHE_MAX_ITEMS) {
    const oldestKey = indexCache.keys().next().value as string | undefined;
    if (oldestKey) {
      indexCache.delete(oldestKey);
    }
  }
}

function isAsciiLetter(char: string | undefined): boolean {
  if (!char) {
    return false;
  }
  return (char >= "a" && char <= "z") || (char >= "A" && char <= "Z");
}

function findMatchIndices(source: string, target: string, wholeWord: boolean): number[] {
  const indices: number[] = [];
  if (!target) {
    return indices;
  }

  let from = 0;
  while (from < source.length) {
    const index = source.indexOf(target, from);
    if (index === -1) {
      break;
    }

    if (!wholeWord) {
      indices.push(index);
      from = index + target.length;
      continue;
    }

    const before = source[index - 1];
    const after = source[index + target.length];
    if (!isAsciiLetter(before) && !isAsciiLetter(after)) {
      indices.push(index);
    }

    from = index + target.length;
  }

  return indices;
}

function cacheKeyFor(filePath: string, pageNumber: number, rules: IndexRule[], sourceVersion: string): string {
  const rulesHash = createHash("sha1").update(JSON.stringify(rules)).digest("hex");
  return `${filePath}:${pageNumber}:${sourceVersion}:${rulesHash}`;
}

export async function buildPdfIndex(params: {
  filePath: string;
  pageNumber: number;
  rules: IndexRule[];
  baseUrl?: string;
}): Promise<PdfIndexResult> {
  const { filePath, pageNumber, rules, baseUrl } = params;

  if (!filePath) {
    throw new Error("filePath is required.");
  }
  if (rules.length === 0) {
    return {
      pageNumber,
      basePageWidth: 0,
      basePageHeight: 0,
      anchorsByRuleId: {},
    };
  }

  const absolutePath = normalizePublicPath(filePath);
  let cacheVersion = "0";
  let useFilesystem = false;
  try {
    const fileStat = await stat(absolutePath);
    cacheVersion = String(fileStat.mtimeMs);
    useFilesystem = true;
  } catch {
    // In serverless deployments, public assets may not be readable from local fs.
    // Fallback to static-host fetch if baseUrl is provided.
    if (!baseUrl) {
      throw new Error("PDF source is not available.");
    }
    cacheVersion = `static:${normalizePublicUrlPath(filePath)}`;
  }

  const cacheKey = cacheKeyFor(useFilesystem ? absolutePath : filePath, pageNumber, rules, cacheVersion);

  const cached = indexCache.get(cacheKey);
  if (cached) {
    setMemoryCache(cacheKey, cached.value);
    return cached.value;
  }

  const pending = inFlight.get(cacheKey);
  if (pending) {
    return pending;
  }

  const computePromise = (async () => {
    try {
      const collection = await getMongoCollection();
      if (collection) {
        const doc = await collection.findOne({ cacheKey });
        if (doc?.value) {
          setMemoryCache(cacheKey, doc.value);
          return doc.value;
        }
      }
    } catch {
      // Fall back to in-memory cache path when DB is unavailable.
    }

    const pdfData = useFilesystem
      ? new Uint8Array(await readFile(absolutePath))
      : await loadPdfBytesFromStaticHost(filePath, baseUrl as string);
    const pdfjsLib = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as {
      getDocument: (input: {
        data: Uint8Array;
        disableWorker: boolean;
        disableFontFace?: boolean;
        isEvalSupported?: boolean;
        useSystemFonts?: boolean;
      }) => {
        promise: Promise<{
          getPage: (n: number) => Promise<{
            getViewport: (params: { scale: number }) => { width: number; height: number; transform: number[] };
            getTextContent: () => Promise<{
              items: Array<{ str?: string; width?: number; height?: number; transform?: number[] }>;
            }>;
          }>;
          destroy: () => void | Promise<void>;
        }>;
        destroy: () => void;
      };
      Util: { transform: (a: number[], b: number[]) => number[] };
    };

    const loadingTask = pdfjsLib.getDocument({
      data: pdfData,
      disableWorker: true,
      disableFontFace: true,
      isEvalSupported: false,
      useSystemFonts: false,
    });

    try {
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent();

      const anchorsByRuleId: Record<string, PdfAnchor[]> = {};
      const foundFirstByRuleId = new Set<string>();
      for (const rule of rules) {
        anchorsByRuleId[rule.id] = [];
      }

      for (const item of textContent.items) {
        if (typeof item.str !== "string" || !Array.isArray(item.transform)) {
          continue;
        }

        const rawText = item.str;
        const lowerText = rawText.toLowerCase();
        const safeLength = Math.max(rawText.length, 1);
        const width = Math.max(item.width ?? 1, 1);

        const transform = pdfjsLib.Util.transform(baseViewport.transform, item.transform);
        const fontSize = Math.hypot(transform[2], transform[3]);
        const lineX = transform[4];
        const lineY = transform[5] - fontSize;
        const lineHeight = Math.max(fontSize, item.height ?? fontSize);

        for (const rule of rules) {
          if (rule.match.occurrence === "first" && foundFirstByRuleId.has(rule.id)) {
            continue;
          }

          const target = rule.match.text.toLowerCase();
          const indices = findMatchIndices(lowerText, target, Boolean(rule.match.wholeWord));
          if (indices.length === 0) {
            continue;
          }

          const matchedIndices = rule.match.occurrence === "first" ? [indices[0]] : indices;

          for (const startIndex of matchedIndices) {
            const startRatio = startIndex / safeLength;
            const endRatio = (startIndex + target.length) / safeLength;

            anchorsByRuleId[rule.id].push({
              x: lineX + width * startRatio,
              y: lineY,
              width: Math.max(width * (endRatio - startRatio), 1),
              height: lineHeight,
            });
          }

          if (rule.match.occurrence === "first") {
            foundFirstByRuleId.add(rule.id);
          }
        }
      }

      const result: PdfIndexResult = {
        pageNumber,
        basePageWidth: baseViewport.width,
        basePageHeight: baseViewport.height,
        anchorsByRuleId,
      };

      setMemoryCache(cacheKey, result);

      try {
        const collection = await getMongoCollection();
        if (collection) {
          const now = new Date();
          const expiresAt = new Date(now.getTime() + CACHE_TTL_HOURS * 60 * 60 * 1000);
          await collection.updateOne(
            { cacheKey },
            {
              $set: {
                cacheKey,
                value: result,
                updatedAt: now,
                expiresAt,
              },
            },
            { upsert: true },
          );
        }
      } catch {
        // Keep request successful even if DB write fails.
      }

      return result;
    } finally {
      loadingTask.destroy();
    }
  })();

  inFlight.set(cacheKey, computePromise);
  try {
    return await computePromise;
  } finally {
    inFlight.delete(cacheKey);
  }
}







