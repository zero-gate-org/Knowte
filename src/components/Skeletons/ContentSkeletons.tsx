function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-slate-700/70 ${className}`} />;
}

export function NotesSkeleton() {
  return (
    <div className="space-y-5">
      <Bar className="h-9 w-2/3" />
      <Bar className="h-4 w-1/3" />
      <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-5 space-y-4">
        <Bar className="h-5 w-1/2" />
        <Bar className="h-4 w-full" />
        <Bar className="h-4 w-11/12" />
        <Bar className="h-4 w-4/5" />
      </div>
      <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-5 space-y-3">
        <Bar className="h-5 w-1/3" />
        <Bar className="h-4 w-full" />
        <Bar className="h-4 w-5/6" />
      </div>
    </div>
  );
}

export function QuizSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Bar className="h-8 w-1/2" />
      <Bar className="h-2 w-full" />
      <div className="rounded-2xl border border-slate-700 bg-slate-800/70 p-6 space-y-4">
        <Bar className="h-4 w-1/3" />
        <Bar className="h-6 w-5/6" />
        <Bar className="h-12 w-full" />
        <Bar className="h-12 w-full" />
        <Bar className="h-12 w-full" />
      </div>
      <div className="flex justify-between gap-3">
        <Bar className="h-10 w-24" />
        <Bar className="h-10 w-36" />
        <Bar className="h-10 w-24" />
      </div>
    </div>
  );
}

export function FlashcardSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <Bar className="h-4 w-28" />
        <Bar className="h-8 w-28" />
      </div>
      <div className="rounded-2xl border border-slate-700 bg-slate-800/70 p-8 space-y-5">
        <Bar className="h-5 w-16 mx-auto" />
        <Bar className="h-8 w-4/5 mx-auto" />
        <Bar className="h-8 w-3/5 mx-auto" />
        <Bar className="h-4 w-32 mx-auto" />
      </div>
      <div className="flex justify-center gap-4">
        <Bar className="h-10 w-28" />
        <Bar className="h-10 w-32" />
        <Bar className="h-10 w-28" />
      </div>
    </div>
  );
}

export function MindMapSkeleton() {
  return (
    <div className="h-full min-h-[26rem] rounded-xl border border-slate-700 bg-slate-800/60 p-4">
      <div className="grid h-full grid-cols-3 gap-4 animate-pulse">
        <div className="rounded-lg bg-slate-700/60" />
        <div className="rounded-lg bg-slate-700/50" />
        <div className="rounded-lg bg-slate-700/60" />
      </div>
    </div>
  );
}

export function PaperSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-lg border border-slate-700 bg-slate-800/60 p-4 space-y-3"
          >
            <Bar className="h-5 w-5/6" />
            <Bar className="h-4 w-2/3" />
            <Bar className="h-4 w-full" />
            <Bar className="h-4 w-4/5" />
            <div className="flex gap-2 pt-1">
              <Bar className="h-8 w-24" />
              <Bar className="h-8 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
