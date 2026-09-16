/**
 * Word-level diff for the listing tool review. LCS over word tokens (whitespace preserved on the
 * token) so the rendered diff reads as prose with insertions and deletions marked inline.
 */

export type DiffOp = { kind: "equal" | "insert" | "delete"; text: string };

function tokens(text: string): string[] {
  return text.match(/\S+\s*|\s+/g) ?? [];
}

export function diffWords(before: string, after: string): DiffOp[] {
  const a = tokens(before);
  const b = tokens(after);
  if (a.length === 0 && b.length === 0) return [];
  const n = a.length;
  const m = b.length;
  // Guard pathological sizes: fall back to a whole-replacement diff.
  if (n * m > 4_000_000) return [...(n ? [{ kind: "delete" as const, text: before }] : []), ...(m ? [{ kind: "insert" as const, text: after }] : [])];

  const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = a[i]!.trim() === b[j]!.trim() ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const ops: DiffOp[] = [];
  const push = (kind: DiffOp["kind"], text: string) => {
    const last = ops[ops.length - 1];
    if (last && last.kind === kind) last.text += text;
    else ops.push({ kind, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i]!.trim() === b[j]!.trim()) {
      push("equal", b[j]!);
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      push("delete", a[i]!);
      i++;
    } else {
      push("insert", b[j]!);
      j++;
    }
  }
  while (i < n) push("delete", a[i++]!);
  while (j < m) push("insert", b[j++]!);
  return ops;
}

export type DiffSummary = { inserted: number; deleted: number; changed: boolean };

export function summarizeDiff(ops: DiffOp[]): DiffSummary {
  let inserted = 0;
  let deleted = 0;
  for (const op of ops) {
    const words = op.text.trim() ? op.text.trim().split(/\s+/).length : 0;
    if (op.kind === "insert") inserted += words;
    if (op.kind === "delete") deleted += words;
  }
  return { inserted, deleted, changed: inserted + deleted > 0 };
}

/** Diffs two string lists as ordered lines (bullets, keywords). */
export function diffLines(before: string[], after: string[]): DiffOp[] {
  return diffWords(before.join("\n"), after.join("\n")).map((op) => ({ ...op }));
}
