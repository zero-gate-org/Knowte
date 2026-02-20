import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Sidebar } from "./components";
import {
  Upload,
  Transcript,
  Notes,
  Quiz,
  Research,
  MindMap,
  Flashcards,
  Settings,
} from "./pages";
import "./index.css";

function App() {
  return (
    <BrowserRouter>
      <div className="flex h-screen bg-slate-900 text-slate-100">
        <Sidebar />
        <main className="flex-1 p-6 overflow-auto">
          <Routes>
            <Route path="/" element={<Upload />} />
            <Route path="/transcript" element={<Transcript />} />
            <Route path="/notes" element={<Notes />} />
            <Route path="/quiz" element={<Quiz />} />
            <Route path="/research" element={<Research />} />
            <Route path="/mind-map" element={<MindMap />} />
            <Route path="/flashcards" element={<Flashcards />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
