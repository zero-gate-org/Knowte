import { useMemo, useState } from "react";
import { useLectureStore } from "../../stores";

const formatTimestamp = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60)
    .toString()
    .padStart(2, "0");
  const remainder = (safeSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
};

export default function TranscriptViewer() {
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
    if (!normalizedQuery) {
      return segments;
    }

    return segments.filter((segment) =>
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
      <div className="mx-auto max-w-4xl rounded-xl border border-slate-700 bg-slate-800/70 p-6">
        <h1 className="text-xl font-semibold text-slate-100">Transcript</h1>
        <p className="mt-2 text-sm text-slate-400">
          Process a lecture from the Upload page to generate a transcript.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-slate-100">Transcript</h1>
        <p className="text-sm text-slate-400">{lecture.filename}</p>
      </header>

      <section className="rounded-xl border border-slate-700 bg-slate-800/70 p-4">
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
              className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="button"
            onClick={() => void handleCopyAll()}
            disabled={!fullTranscript}
            className="rounded-md bg-slate-700 px-4 py-2 text-sm font-medium text-slate-100 transition-colors hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {copied ? "Copied" : "Copy All"}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-700 bg-slate-800/70 p-4">
        {filteredSegments.length > 0 ? (
          <div className="space-y-3">
            {filteredSegments.map((segment, index) => (
              <button
                key={`${segment.start}-${segment.end}-${index}`}
                type="button"
                className="block w-full rounded-md border border-slate-700 bg-slate-900/60 px-4 py-3 text-left transition-colors hover:border-slate-500"
                title="Clickable segment (audio sync will be added in Task 2.2)"
              >
                <p className="text-xs text-blue-300">
                  {formatTimestamp(segment.start)} - {formatTimestamp(segment.end)}
                </p>
                <p className="mt-1 text-sm text-slate-200">{segment.text}</p>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">
            {query
              ? "No transcript segments match your search."
              : "No transcript segments are available for this lecture yet."}
          </p>
        )}
      </section>
    </div>
  );
}
