import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  deleteLecture,
  estimatePipelineWork,
  exportAllLectureData,
  listLectures,
  searchLectures,
  startPipelineWithOptions,
} from "../../lib/tauriApi";
import type {
  Lecture,
  LectureSourceType,
  LectureStatus,
  LectureSummary,
} from "../../lib/types";
import { useLectureStore, useSettingsStore } from "../../stores";
import { ViewHeader } from "../Layout";
import EmptyState from "./EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectValue, SelectTrigger } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Plus, AlertCircle } from "lucide-react";

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
    sourceType: summary.source_type,
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

function statusBadgeVariant(status: LectureStatus): "default" | "secondary" | "destructive" | "outline" {
  if (status === "complete") return "default"; // green would be custom, default is primary
  if (status === "error") return "destructive";
  if (status === "uploaded") return "secondary";
  return "default";
}

function statusMatchesFilter(status: LectureStatus, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "complete") return status === "complete";
  if (filter === "error") return status === "error";
  return PROCESSING_STATUSES.includes(status);
}

function sourceBadgeVariant(sourceType: LectureSourceType): "default" | "secondary" {
  if (sourceType === "video") return "default";
  return "secondary";
}

function sourceLabel(sourceType: LectureSourceType): string {
  return sourceType === "video" ? "Video" : "Audio";
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
        const estimate = await estimatePipelineWork(lecture.id);
        const estimateMessage = `This lecture will process ~${estimate.token_estimate.toLocaleString()} tokens (estimated ${estimate.estimated_minutes_min}-${estimate.estimated_minutes_max} min).`;
        let useCache = true;
        if (estimate.has_cached_results) {
          useCache = window.confirm(
            `${estimateMessage}\n\nCached results are available for ${estimate.cached_stage_count} stage(s).\n\nPress OK to use cached results, or Cancel to regenerate everything.`,
          );
        }
        await startPipelineWithOptions(lecture.id, { useCache });
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
        window.alert(`Knowte data exported to:\n${exportPath}`);
      } catch (exportError) {
        setError(exportError instanceof Error ? exportError.message : String(exportError));
      } finally {
        setBusyLectureId(null);
      }
    },
    [settings?.export_path],
  );

  return (
    <div className="mx-auto max-w-[900px] space-y-6">
      <ViewHeader
        title="Your Knowtes"
        description="Browse, search, and manage your knowte history."
        actions={
          <Button
            type="button"
            onClick={() => navigate("/upload")}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Knowte
          </Button>
        }
      />
      <Card className="animate-slide-up">
        <CardContent className="grid gap-4 p-5 md:grid-cols-[1fr_auto_auto] items-end pb-5">
          <label className="block w-full">
            <span className="mb-2 block text-sm font-medium text-muted-foreground">Search knowtes</span>
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search title, transcript, or notes..."
              className="w-full"
            />
          </label>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-muted-foreground">Sort</span>
            <Select value={sortOption} onValueChange={(v) => setSortOption(v as SortOption)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
                <SelectItem value="alphabetical">Alphabetical</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-muted-foreground">Status</span>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="complete">Complete</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-4 duration-300">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Library Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="flex h-64 flex-col items-center justify-center gap-4 text-sm text-muted-foreground">
          <Spinner className="size-8" />
          <p>Loading knowtes...</p>
        </div>
      ) : lectureSummaries.length === 0 ? (
        <EmptyState />
      ) : filteredLectures.length === 0 ? (
        <div className="card px-6 py-10 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          No knowtes match your filters.
        </div>
      ) : (
        <section className="grid gap-4 sm:grid-cols-2">
          {filteredLectures.map((lecture, idx) => {
            const isBusy = busyLectureId === lecture.id;
            const progress = processingPercent(lecture);
            const showProgress = progress !== null;

            return (
              <Card
                key={lecture.id}
                className="group relative transition-all animate-card-in hover:shadow-md cursor-pointer pt-0"
                style={{ animationDelay: `${Math.min(idx * 55, 400)}ms` }}
                onClick={() => !isBusy && openLecture(lecture.id)}
              >
                <div role="button" tabIndex={0} className="w-full text-left" aria-disabled={isBusy}>
                  <CardHeader className="pb-3 pt-5">
                    <CardTitle className="truncate font-heading text-base leading-tight">
                      {lecture.title}
                    </CardTitle>
                    <CardDescription className="mt-1 truncate text-xs">
                      {lecture.filename}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatDate(lecture.created_at)}</span>
                      <span>•</span>
                      <span>{formatDuration(lecture.duration)}</span>
                      <Badge variant={sourceBadgeVariant(lecture.source_type)}>
                        {sourceLabel(lecture.source_type)}
                      </Badge>
                    </div>
                    <div className="mt-3">
                      <Badge variant={statusBadgeVariant(lecture.status)}>
                        {statusLabel(lecture.status)}
                      </Badge>
                    </div>
                    {showProgress && (
                      <div className="mt-4">
                        <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <p className="mt-1.5 text-xs text-muted-foreground">{progress}% complete</p>
                      </div>
                    )}
                  </CardContent>
                </div>

                <div className="absolute right-3 top-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setActiveMenuLectureId((current) =>
                        current === lecture.id ? null : lecture.id,
                      );
                    }}
                    disabled={isBusy}
                    className="h-8 w-8 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={`Knowte actions for ${lecture.title}`}
                  >
                    ⋮
                  </Button>

                  {activeMenuLectureId === lecture.id && (
                    <div
                      className="absolute right-0 z-20 mt-2 w-44 rounded-md p-1 shadow-lg border border-border bg-popover-foreground/5 backdrop-blur-md"
                      style={{ background: "var(--popover)" }}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => void handleDeleteLecture(lecture)}
                        className="block w-full rounded px-3 py-2 text-left text-xs transition-colors hover:opacity-80"
                        style={{ color: "var(--color-error)" }}
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleReprocessLecture(lecture)}
                        className="block w-full rounded px-3 py-2 text-left text-xs transition-colors hover:opacity-80"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Re-process
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleExportLecture(lecture)}
                        className="block w-full rounded px-3 py-2 text-left text-xs transition-colors hover:opacity-80"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Export All
                      </button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </section>
      )}
    </div>
  );
}
