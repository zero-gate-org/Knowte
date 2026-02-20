import { NavLink } from "react-router-dom";

const navItems = [
  { to: "/", label: "Upload" },
  { to: "/transcript", label: "Transcript" },
  { to: "/notes", label: "Notes" },
  { to: "/quiz", label: "Quiz" },
  { to: "/research", label: "Research" },
  { to: "/mind-map", label: "Mind Map" },
  { to: "/flashcards", label: "Flashcards" },
  { to: "/settings", label: "Settings" },
];

export default function Sidebar() {
  return (
    <aside className="w-64 bg-slate-800 border-r border-slate-700 flex flex-col">
      <div className="p-4 border-b border-slate-700">
        <h1 className="text-xl font-bold text-slate-100">Cognote</h1>
      </div>
      <nav className="flex-1 p-2">
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  `block px-4 py-2 rounded-md transition-colors ${
                    isActive
                      ? "bg-slate-700 text-slate-100"
                      : "text-slate-300 hover:bg-slate-700/50 hover:text-slate-100"
                  }`
                }
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
