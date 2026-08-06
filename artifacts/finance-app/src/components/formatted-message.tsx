import { Fragment } from "react";

/**
 * Renders chat message text with light, safe formatting:
 * - **bold** segments
 * - "- item" / "• item" lines grouped into bullet lists
 * - "1. item" lines grouped into numbered lists
 * - blank-line-separated paragraphs get breathing room
 *
 * Deliberately not a full Markdown renderer (no external dependency, no
 * dangerouslySetInnerHTML) — just enough structure to turn the model's plain
 * prose into something readable, since it commonly returns lists (overdue
 * clients, report line items) and emphasis around key numbers.
 */

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter((p) => p !== "");
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>;
    }
    return <Fragment key={`${keyPrefix}-${i}`}>{part}</Fragment>;
  });
}

type Block =
  | { type: "bullets"; items: string[] }
  | { type: "numbered"; items: string[] }
  | { type: "paragraph"; text: string };

function parseBlocks(content: string): Block[] {
  const lines = content.split("\n");
  const blocks: Block[] = [];
  let paragraphBuf: string[] = [];

  const flushParagraph = () => {
    if (paragraphBuf.length > 0) {
      blocks.push({ type: "paragraph", text: paragraphBuf.join("\n") });
      paragraphBuf = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const bulletMatch = /^[-•]\s+(.*)/.exec(line);
    const numberedMatch = /^\d+[.)]\s+(.*)/.exec(line);

    if (bulletMatch) {
      flushParagraph();
      const last = blocks[blocks.length - 1];
      if (last && last.type === "bullets") last.items.push(bulletMatch[1]);
      else blocks.push({ type: "bullets", items: [bulletMatch[1]] });
    } else if (numberedMatch) {
      flushParagraph();
      const last = blocks[blocks.length - 1];
      if (last && last.type === "numbered") last.items.push(numberedMatch[1]);
      else blocks.push({ type: "numbered", items: [numberedMatch[1]] });
    } else if (line === "") {
      flushParagraph();
    } else {
      paragraphBuf.push(rawLine);
    }
  }
  flushParagraph();
  return blocks;
}

export function FormattedMessage({ content }: { content: string }) {
  const blocks = parseBlocks(content);

  return (
    <div className="space-y-2">
      {blocks.map((block, i) => {
        if (block.type === "bullets") {
          return (
            <ul key={i} className="list-disc ps-5 space-y-1 marker:text-primary">
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item, `${i}-${j}`)}</li>
              ))}
            </ul>
          );
        }
        if (block.type === "numbered") {
          return (
            <ol key={i} className="list-decimal ps-5 space-y-1 marker:text-primary marker:font-semibold">
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item, `${i}-${j}`)}</li>
              ))}
            </ol>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap">
            {renderInline(block.text, `${i}`)}
          </p>
        );
      })}
    </div>
  );
}
