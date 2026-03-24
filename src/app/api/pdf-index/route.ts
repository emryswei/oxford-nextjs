import { NextResponse } from "next/server";

import type { MatchRule } from "@/lib/pdf-interactions";
import { buildPdfIndex } from "@/lib/server/pdf-indexer";

export const runtime = "nodejs";
const MAX_RULES = 100;
const MAX_RULE_ID_LENGTH = 128;
const MAX_MATCH_TEXT_LENGTH = 64;

type RequestBody = {
  filePath?: string;
  pageNumber?: number;
  rules?: Array<{
    id: string;
    match: MatchRule;
  }>;
};

function isValidMatchRule(value: unknown): value is MatchRule {
  if (!value || typeof value !== "object") {
    return false;
  }
  const rule = value as Partial<MatchRule>;
  const validOccurrence = rule.occurrence === "first" || rule.occurrence === "all";
  const validWholeWord = rule.wholeWord === undefined || typeof rule.wholeWord === "boolean";
  return (
    typeof rule.text === "string" &&
    rule.text.trim().length > 0 &&
    rule.text.length <= MAX_MATCH_TEXT_LENGTH &&
    validOccurrence &&
    validWholeWord
  );
}

function validateRequestBody(body: RequestBody): { ok: true } | { ok: false; error: string } {
  if (!body.filePath || typeof body.filePath !== "string") {
    return { ok: false, error: "filePath is required." };
  }
  if (
    body.pageNumber !== undefined &&
    (!Number.isInteger(body.pageNumber) || body.pageNumber < 1)
  ) {
    return { ok: false, error: "pageNumber must be an integer >= 1." };
  }
  if (!Array.isArray(body.rules) || body.rules.length === 0) {
    return { ok: false, error: "rules must be a non-empty array." };
  }
  if (body.rules.length > MAX_RULES) {
    return { ok: false, error: `rules cannot exceed ${MAX_RULES} items.` };
  }

  const seenRuleIds = new Set<string>();
  for (const rule of body.rules) {
    if (!rule || typeof rule !== "object") {
      return { ok: false, error: "Each rule must be an object." };
    }
    if (
      typeof rule.id !== "string" ||
      rule.id.trim().length === 0 ||
      rule.id.length > MAX_RULE_ID_LENGTH
    ) {
      return { ok: false, error: "Each rule.id must be a non-empty string." };
    }
    if (seenRuleIds.has(rule.id)) {
      return { ok: false, error: `Duplicate rule.id '${rule.id}' is not allowed.` };
    }
    seenRuleIds.add(rule.id);
    if (!isValidMatchRule(rule.match)) {
      return { ok: false, error: `Invalid match rule for id '${rule.id}'.` };
    }
  }
  return { ok: true };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const validation = validateRequestBody(body);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const filePath = body.filePath as string;
    const pageNumber = body.pageNumber ?? 1;
    const rules = body.rules as Array<{ id: string; match: MatchRule }>;

    const result = await buildPdfIndex({
      filePath,
      pageNumber,
      rules,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("pdf-index route failed", error);
    return NextResponse.json({ error: "Failed to index PDF." }, { status: 500 });
  }
}
