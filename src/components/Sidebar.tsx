import { NavLink } from "react-router-dom";
import { useLectureStore } from "../stores";

interface SidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

const baseNavItems = [
  { to: "/", label: "Library", end: true, icon: "library" },
  { to: "/upload", label: "Upload", icon: "upload" },
  { to: "/compare", label: "Compare", icon: "compare" },
  { to: "/settings", label: "Settings", icon: "settings" },
] as const;

const lectureNavItems = [
  { segment: "transcript", label: "Transcript", icon: "transcript" },
  { segment: "pipeline", label: "Pipeline", icon: "pipeline" },
  { segment: "notes", label: "Notes", icon: "notes" },
  { segment: "quiz", label: "Quiz", icon: "quiz" },
  { segment: "research", label: "Research", icon: "research" },
  { segment: "mindmap", label: "Mind Map", icon: "mindmap" },
  { segment: "flashcards", label: "Flashcards", icon: "flashcards" },
] as const;

type NavIconName =
  | "library"
  | "upload"
  | "compare"
  | "settings"
  | "transcript"
  | "pipeline"
  | "notes"
  | "quiz"
  | "research"
  | "mindmap"
  | "flashcards";

function NavIcon({ name }: { name: NavIconName }) {
  const iconClass = "h-[18px] w-[18px] shrink-0";

  if (name === "library") {
    return (
      <svg aria-hidden="true" className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h10A2.5 2.5 0 0 1 19 5.5v13A2.5 2.5 0 0 1 16.5 21h-10A2.5 2.5 0 0 1 4 18.5z" />
        <path d="M8 3v18" />
      </svg>
    );
  }

  if (name === "upload") {
    return (
      <svg aria-hidden="true" className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path d="M12 16V5" />
        <path d="M8.5 8.5 12 5l3.5 3.5" />
        <path d="M4 16.5A3.5 3.5 0 0 0 7.5 20h9A3.5 3.5 0 0 0 20 16.5" />
      </svg>
    );
  }

  if (name === "settings") {
    return (
      <svg aria-hidden="true" className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <circle cx="12" cy="12" r="3.2" />
        <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 1 1-4 0v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 1 1 0-4h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a2 2 0 1 1 4 0v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20a2 2 0 1 1 0 4h-.2a1 1 0 0 0-.9.6z" />
      </svg>
    );
  }

  if (name === "compare") {
    return (
      <svg aria-hidden="true" className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H11v16H6.5A2.5 2.5 0 0 1 4 17.5z" />
        <path d="M13 4h4.5A2.5 2.5 0 0 1 20 6.5v11A2.5 2.5 0 0 1 17.5 20H13z" />
        <path d="M8 9h1.5M8 13h1.5M14.5 9H16M14.5 13H16" />
      </svg>
    );
  }

  if (name === "transcript") {
    return (
      <svg aria-hidden="true" className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M8 9h8M8 13h8M8 17h5" />
      </svg>
    );
  }

  if (name === "pipeline") {
    return (
      <svg aria-hidden="true" className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <circle cx="6" cy="7" r="2" />
        <circle cx="12" cy="12" r="2" />
        <circle cx="18" cy="17" r="2" />
        <path d="M7.5 8.5 10.5 10.5M13.5 13.5 16.5 15.5" />
      </svg>
    );
  }

  if (name === "notes") {
    return (
      <svg aria-hidden="true" className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path d="M7 4h10a2 2 0 0 1 2 2v12l-4 2-4-2-4 2V6a2 2 0 0 1 2-2z" />
        <path d="M9 9h6M9 13h6" />
      </svg>
    );
  }

  if (name === "quiz") {
    return (
      <svg aria-hidden="true" className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <circle cx="12" cy="12" r="8" />
        <path d="M9.5 9.5a2.5 2.5 0 1 1 4.3 1.8c-.9 1-1.8 1.4-1.8 2.7M12 16.5h.01" />
      </svg>
    );
  }

  if (name === "research") {
    return (
      <svg aria-hidden="true" className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <circle cx="11" cy="11" r="6.5" />
        <path d="m16 16 4 4" />
      </svg>
    );
  }

  if (name === "mindmap") {
    return (
      <svg aria-hidden="true" className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <circle cx="12" cy="12" r="2.2" />
        <circle cx="5" cy="6" r="1.8" />
        <circle cx="19" cy="6" r="1.8" />
        <circle cx="5" cy="18" r="1.8" />
        <circle cx="19" cy="18" r="1.8" />
        <path d="M10.2 10.7 6.6 7.8M13.8 10.7l3.6-2.9M10.2 13.3l-3.6 2.9M13.8 13.3l3.6 2.9" />
      </svg>
    );
  }

  if (name === "flashcards") {
    return (
      <svg aria-hidden="true" className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <rect x="5" y="8" width="12" height="9" rx="2" />
        <path d="M8 5h11v9M10 11h4" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <rect x="5" y="4" width="14" height="16" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </svg>
  );
}

function navLinkClass(isActive: boolean, isCollapsed: boolean): string {
  const base = [
    "group relative flex items-center text-sm font-medium",
    "transition-all duration-200",
    isCollapsed
      ? "justify-center px-0 py-2.5 rounded-[var(--radius-md)]"
      : "gap-3 px-3 py-2 rounded-[var(--radius-md)]",
  ];

  if (isActive) {
    base.push(
      "bg-[var(--sidebar-item-active-bg)] text-[var(--sidebar-item-active-text)]",
      "shadow-[0_1px_3px_rgba(0,0,0,0.12)]",
    );
  } else {
    base.push(
      "text-[var(--text-secondary)]",
      "hover:bg-[var(--sidebar-item-hover)] hover:text-[var(--text-primary)]",
    );
  }

  return base.join(" ");
}

function lectureBadgeClass(isActive: boolean): string {
  return isActive
    ? "bg-white/20 text-[var(--sidebar-item-active-text)]"
    : "bg-[var(--badge-neutral-bg)] text-[var(--text-tertiary)]";
}

export default function Sidebar({ isCollapsed, onToggleCollapse }: SidebarProps) {
  const { lectures, currentLectureId } = useLectureStore();
  const currentLecture =
    lectures.find((lecture) => lecture.id === currentLectureId) ?? null;
  const lectureCount = lectures.length;
  const lectureTitle =
    currentLecture?.title?.trim() || currentLecture?.filename || "Selected Knowte";

  return (
    <aside
      className={`flex shrink-0 flex-col backdrop-blur-sm ${
        isCollapsed ? "w-16" : "w-64"
      } transition-all duration-300`}
      style={{
        background: "var(--sidebar-bg)",
        borderRight: "1px solid var(--sidebar-border)",
      }}
      aria-label="Sidebar navigation"
    >
      {/* ── Brand + Collapse ──────────────────────────────────────────── */}
      <div
        className={`${isCollapsed ? "px-2 py-3" : "px-4 py-4"}`}
        style={{ borderBottom: "1px solid var(--sidebar-border)" }}
      >
        <div className={`flex items-center ${isCollapsed ? "justify-center" : "justify-end"}`}>
          <button
            type="button"
            onClick={onToggleCollapse}
            className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)]"
            style={{
              color: "var(--text-tertiary)",
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
            }}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <svg
              aria-hidden="true"
              className={`h-3.5 w-3.5 transition-transform duration-300 ${isCollapsed ? "rotate-180" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
        </div>

        {!isCollapsed && currentLectureId && (
          <p
            className="mt-2 truncate text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            {lectureTitle}
          </p>
        )}
      </div>

      {/* ── Navigation ────────────────────────────────────────────────── */}
      <nav
        className={`${isCollapsed ? "p-2" : "p-3"} flex-1 overflow-y-auto`}
        role="tablist"
        aria-label={currentLectureId ? "Knowte view navigation" : "Primary navigation"}
      >
        {currentLectureId ? (
          <ul className="space-y-0.5">
            <li>
              <NavLink
                to="/"
                end
                role="tab"
                title="Library"
                className={({ isActive }) => navLinkClass(isActive, isCollapsed)}
              >
                {({ isActive }) => (
                  <>
                    <NavIcon name="library" />
                    {!isCollapsed && (
                      <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                        <span>Library</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${lectureBadgeClass(isActive)}`}
                        >
                          {lectureCount}
                        </span>
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            </li>

            {!isCollapsed && (
              <li className="pt-3 pb-1.5">
                <p
                  className="px-3 text-[10px] font-semibold uppercase tracking-widest"
                  style={{ color: "var(--text-muted)" }}
                >
                  Knowte views
                </p>
              </li>
            )}

            {lectureNavItems.map((item, i) => (
              <li key={item.segment} className="animate-fade-in" style={{ animationDelay: `${i * 30}ms` }}>
                <NavLink
                  to={`/lecture/${currentLectureId}/${item.segment}`}
                  role="tab"
                  title={item.label}
                  className={({ isActive }) => navLinkClass(isActive, isCollapsed)}
                >
                  <NavIcon name={item.icon} />
                  {!isCollapsed && <span>{item.label}</span>}
                </NavLink>
              </li>
            ))}

            {!isCollapsed && (
              <li className="pt-3 pb-1.5">
                <p
                  className="px-3 text-[10px] font-semibold uppercase tracking-widest"
                  style={{ color: "var(--text-muted)" }}
                >
                  Tools
                </p>
              </li>
            )}

            <li>
              <NavLink
                to="/compare"
                role="tab"
                title="Compare"
                className={({ isActive }) => navLinkClass(isActive, isCollapsed)}
              >
                <NavIcon name="compare" />
                {!isCollapsed && <span>Compare</span>}
              </NavLink>
            </li>

            <li>
              <NavLink
                to="/settings"
                role="tab"
                title="Settings"
                className={({ isActive }) => navLinkClass(isActive, isCollapsed)}
              >
                <NavIcon name="settings" />
                {!isCollapsed && <span>Settings</span>}
              </NavLink>
            </li>
          </ul>
        ) : (
          <ul className="space-y-0.5">
            {baseNavItems.map((item, i) => (
              <li key={item.to} className="animate-fade-in" style={{ animationDelay: `${i * 40}ms` }}>
                <NavLink
                  to={item.to}
                  end={item.to === "/"}
                  role="tab"
                  title={item.label}
                  className={({ isActive }) => navLinkClass(isActive, isCollapsed)}
                >
                  {({ isActive }) => (
                    <>
                      <NavIcon name={item.icon} />
                      {!isCollapsed && (
                        <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                          <span>{item.label}</span>
                          {item.to === "/" && (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${lectureBadgeClass(isActive)}`}
                            >
                              {lectureCount}
                            </span>
                          )}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        )}
      </nav>
    </aside>
  );
}
