import { useMemo, useState, type ReactNode } from "react";
import type {
  NotesSupportMaterial,
  NotesTerm,
  NotesTopic,
  StructuredNotes,
} from "../../lib/types";
import { parseSummaryBlocks, type SummaryBlock } from "./summaryFormatting";

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
            ? "text-lg font-semibold text-[var(--accent-primary)]"
            : "text-base font-semibold text-[var(--text-primary)]"
        }
      >
        {renderInlineMarkdown(block.text)}
      </h3>
    );
  }

  if (block.type === "paragraph") {
    return (
      <p key={index} className="text-[var(--text-secondary)] leading-7">
        {renderInlineMarkdown(block.text)}
      </p>
    );
  }

  if (block.type === "unordered_list") {
    return (
      <ul key={index} className="space-y-2">
        {block.items.map((item, itemIndex) => (
          <li key={itemIndex} className="flex items-start gap-3">
            <span className="mt-2 flex-shrink-0 w-2 h-2 rounded-full bg-[var(--accent-primary)]" />
            <span className="text-[var(--text-secondary)] leading-7">{renderInlineMarkdown(item)}</span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ol key={index} className="space-y-3">
      {block.items.map((item, itemIndex) => (
        <li key={itemIndex} className="flex items-start gap-3">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--color-info-muted)] text-[var(--color-info)] text-sm font-semibold flex items-center justify-center">
            {itemIndex + 1}
          </span>
          <span className="text-[var(--text-secondary)] leading-7">{renderInlineMarkdown(item)}</span>
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
    <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)]/60 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-[var(--accent-primary-subtle)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--accent-primary)]">
          {supportMaterialLabel(kind)}
        </span>
        {material.language && (
          <span className="rounded-full bg-[var(--bg-surface-overlay)] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--text-muted)]">
            {material.language}
          </span>
        )}
      </div>

      <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>

      {isCode ? (
        <pre className="overflow-x-auto rounded-lg bg-[var(--bg-inset)] p-4 text-sm leading-6 text-[var(--text-primary)]">
          <code>{material.content}</code>
        </pre>
      ) : isFormula ? (
        <div className="overflow-x-auto rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-overlay)] px-4 py-3 font-mono text-sm leading-6 text-[var(--text-primary)]">
          {renderMultilineText(material.content)}
        </div>
      ) : (
        <div className="rounded-lg bg-[var(--bg-surface-overlay)] px-4 py-3 text-sm leading-7 text-[var(--text-secondary)] whitespace-pre-wrap">
          {renderMultilineText(material.content)}
        </div>
      )}
    </div>
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
        <span className="text-[var(--accent-primary)] text-lg leading-none select-none transition-transform group-hover:text-[var(--accent-primary)]">
          {open ? "▾" : "▸"}
        </span>
        <h2 className="text-xl font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-primary)] transition-colors leading-snug">
          {topic.heading}
        </h2>
      </button>

      {open && (
        <div className="mt-4 pl-5 border-l-2 border-[var(--border-default)] space-y-5">
          {/* Key Points */}
          {keyPoints.length > 0 && (
            <ul className="space-y-2">
              {keyPoints.map((point, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-2 flex-shrink-0 w-2 h-2 rounded-full bg-[var(--accent-primary)]" />
                  <span className="text-[var(--text-secondary)] leading-7">{point}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Details paragraph */}
          {topic.details && (
            <p className="text-[var(--text-secondary)] leading-7 text-[0.95rem]">{topic.details}</p>
          )}

          {/* Examples */}
          {examples.length > 0 && (
            <div className="space-y-2">
              {examples.map((ex, i) => (
                <div
                  key={i}
                  className="bg-[var(--color-info-muted)] border border-[var(--color-info-muted)] rounded-lg px-4 py-3"
                >
                  <p className="text-xs font-semibold text-[var(--accent-primary)] uppercase tracking-wider mb-1">
                    Example
                  </p>
                  <p className="text-[var(--text-secondary)] text-sm leading-relaxed">{ex}</p>
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
      <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">Key Terms</h2>
      <div className="overflow-hidden rounded-lg border border-[var(--border-default)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--bg-elevated)]/60">
              <th className="text-left px-4 py-2.5 text-[var(--text-secondary)] font-semibold w-1/3">
                Term
              </th>
              <th className="text-left px-4 py-2.5 text-[var(--text-secondary)] font-semibold">
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
                    ? "bg-[var(--bg-elevated)]"
                    : "bg-[var(--bg-elevated)]/20"
                }
              >
                <td className="px-4 py-2.5 font-medium text-[var(--accent-primary)] align-top">
                  {item.term}
                </td>
                <td className="px-4 py-2.5 text-[var(--text-secondary)] leading-relaxed">
                  {item.definition}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── Takeaways Box ────────────────────────────────────────────────────────────

function TakeawaysBox({ takeaways }: { takeaways: string[] }) {
  return (
    <section id="takeaways" className="mb-8">
      <div className="bg-[var(--color-warning-muted)] border border-[var(--color-warning-muted)] rounded-xl p-6">
        <h2 className="text-xl font-semibold text-[var(--color-warning)] mb-4">Key Takeaways</h2>
        <ol className="space-y-3">
          {takeaways.map((t, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--color-warning-muted)] text-[var(--color-warning)] text-sm font-bold flex items-center justify-center">
                {i + 1}
              </span>
              <span className="text-[var(--text-secondary)] leading-7">{t}</span>
            </li>
          ))}
        </ol>
      </div>
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
      <header className="border-b border-[var(--border-default)] pb-6 mb-8">
        <h1 className="text-3xl font-bold text-[var(--text-primary)] leading-tight">{notes.title}</h1>
      </header>

      {/* Summary Section */}
      {summaryBlocks.length > 0 && (
        <section id="summary" className="mb-8">
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">Summary</h2>
          <div className="rounded-xl border border-[var(--border-default)]/80 bg-[var(--bg-elevated)]/35 p-5 space-y-4">
            {summaryBlocks.map((block, index) => renderSummaryBlock(block, index))}
          </div>
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
