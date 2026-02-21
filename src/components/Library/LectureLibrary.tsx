import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  deleteLecture,
  exportAllLectureData,
  listLectures,
  searchLectures,
  startPipeline,
} from "../../lib/tauriApi";
import type { Lecture, LectureStatus, LectureSummary } from "../../lib/types";
import { useLectureStore, useSettingsStore } from "../../stores";
import EmptyState from "./EmptyState";

type SortOption = "newest" | "oldest" | "alphabetical";
type StatusFilter = "all" | "complete" | "processing" | "error";

const PROCESSING_STATUSES: LectureStatus[] = ["uploaded", "transcribing", "processing"];
const STAGE_TOTAL = 6;

function summaryToLecture(summary: LectureSummary): Lecture {
  return {
    id: summary.id,
    title: summary.title,
    filename: summary.filename,
    audioPath: summary.audio_path,
    duration: summary.duration,
    status: summary.status,
    createdAt: summary.created_at,
    summary: summary.summary,
    stagesComplete: summary.stages_complete,
  };
}

function formatDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function formatDate(isoDate: string): string {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return isoDate;
  }

  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function statusLabel(status: LectureStatus): string {
  if (status === "uploaded") return "Uploaded";
  if (status === "transcribing") return "Transcribing";
  if (status === "processing") return "Processing";
  if (status === "complete") return "Complete";
  return "Error";
}

function statusBadgeClass(status: LectureStatus): string {
  if (status === "complete") return "border-emerald-500/40 bg-emerald-500/15 text-emerald-200";
  if (status === "error") return "border-red-500/40 bg-red-500/15 text-red-200";
  if (status === "uploaded") return "border-slate-500/40 bg-slate-500/15 text-slate-200";
  return "border-blue-500/40 bg-blue-500/15 text-blue-200";
}

function statusMatchesFilter(status: LectureStatus, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "complete") return status === "complete";
  if (filter === "error") return status === "error";
  return PROCESSING_STATUSES.includes(status);
}

function processingPercent(lecture: LectureSummary): number | null {
  if (lecture.status === "transcribing") return 15;
  if (lecture.status === "uploaded") return 5;
  if (lecture.status === "processing") {
    const percent = Math.round((lecture.stages_complete / STAGE_TOTAL) * 100);
    return Math.max(10, Math.min(95, percent));
  }
  return null;
}

export default function LectureLibrary() {
  const navigate = useNavigate();
  const { settings } = useSettingsStore();
  const { setLectures, setCurrentLecture, updateLecture, removeLecture } = useLectureStore();

  const [lectureSummaries, setLectureSummaries] = useState<LectureSummary[]>([]);
  const [query, setQuery] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>("newest");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [activeMenuLectureId, setActiveMenuLectureId] = useState<string | null>(null);
  const [busyLectureId, setBusyLectureId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleWindowClick = () => setActiveMenuLectureId(null);
    window.addEventListener("click", handleWindowClick);
    return () => window.removeEventListener("click", handleWindowClick);
  }, []);

  const loadLectures = useCallback(
    async (searchText: string) => {
      const trimmedQuery = searchText.trim();
      const summaries = trimmedQuery
        ? await searchLectures(trimmedQuery)
        : await listLectures();

      setLectureSummaries(summaries);
      setLectures(summaries.map(summaryToLecture));
    },
    [setLectures],
  );

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setIsLoading(true);
        setError(null);
        try {
          const trimmedQuery = query.trim();
          const summaries = trimmedQuery
            ? await searchLectures(trimmedQuery)
            : await listLectures();

          if (cancelled) return;
          setLectureSummaries(summaries);
          setLectures(summaries.map(summaryToLecture));
        } catch (loadError) {
          if (!cancelled) {
            setError(loadError instanceof Error ? loadError.message : String(loadError));
          }
        } finally {
          if (!cancelled) {
            setIsLoading(false);
          }
        }
      })();
    }, query.trim().length > 0 ? 250 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, setLectures]);

  const filteredLectures = useMemo(() => {
    const items = lectureSummaries.filter((lecture) =>
      statusMatchesFilter(lecture.status, statusFilter),
    );

    items.sort((left, right) => {
      if (sortOption === "alphabetical") {
        return left.title.localeCompare(right.title);
      }

      const leftTime = new Date(left.created_at).getTime() || 0;
      const rightTime = new Date(right.created_at).getTime() || 0;
      if (sortOption === "oldest") {
        return leftTime - rightTime;
      }

      return rightTime - leftTime;
    });

    return items;
  }, [lectureSummaries, sortOption, statusFilter]);

  const openLecture = useCallback(
    (lectureId: string) => {
      setCurrentLecture(lectureId);
      navigate(`/lecture/${lectureId}/notes`);
    },
    [navigate, setCurrentLecture],
  );

  const handleDeleteLecture = useCallback(
    async (lecture: LectureSummary) => {
      setActiveMenuLectureId(null);
      const shouldDelete = window.confirm(
        `Delete "${lecture.title}"?\n\nThis removes all generated data and the saved audio file.`,
      );
      if (!shouldDelete) {
        return;
      }

      setBusyLectureId(lecture.id);
      setError(null);
      try {
        await deleteLecture(lecture.id);
        removeLecture(lecture.id);
        await loadLectures(query);
      } catch (deleteError) {
        setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
      } finally {
        setBusyLectureId(null);
      }
    },
    [loadLectures, query, removeLecture],
  );

  const handleReprocessLecture = useCallback(
    async (lecture: LectureSummary) => {
      setActiveMenuLectureId(null);
      setBusyLectureId(lecture.id);
      setError(null);

      try {
        setCurrentLecture(lecture.id);
        updateLecture(lecture.id, { status: "processing", error: undefined });
        await startPipeline(lecture.id);
        navigate(`/lecture/${lecture.id}/pipeline`);
      } catch (processError) {
        setError(processError instanceof Error ? processError.message : String(processError));
      } finally {
        setBusyLectureId(null);
      }
    },
    [navigate, setCurrentLecture, updateLecture],
  );

  const handleExportLecture = useCallback(
    async (lecture: LectureSummary) => {
      setActiveMenuLectureId(null);
      const defaultOutputDir = settings?.export_path ?? "";
      const outputDir = window.prompt(
        "Enter an output folder path for export:",
        defaultOutputDir,
      );

      if (!outputDir || outputDir.trim().length === 0) {
        return;
      }

      setBusyLectureId(lecture.id);
      setError(null);
      try {
        const exportPath = await exportAllLectureData(lecture.id, outputDir.trim());
        window.alert(`Lecture data exported to:\n${exportPath}`);
      } catch (exportError) {
        setError(exportError instanceof Error ? exportError.message : String(exportError));
      } finally {
        setBusyLectureId(null);
      }
    },
    [settings?.export_path],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Your Lectures</h1>
          <p className="mt-1 text-sm text-slate-400">
            Browse, search, and manage your lecture history.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/upload")}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          New Lecture
        </button>
      </header>

      <section className="grid gap-3 rounded-xl border border-slate-700 bg-slate-800/70 p-4 md:grid-cols-[1fr_auto_auto]">
        <label className="block">
          <span className="sr-only">Search lectures</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title, transcript, or notes..."
            className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        <label className="flex items-center gap-2 text-sm text-slate-300">
          <span>Sort</span>
          <select
            value={sortOption}
            onChange={(event) => setSortOption(event.target.value as SortOption)}
            className="rounded-md border border-slate-600 bg-slate-900 px-2 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="alphabetical">Alphabetical</option>
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm text-slate-300">
          <span>Status</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            className="rounded-md border border-slate-600 bg-slate-900 px-2 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All</option>
            <option value="complete">Complete</option>
            <option value="processing">Processing</option>
            <option value="error">Error</option>
          </select>
        </label>
      </section>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex h-64 items-center justify-center text-sm text-slate-400">
          <span className="inline-flex items-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
            Loading lectures...
          </span>
        </div>
      ) : lectureSummaries.length === 0 ? (
        <EmptyState />
      ) : filteredLectures.length === 0 ? (
        <div className="rounded-xl border border-slate-700 bg-slate-800/60 px-6 py-10 text-center text-sm text-slate-400">
          No lectures match your filters.
        </div>
      ) : (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredLectures.map((lecture) => {
            const isBusy = busyLectureId === lecture.id;
            const progress = processingPercent(lecture);
            const showProgress = progress !== null;

            return (
              <article
                key={lecture.id}
                className="relative rounded-xl border border-slate-700 bg-slate-800 p-4 transition-colors hover:border-slate-500"
              >
                <button
                  type="button"
                  onClick={() => openLecture(lecture.id)}
                  disabled={isBusy}
                  className="block w-full pr-10 text-left"
                >
                  <p className="truncate text-base font-semibold text-slate-100">{lecture.title}</p>
                  <p className="mt-1 truncate text-xs text-slate-400">{lecture.filename}</p>
                  <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                    <span>{formatDate(lecture.created_at)}</span>
                    <span>•</span>
                    <span>{formatDuration(lecture.duration)}</span>
                  </div>
                  <div className="mt-3">
                    <span
                      className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${statusBadgeClass(lecture.status)}`}
                    >
                      {statusLabel(lecture.status)}
                    </span>
                  </div>
                  {showProgress && (
                    <div className="mt-3">
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-700">
                        <div
                          className="h-full rounded-full bg-blue-500 transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{progress}% complete</p>
                    </div>
                  )}
                </button>

                <div className="absolute right-3 top-3">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setActiveMenuLectureId((current) =>
                        current === lecture.id ? null : lecture.id,
                      );
                    }}
                    disabled={isBusy}
                    className="rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-slate-300 transition-colors hover:border-slate-500 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={`Lecture actions for ${lecture.title}`}
                  >
                    ⋮
                  </button>

                  {activeMenuLectureId === lecture.id && (
                    <div
                      className="absolute right-0 z-20 mt-2 w-44 rounded-md border border-slate-600 bg-slate-900 p-1 shadow-xl"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => void handleDeleteLecture(lecture)}
                        className="block w-full rounded px-3 py-2 text-left text-xs text-red-300 transition-colors hover:bg-red-500/10"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleReprocessLecture(lecture)}
                        className="block w-full rounded px-3 py-2 text-left text-xs text-slate-200 transition-colors hover:bg-slate-700"
                      >
                        Re-process
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleExportLecture(lecture)}
                        className="block w-full rounded px-3 py-2 text-left text-xs text-slate-200 transition-colors hover:bg-slate-700"
                      >
                        Export All
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
