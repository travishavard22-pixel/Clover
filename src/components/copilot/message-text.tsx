import { Fragment } from "react";
import { AiBadge } from "@/components/ui/badge";

const ESTIMATE_TOKEN = /\((?:estimate|AI estimate)\)/g;

/** Inline: **bold** and "(estimate)" markers become an AiBadge so estimates never read as facts. */
function renderInline(text: string, keyPrefix: string) {
  const out: React.ReactNode[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  parts.forEach((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      out.push(<strong key={`${keyPrefix}-b${i}`}>{part.slice(2, -2)}</strong>);
      return;
    }
    let last = 0;
    for (const m of part.matchAll(ESTIMATE_TOKEN)) {
      const idx = m.index ?? 0;
      if (idx > last) out.push(<Fragment key={`${keyPrefix}-t${i}-${idx}`}>{part.slice(last, idx)}</Fragment>);
      out.push(<AiBadge key={`${keyPrefix}-e${i}-${idx}`} label="estimate" className="mx-0.5 h-5 align-middle text-[11px]" />);
      last = idx + m[0].length;
    }
    if (last < part.length) out.push(<Fragment key={`${keyPrefix}-r${i}`}>{part.slice(last)}</Fragment>);
  });
  return out;
}

/** Minimal, safe rendering of the copilot's plain-text answers: paragraphs, "- " lists, bold, estimate marks. */
export function MessageText({ text, className }: { text: string; className?: string }) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return (
    <div className={className}>
      {blocks.map((block, bi) => {
        const lines = block.split("\n").filter((l) => l.trim().length > 0);
        if (lines.length === 0) return null;
        const isList = lines.every((l) => /^\s*[-•]\s+/.test(l));
        if (isList) {
          return (
            <ul key={bi} className="my-2 list-disc space-y-1 pl-5 first:mt-0 last:mb-0">
              {lines.map((l, li) => (
                <li key={li}>{renderInline(l.replace(/^\s*[-•]\s+/, ""), `${bi}-${li}`)}</li>
              ))}
            </ul>
          );
        }
        const heading = lines.length > 1 && /:$/.test(lines[0]!.trim());
        return (
          <p key={bi} className="my-2 whitespace-pre-wrap first:mt-0 last:mb-0">
            {lines.map((l, li) => (
              <Fragment key={li}>
                {li > 0 && <br />}
                {heading && li === 0 ? <span className="font-medium text-primary">{renderInline(l, `${bi}-${li}`)}</span> : renderInline(l, `${bi}-${li}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
