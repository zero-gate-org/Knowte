import { PERSONALIZATION_LEVELS } from "../../lib/types";

export default function PersonalizationConfig({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-300">
        Personalization Level
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {PERSONALIZATION_LEVELS.map((level) => (
          <option key={level.value} value={level.value}>
            {level.label}
          </option>
        ))}
      </select>
      <p className="text-xs text-slate-400">
        Adjusts explanation complexity for your learning level
      </p>
    </div>
  );
}
