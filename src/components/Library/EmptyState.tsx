import { useNavigate } from "react-router-dom";

export default function EmptyState() {
  const navigate = useNavigate();

  return (
    <div className="card px-6 py-12 text-center animate-scale-in">
      <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-lg" style={{ border: "1px solid var(--border-strong)", background: "var(--bg-surface-overlay)" }}>
        <svg
          aria-hidden="true"
          className="h-10 w-10"
          style={{ color: "var(--text-muted)" }}
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
      <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-heading)" }}>No knowtes yet</h2>
      <p className="mx-auto mt-2 max-w-md text-sm" style={{ color: "var(--text-muted)" }}>
        Add your first knowte to start generating transcripts, notes, quizzes, and flashcards.
      </p>
      <button
        type="button"
        onClick={() => navigate("/upload")}
        className="btn-primary mt-6"
      >
        Add your first knowte
      </button>
    </div>
  );
}
