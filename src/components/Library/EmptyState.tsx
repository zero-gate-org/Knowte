import { useNavigate } from "react-router-dom";

export default function EmptyState() {
  const navigate = useNavigate();

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-800/70 px-6 py-12 text-center">
      <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl border border-slate-600 bg-slate-900/80">
        <svg
          className="h-10 w-10 text-slate-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 7v10m5-5H7m12 8H5a2 2 0 01-2-2V6a2 2 0 012-2h8l2 2h4a2 2 0 012 2v10a2 2 0 01-2 2z"
          />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-slate-100">No lectures yet</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
        Upload your first lecture to start generating transcripts, notes, quizzes, and flashcards.
      </p>
      <button
        type="button"
        onClick={() => navigate("/upload")}
        className="mt-6 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
      >
        Upload your first lecture
      </button>
    </div>
  );
}
