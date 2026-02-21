import { convertFileSrc } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  TranscriptAudioPlayer,
  TranscriptEditor,
  TranscriptViewer,
} from "../components";
import { getLectureAudioUrl, getLectureTranscript } from "../lib/tauriApi";
import { useLectureStore } from "../stores";

const PLAYBACK_RATE_DEFAULT = 1;

export default function Transcript() {
  const [isEditing, setIsEditing] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(PLAYBACK_RATE_DEFAULT);
  const audioRef = useRef<HTMLAudioElement>(null);

  const { lectures, currentLectureId, updateLecture } = useLectureStore();
  const lecture = useMemo(
    () => lectures.find((item) => item.id === currentLectureId) ?? null,
    [lectures, currentLectureId],
  );

  useEffect(() => {
    if (!lecture?.id) {
      return;
    }
    if (
      lecture.transcriptId &&
      lecture.transcriptSegments &&
      lecture.transcriptSegments.length > 0
    ) {
      return;
    }

    let isCancelled = false;

    void (async () => {
      try {
        const transcript = await getLectureTranscript(lecture.id);
        if (!transcript || isCancelled) {
          return;
        }

        updateLecture(lecture.id, {
          transcriptId: transcript.transcript_id,
          transcript: transcript.full_text,
          transcriptSegments: transcript.segments,
          originalTranscriptSegments:
            lecture.originalTranscriptSegments ?? transcript.segments.map((segment) => ({ ...segment })),
        });
      } catch {
        // If transcript fetch fails we keep existing UI fallback messaging.
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [
    lecture?.id,
    lecture?.originalTranscriptSegments,
    lecture?.transcriptId,
    lecture?.transcriptSegments,
    updateLecture,
  ]);

  useEffect(() => {
    setCurrentTime(0);
    setDuration(lecture?.duration ?? 0);
    setIsPlaying(false);
    setPlaybackRate(PLAYBACK_RATE_DEFAULT);
    setIsEditing(false);
  }, [lecture?.id, lecture?.duration]);

  useEffect(() => {
    if (!lecture) {
      setAudioUrl(null);
      setAudioError(null);
      return;
    }

    let isCancelled = false;

    const resolveAudioUrl = async () => {
      try {
        const resolved = await getLectureAudioUrl(lecture.id);
        if (isCancelled) {
          return;
        }

        setAudioUrl(
          resolved.startsWith("asset://") ? resolved : convertFileSrc(resolved),
        );
        setAudioError(null);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setAudioUrl(convertFileSrc(lecture.audioPath));
        setAudioError(
          error instanceof Error
            ? error.message
            : "Unable to resolve lecture audio URL.",
        );
      }
    };

    void resolveAudioUrl();

    return () => {
      isCancelled = true;
    };
  }, [lecture?.id, lecture?.audioPath]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };
    const handleLoadedMetadata = () => {
      setDuration(
        Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : lecture?.duration ?? 0,
      );
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [audioUrl, lecture?.duration]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.playbackRate = playbackRate;
  }, [playbackRate, audioUrl]);

  const handleTogglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) {
      return;
    }

    if (audio.paused) {
      void audio.play().catch(() => {
        setAudioError("Unable to start audio playback.");
      });
      return;
    }

    audio.pause();
  }, [audioUrl]);

  const handleSeek = useCallback((nextTime: number) => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const clampedTime = Math.max(0, Math.min(nextTime, duration || nextTime));
    audio.currentTime = clampedTime;
    setCurrentTime(clampedTime);
  }, [duration]);

  const activeSegmentIndex = useMemo(() => {
    const segments = lecture?.transcriptSegments ?? [];
    if (segments.length === 0) {
      return null;
    }

    const foundIndex = segments.findIndex(
      (segment) => currentTime >= segment.start && currentTime < segment.end,
    );

    if (foundIndex >= 0) {
      return foundIndex;
    }

    if (currentTime >= segments[segments.length - 1].end) {
      return segments.length - 1;
    }

    return null;
  }, [currentTime, lecture?.transcriptSegments]);

  const handleSegmentSeek = useCallback(
    (segmentIndex: number) => {
      const segment = lecture?.transcriptSegments?.[segmentIndex];
      if (!segment) {
        return;
      }

      handleSeek(segment.start);
    },
    [handleSeek, lecture?.transcriptSegments],
  );

  if (!lecture) {
    return <TranscriptViewer />;
  }

  return (
    <div className="pb-36">
      <header className="mx-auto mb-4 flex max-w-5xl items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Transcript</h1>
          <p className="text-sm text-slate-400">{lecture.filename}</p>
        </div>

        <button
          type="button"
          onClick={() => setIsEditing((previous) => !previous)}
          disabled={!lecture.transcriptSegments || lecture.transcriptSegments.length === 0}
          className="rounded-md border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isEditing ? "View Transcript" : "Edit Transcript"}
        </button>
      </header>

      {audioError && (
        <div className="mx-auto mb-4 max-w-5xl rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {audioError}
        </div>
      )}

      {isEditing ? (
        <TranscriptEditor
          activeSegmentIndex={activeSegmentIndex}
          onSegmentClick={handleSegmentSeek}
        />
      ) : (
        <TranscriptViewer
          showHeader={false}
          activeSegmentIndex={activeSegmentIndex}
          onSegmentClick={handleSegmentSeek}
        />
      )}

      <audio ref={audioRef} src={audioUrl ?? undefined} preload="metadata" className="hidden" />

      <TranscriptAudioPlayer
        lectureFilename={lecture.filename}
        sourceUrl={audioUrl}
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration}
        playbackRate={playbackRate}
        disabledReason={
          audioError ??
          (audioUrl ? null : "No audio source is available for the selected lecture.")
        }
        onTogglePlay={handleTogglePlay}
        onSeek={handleSeek}
        onPlaybackRateChange={setPlaybackRate}
      />
    </div>
  );
}
