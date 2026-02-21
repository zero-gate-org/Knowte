import { NavLink } from "react-router-dom";
import { useLectureStore } from "../stores";

const baseNavItems = [
  { to: "/", label: "Library", end: true },
  { to: "/upload", label: "Upload" },
  { to: "/settings", label: "Settings" },
];

const lectureNavItems = [
  { segment: "transcript", label: "Transcript" },
  { segment: "pipeline", label: "Pipeline" },
  { segment: "notes", label: "Notes" },
  { segment: "quiz", label: "Quiz" },
  { segment: "research", label: "Research" },
  { segment: "mindmap", label: "Mind Map" },
  { segment: "flashcards", label: "Flashcards" },
];

function navLinkClass(isActive: boolean): string {
  return `block rounded-md px-4 py-2 text-sm transition-colors ${
    isActive
      ? "bg-slate-700 text-slate-100"
      : "text-slate-300 hover:bg-slate-700/50 hover:text-slate-100"
  }`;
}

export default function Sidebar() {
  const { lectures, currentLectureId } = useLectureStore();
  const currentLecture =
    lectures.find((lecture) => lecture.id === currentLectureId) ?? null;

  const lectureTitle =
    currentLecture?.title?.trim() || currentLecture?.filename || "Selected Lecture";

  return (
    <aside className="flex w-64 flex-col border-r border-slate-700 bg-slate-800">
      <div className="border-b border-slate-700 p-4">
        <h1 className="text-xl font-bold text-slate-100">Cognote</h1>
        {currentLectureId && (
          <p className="mt-1 truncate text-xs text-slate-400">{lectureTitle}</p>
        )}
      </div>

      <nav className="flex-1 p-2">
        {currentLectureId ? (
          <ul className="space-y-1">
            <li>
              <NavLink
                to="/"
                end
                className={({ isActive }) => navLinkClass(isActive)}
              >
                Back to Library
              </NavLink>
            </li>
            {lectureNavItems.map((item) => (
              <li key={item.segment}>
                <NavLink
                  to={`/lecture/${currentLectureId}/${item.segment}`}
                  className={({ isActive }) => navLinkClass(isActive)}
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="space-y-1">
            {baseNavItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => navLinkClass(isActive)}
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        )}
      </nav>
    </aside>
  );
}
