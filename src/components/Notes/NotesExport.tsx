import { useState } from "react";
import type { StructuredNotes } from "../../lib/types";
import { exportNotesMarkdown } from "../../lib/tauriApi";
import { useToastStore } from "../../stores";

// ─── HTML for Print / PDF ─────────────────────────────────────────────────────

function escape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Returns only the body content (no <html>/<head>/<body> wrappers). */
function buildPrintBodyHtml(notes: StructuredNotes, summary?: string): string {
  const topics = notes.topics ?? [];
  const keyTerms = notes.key_terms ?? [];
  const takeaways = notes.takeaways ?? [];

  let html = `<h1>${escape(notes.title)}</h1>\n`;

  if (summary) {
    html += `<h2>Summary</h2>\n<p>${escape(summary)}</p>\n`;
  }

  for (const topic of topics) {
    html += `<h2>${escape(topic.heading)}</h2>\n`;

    const keyPoints = topic.key_points ?? [];
    if (keyPoints.length > 0) {
      html += `<h3>Key Points</h3>\n<ul>\n`;
      for (const p of keyPoints) html += `  <li>${escape(p)}</li>\n`;
      html += `</ul>\n`;
    }

    if (topic.details) {
      html += `<p>${escape(topic.details)}</p>\n`;
    }

    const examples = topic.examples ?? [];
    if (examples.length > 0) {
      for (const ex of examples) {
        html += `<blockquote><strong>Example:</strong> ${escape(ex)}</blockquote>\n`;
      }
    }
  }

  if (keyTerms.length > 0) {
    html += `<h2>Key Terms</h2>\n`;
    html += `<table>\n<thead><tr><th>Term</th><th>Definition</th></tr></thead>\n<tbody>\n`;
    for (const item of keyTerms) {
      html += `  <tr><td><strong>${escape(item.term)}</strong></td><td>${escape(item.definition)}</td></tr>\n`;
    }
    html += `</tbody></table>\n`;
  }

  if (takeaways.length > 0) {
    html += `<h2>Key Takeaways</h2>\n<ol class="__print-takeaways">\n`;
    for (const t of takeaways) html += `  <li>${escape(t)}</li>\n`;
    html += `</ol>\n`;
  }

  return html;
}

const PRINT_CSS = `
  @media print {
    body > *:not(#__notes-print-portal__) { display: none !important; }
    #__notes-print-portal__ { display: block !important; }
  }
  #__notes-print-portal__ { display: none; }
  @media print {
    #__notes-print-portal__ {
      font-family: Georgia, "Times New Roman", serif;
      font-size: 14px;
      color: #111;
      background: #fff;
      line-height: 1.7;
      padding: 0;
      max-width: 100%;
    }
    #__notes-print-portal__ h1 {
      font-size: 22pt;
      font-weight: 800;
      margin-bottom: 0.5em;
      padding-bottom: 0.3em;
      border-bottom: 2pt solid #6d28d9;
      color: #1e1b4b;
    }
    #__notes-print-portal__ h2 {
      font-size: 15pt;
      font-weight: 700;
      margin-top: 1.6em;
      margin-bottom: 0.5em;
      padding-bottom: 0.2em;
      border-bottom: 0.5pt solid #bbb;
      color: #1e1b4b;
      page-break-after: avoid;
    }
    #__notes-print-portal__ h3 {
      font-size: 12pt;
      font-weight: 700;
      margin-top: 1em;
      margin-bottom: 0.3em;
      color: #374151;
      page-break-after: avoid;
    }
    #__notes-print-portal__ p { margin-bottom: 0.6em; color: #374151; }
    #__notes-print-portal__ ul,
    #__notes-print-portal__ ol { padding-left: 1.4em; margin-bottom: 0.6em; }
    #__notes-print-portal__ li { margin-bottom: 0.25em; }
    #__notes-print-portal__ blockquote {
      border-left: 3pt solid #7c3aed;
      margin: 0.6em 0;
      padding: 0.4em 0.8em;
      background: #f5f3ff;
      color: #4b5563;
      font-style: italic;
      page-break-inside: avoid;
    }
    #__notes-print-portal__ table {
      border-collapse: collapse;
      width: 100%;
      margin: 0.8em 0;
      font-size: 10pt;
      page-break-inside: avoid;
    }
    #__notes-print-portal__ th,
    #__notes-print-portal__ td {
      border: 0.5pt solid #d1d5db;
      padding: 0.4em 0.6em;
      text-align: left;
      vertical-align: top;
    }
    #__notes-print-portal__ th {
      background: #f3f4f6;
      font-weight: 700;
      color: #111;
    }
    #__notes-print-portal__ tr:nth-child(even) td { background: #f9fafb; }
    #__notes-print-portal__ .__print-takeaways { list-style: decimal; }
    #__notes-print-portal__ .__print-takeaways li { margin-bottom: 0.4em; }
  }
`;

// ─── Markdown Conversion ──────────────────────────────────────────────────────

function notesToMarkdown(notes: StructuredNotes, summary?: string): string {
  const lines: string[] = [];

  lines.push(`# ${notes.title}`, "");

  if (summary) {
    lines.push("## Summary", "", summary, "");
  }

  for (const topic of notes.topics ?? []) {
    lines.push(`## ${topic.heading}`, "");

    const keyPoints = topic.key_points ?? [];
    if (keyPoints.length > 0) {
      lines.push("### Key Points", "");
      for (const p of keyPoints) {
        lines.push(`- ${p}`);
      }
      lines.push("");
    }

    if (topic.details) {
      lines.push(topic.details, "");
    }

    const examples = topic.examples ?? [];
    if (examples.length > 0) {
      lines.push("### Examples", "");
      for (const ex of examples) {
        lines.push(`> ${ex}`, "");
      }
    }
  }

  const keyTerms = notes.key_terms ?? [];
  if (keyTerms.length > 0) {
    lines.push("## Key Terms", "");
    lines.push("| Term | Definition |");
    lines.push("|------|------------|");
    for (const item of keyTerms) {
      lines.push(`| **${item.term}** | ${item.definition} |`);
    }
    lines.push("");
  }

  const takeaways = notes.takeaways ?? [];
  if (takeaways.length > 0) {
    lines.push("## Key Takeaways", "");
    takeaways.forEach((t, i) => {
      lines.push(`${i + 1}. ${t}`);
    });
    lines.push("");
  }

  return lines.join("\n");
}

// ─── NotesExport Component ────────────────────────────────────────────────────

export interface NotesExportProps {
  lectureId: string;
  notes: StructuredNotes;
  summary?: string;
}

export function NotesExport({ lectureId, notes, summary }: NotesExportProps) {
  const pushToast = useToastStore((state) => state.pushToast);
  const [savingMd, setSavingMd] = useState(false);

  async function handleCopyMarkdown() {
    try {
      const md = notesToMarkdown(notes, summary);
      await navigator.clipboard.writeText(md);
      pushToast({ kind: "success", message: "Copied notes markdown to clipboard." });
    } catch {
      pushToast({ kind: "error", message: "Failed to copy markdown to clipboard." });
    }
  }

  async function handleDownloadMarkdown() {
    if (savingMd) return;
    setSavingMd(true);
    try {
      const saved = await exportNotesMarkdown(lectureId);
      if (saved) {
        pushToast({ kind: "success", message: "Markdown file exported successfully." });
      }
    } catch (e) {
      pushToast({ kind: "error", message: `Markdown export failed: ${String(e)}` });
    } finally {
      setSavingMd(false);
    }
  }

  function handlePrint() {
    const PORTAL_ID = "__notes-print-portal__";
    const STYLE_ID = "__notes-print-style__";

    // Remove any leftover portal from a previous invocation
    document.getElementById(PORTAL_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();

    // Inject print CSS into <head>
    const styleEl = document.createElement("style");
    styleEl.id = STYLE_ID;
    styleEl.textContent = PRINT_CSS;
    document.head.appendChild(styleEl);

    // Inject notes content into a hidden portal div
    const portal = document.createElement("div");
    portal.id = PORTAL_ID;
    portal.innerHTML = buildPrintBodyHtml(notes, summary);
    document.body.appendChild(portal);

    // Print, then clean up
    const cleanup = () => {
      portal.remove();
      styleEl.remove();
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
  }

  return (
    <>
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={handleCopyMarkdown}
          className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm font-medium transition-colors"
        >
          <span>📋</span> Copy as Markdown
        </button>

        <button
          onClick={handleDownloadMarkdown}
          disabled={savingMd}
          className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 rounded-lg text-sm font-medium transition-colors"
        >
          <span>⬇️</span> {savingMd ? "Saving…" : "Download as Markdown"}
        </button>

        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm font-medium transition-colors"
        >
          <span>🖨️</span> Download as PDF
        </button>
      </div>
    </>
  );
}
