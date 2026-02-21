import { useMemo, useState } from "react";
import { useLectureStore } from "../../stores";

interface TranscriptViewerProps {
  activeSegmentIndex?: number | null;
  onSegmentClick?: (index: number) => void;
  showHeader?: boolean;
}

const formatTimestamp = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60)
    .toString()
    .padStart(2, "0");
  const remainder = (safeSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
};

export default function TranscriptViewer({
  activeSegmentIndex = null,
  onSegmentClick,
  showHeader = true,
}: TranscriptViewerProps) {
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const { lectures, currentLectureId } = useLectureStore();

  const lecture = useMemo(
    () => lectures.find((item) => item.id === currentLectureId) ?? null,
    [lectures, currentLectureId],
  );

  const segments = lecture?.transcriptSegments ?? [];
  const fullTranscript = lecture?.transcript ?? "";

  const filteredSegments = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const indexedSegments = segments.map((segment, index) => ({ segment, index }));
    if (!normalizedQuery) {
      return indexedSegments;
    }

    return indexedSegments.filter(({ segment }) =>
      segment.text.toLowerCase().includes(normalizedQuery),
    );
  }, [segments, query]);

  const handleCopyAll = async () => {
    if (!fullTranscript) {
      return;
    }

    try {
      await navigator.clipboard.writeText(fullTranscript);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  if (!lecture) {
    return (
      <div className="mx-auto max-w-[900px] rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] p-4 shadow-sm">
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">Transcript</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Process a knowte from the Upload page to generate a transcript.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[900px] space-y-6">
      {showHeader && (
        <header className="space-y-1">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Transcript</h1>
          <p className="text-sm text-[var(--text-muted)]">{lecture.filename}</p>
        </header>
      )}

      <section className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex-1">
            <label htmlFor="transcript-search" className="sr-only">
              Search transcript
            </label>
            <input
              id="transcript-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search transcript..."
              className="w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface-overlay)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]"
            />
          </div>
          <button
            type="button"
            onClick={() => void handleCopyAll()}
            disabled={!fullTranscript}
            className="rounded-md bg-[var(--bg-elevated)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--border-strong)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {copied ? "Copied" : "Copy All"}
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] p-4 shadow-sm">
        {filteredSegments.length > 0 ? (
          <div className="space-y-3">
            {filteredSegments.map(({ segment, index }) => (
              <article
                key={`${segment.start}-${segment.end}-${index}`}
                className={`block w-full rounded-md border bg-[var(--bg-surface-overlay)] px-4 py-3 text-left transition-colors ${
                  activeSegmentIndex === index
                    ? "border-[var(--accent-primary)] ring-1 ring-[var(--accent-primary)]"
                    : "border-[var(--border-default)] hover:border-[var(--border-strong)]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSegmentClick?.(index)}
                  className="rounded-md bg-[var(--bg-elevated)] px-2 py-1 text-xs text-[var(--color-info)] transition-colors hover:bg-[var(--bg-elevated)]"
                  title="Seek audio playback to this segment"
                >
                  {formatTimestamp(segment.start)} - {formatTimestamp(segment.end)}
                </button>
                <p className="mt-2 select-text text-sm text-[var(--text-secondary)]" data-selection-context>
                  {segment.text}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">
            {query
              ? "No transcript segments match your search."
              : "No transcript segments are available for this knowte yet."}
          </p>
        )}
      </section>
    </div>
  );
}
