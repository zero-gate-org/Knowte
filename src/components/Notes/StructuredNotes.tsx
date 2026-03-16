import { useMemo, useState, type ReactNode } from "react";
import type {
  NotesSupportMaterial,
  NotesTerm,
  NotesTopic,
  StructuredNotes,
} from "../../lib/types";
import { parseSummaryBlocks, type SummaryBlock } from "./summaryFormatting";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function renderInlineMarkdown(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_)/g;
  let cursor = 0;
  let token = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      parts.push(text.slice(cursor, match.index));
    }

    const raw = match[0];
    const content = raw.slice(2, -2).trim();
    if (raw.startsWith("**") || raw.startsWith("__")) {
      parts.push(<strong key={`s-${token}`}>{content}</strong>);
    } else {
      const italicContent = raw.slice(1, -1).trim();
      parts.push(<em key={`e-${token}`}>{italicContent}</em>);
    }

    cursor = pattern.lastIndex;
    token += 1;
  }

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return parts.length > 0 ? parts : [text];
}

function renderSummaryBlock(block: SummaryBlock, index: number) {
  if (block.type === "heading") {
    return (
      <h3
        key={index}
        className={
          block.level === 2
            ? "text-lg font-semibold text-primary"
            : "text-base font-semibold text-foreground"
        }
      >
        {renderInlineMarkdown(block.text)}
      </h3>
    );
  }

  if (block.type === "paragraph") {
    return (
      <p key={index} className="text-foreground/90 leading-7">
        {renderInlineMarkdown(block.text)}
      </p>
    );
  }

  if (block.type === "unordered_list") {
    return (
      <ul key={index} className="space-y-2">
        {block.items.map((item, itemIndex) => (
          <li key={itemIndex} className="flex items-start gap-3">
            <span className="mt-2 flex-shrink-0 w-2 h-2 rounded-full bg-primary" />
            <span className="text-foreground/90 leading-7">{renderInlineMarkdown(item)}</span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ol key={index} className="space-y-3">
      {block.items.map((item, itemIndex) => (
        <li key={itemIndex} className="flex items-start gap-3">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-muted text-muted-foreground text-sm font-semibold flex items-center justify-center">
            {itemIndex + 1}
          </span>
          <span className="text-foreground/90 leading-7">{renderInlineMarkdown(item)}</span>
        </li>
      ))}
    </ol>
  );
}

function renderMultilineText(text: string) {
  return text.split("\n").map((line, index, list) => (
    <span key={`${line}-${index}`}>
      {renderInlineMarkdown(line)}
      {index < list.length - 1 ? <br /> : null}
    </span>
  ));
}

function supportMaterialLabel(kind: string) {
  switch (kind) {
    case "code":
      return "Code";
    case "formula":
      return "Formula";
    case "worked_example":
      return "Worked Example";
    case "timeline":
      return "Timeline";
    case "table":
      return "Table";
    case "diagram_notes":
      return "Diagram Notes";
    case "case_study":
      return "Case Study";
    default:
      return "Reference";
  }
}

function SupportMaterialCard({ material }: { material: NotesSupportMaterial }) {
  const kind = material.kind ?? "reference";
  const title = material.title?.trim() || supportMaterialLabel(kind);
  const isCode = kind === "code";
  const isFormula = kind === "formula";

  return (
    <Card className="shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em]">
            {supportMaterialLabel(kind)}
          </Badge>
          {material.language && (
            <Badge variant="outline" className="px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {material.language}
            </Badge>
          )}
        </div>

        <h3 className="text-sm font-semibold text-foreground">{title}</h3>

        {isCode ? (
          <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-sm leading-6 text-foreground">
            <code>{material.content}</code>
          </pre>
        ) : isFormula ? (
          <div className="overflow-x-auto rounded-lg border border-border bg-card px-4 py-3 font-mono text-sm leading-6 text-foreground">
            {renderMultilineText(material.content)}
          </div>
        ) : (
          <div className="rounded-lg bg-card px-4 py-3 text-sm leading-7 text-foreground/80 whitespace-pre-wrap">
            {renderMultilineText(material.content)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Collapsible Topic Section ────────────────────────────────────────────────

interface CollapsibleTopicProps {
  topic: NotesTopic;
  topicIndex: number;
}

function CollapsibleTopic({ topic, topicIndex }: CollapsibleTopicProps) {
  const [open, setOpen] = useState(true);
  const id = `topic-${topicIndex}`;

  // Guard against LLM omitting optional arrays
  const keyPoints = topic.key_points ?? [];
  const examples = topic.examples ?? [];
  const supportMaterials = topic.support_materials ?? [];

  return (
    <section id={id} className="mb-8">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full text-left group mb-1"
        aria-expanded={open}
      >
        <span className="text-primary text-lg leading-none select-none transition-transform group-hover:text-primary">
          {open ? "▾" : "▸"}
        </span>
        <h2 className="text-xl font-semibold text-foreground group-hover:text-primary transition-colors leading-snug">
          {topic.heading}
        </h2>
      </button>

      {open && (
        <div className="mt-4 pl-5 border-l-2 border-border space-y-5">
          {/* Key Points */}
          {keyPoints.length > 0 && (
            <ul className="space-y-2">
              {keyPoints.map((point, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-2 flex-shrink-0 w-2 h-2 rounded-full bg-primary" />
                  <span className="text-foreground/90 leading-7">{point}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Details paragraph */}
          {topic.details && (
            <p className="text-foreground/80 leading-7 text-[0.95rem]">{topic.details}</p>
          )}

          {/* Examples */}
          {examples.length > 0 && (
            <div className="space-y-2">
              {examples.map((ex, i) => (
                <div
                  key={i}
                  className="bg-muted border border-border rounded-xl px-5 py-4"
                >
                  <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-2 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground"></span>
                    Example
                  </p>
                  <p className="text-foreground/90 text-[0.95rem] leading-relaxed">{ex}</p>
                </div>
              ))}
            </div>
          )}

          {supportMaterials.length > 0 && (
            <div className="space-y-3">
              {supportMaterials.map((material, i) => (
                <SupportMaterialCard key={`${material.kind}-${material.title}-${i}`} material={material} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ─── Key Terms Table ──────────────────────────────────────────────────────────

function KeyTermsTable({ terms }: { terms: NotesTerm[] }) {
  return (
    <section id="key-terms" className="mb-8">
      <h2 className="text-xl font-semibold text-foreground mb-5">Key Terms</h2>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              <th className="text-left px-5 py-3.5 text-muted-foreground font-semibold w-1/3 text-xs uppercase tracking-wider">
                Term
              </th>
              <th className="text-left px-5 py-3.5 text-muted-foreground font-semibold text-xs uppercase tracking-wider">
                Definition
              </th>
            </tr>
          </thead>
          <tbody>
            {terms.map((item, i) => (
              <tr
                key={i}
                className={
                  i % 2 === 0
                    ? "bg-transparent hover:bg-muted/50 transition-colors"
                    : "bg-muted/30 hover:bg-muted/50 transition-colors"
                }
              >
                <td className="px-5 py-4 font-semibold text-primary align-top border-t border-border/50">
                  {item.term}
                </td>
                <td className="px-5 py-4 text-foreground/90 leading-loose border-t border-border/50">
                  {item.definition}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </section>
  );
}

// ─── Takeaways Box ────────────────────────────────────────────────────────────

function TakeawaysBox({ takeaways }: { takeaways: string[] }) {
  return (
    <section id="takeaways" className="mb-8">
      <Card className="bg-muted border-border p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-foreground mb-4">Key Takeaways</h2>
        <ol className="space-y-3">
          {takeaways.map((t, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-background border border-border text-foreground text-sm font-bold flex items-center justify-center shadow-sm">
                {i + 1}
              </span>
              <span className="text-foreground/90 leading-7">{t}</span>
            </li>
          ))}
        </ol>
      </Card>
    </section>
  );
}

// ─── Main StructuredNotes Component ──────────────────────────────────────────

export interface StructuredNotesProps {
  notes: StructuredNotes;
  summary?: string;
}

export function StructuredNotesView({ notes, summary }: StructuredNotesProps) {
  // Guard against LLM omitting top-level arrays
  const topics = notes.topics ?? [];
  const keyTerms = notes.key_terms ?? [];
  const takeaways = notes.takeaways ?? [];
  const summaryBlocks = useMemo(() => parseSummaryBlocks(summary), [summary]);

  return (
    <article className="space-y-2">
      {/* Document Title */}
      <header className="border-b border-border pb-6 mb-8">
        <h1 className="text-3xl font-bold text-foreground leading-tight">{notes.title}</h1>
      </header>

      {/* Summary Section */}
      {summaryBlocks.length > 0 && (
        <section id="summary" className="mb-8">
          <h2 className="text-xl font-semibold text-foreground mb-3">Summary</h2>
          <Card className="p-5 space-y-4">
            {summaryBlocks.map((block, index) => renderSummaryBlock(block, index))}
          </Card>
        </section>
      )}

      {/* Topics */}
      {topics.map((topic, i) => (
        <CollapsibleTopic key={i} topic={topic} topicIndex={i} />
      ))}

      {/* Key Terms */}
      {keyTerms.length > 0 && <KeyTermsTable terms={keyTerms} />}

      {/* Takeaways */}
      {takeaways.length > 0 && <TakeawaysBox takeaways={takeaways} />}
    </article>
  );
}
