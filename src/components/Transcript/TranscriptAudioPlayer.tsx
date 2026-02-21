import { createPortal } from "react-dom";

interface TranscriptAudioPlayerProps {
  lectureFilename: string;
  sourceUrl: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  disabledReason?: string | null;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onPlaybackRateChange: (rate: number) => void;
}

const PLAYBACK_RATES = [0.5, 1, 1.25, 1.5, 2] as const;

const formatTimestamp = (seconds: number) => {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const wholeSeconds = Math.floor(safeSeconds);
  const minutes = Math.floor(wholeSeconds / 60)
    .toString()
    .padStart(2, "0");
  const remainder = (wholeSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
};

export default function TranscriptAudioPlayer({
  lectureFilename,
  sourceUrl,
  isPlaying,
  currentTime,
  duration,
  playbackRate,
  disabledReason,
  onTogglePlay,
  onSeek,
  onPlaybackRateChange,
}: TranscriptAudioPlayerProps) {
  const isDisabled = sourceUrl === null;
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const safeCurrentTime = Math.min(Math.max(currentTime, 0), safeDuration || currentTime || 0);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <footer
      className="fixed bottom-0 right-0 z-40 border-t border-[var(--border-default)] bg-[var(--bg-surface-overlay)]/95 backdrop-blur"
      style={{ left: "var(--app-sidebar-width, 16rem)" }}
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">Now Playing</p>
            <p className="max-w-xs truncate text-xs text-[var(--text-muted)] md:max-w-md">
              {lectureFilename}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onTogglePlay}
              disabled={isDisabled}
              className="rounded-md bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPlaying ? "Pause" : "Play"}
            </button>

            <div className="flex items-center gap-1 rounded-md border border-[var(--border-default)] bg-[var(--bg-elevated)] p-1">
              {PLAYBACK_RATES.map((rate) => (
                <button
                  key={rate}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => onPlaybackRateChange(rate)}
                  className={`rounded px-2 py-1 text-xs transition-colors ${
                    playbackRate === rate
                      ? "bg-[var(--accent-primary)] text-white"
                      : "text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {rate}x
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="min-w-12 text-xs text-[var(--text-secondary)]">{formatTimestamp(safeCurrentTime)}</span>
          <input
            type="range"
            min={0}
            max={safeDuration || 0}
            step={0.1}
            value={safeCurrentTime}
            onChange={(event) => onSeek(Number(event.target.value))}
            disabled={isDisabled || safeDuration <= 0}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-[var(--bg-elevated)] accent-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          />
          <span className="min-w-12 text-right text-xs text-[var(--text-secondary)]">
            {formatTimestamp(safeDuration)}
          </span>
        </div>

        {isDisabled && (
          <p className="text-xs text-[var(--text-muted)]">
            {disabledReason ?? "Audio source is unavailable for this knowte."}
          </p>
        )}
      </div>
    </footer>,
    document.body,
  );
}
