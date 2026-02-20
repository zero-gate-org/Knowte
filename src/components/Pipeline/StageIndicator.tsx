interface StageIndicatorProps {
  label: string;
}

export default function StageIndicator({ label }: StageIndicatorProps) {
  return (
    <span className="inline-flex items-center rounded-full bg-blue-500/20 px-2.5 py-1 text-xs font-medium text-blue-200">
      {label}
    </span>
  );
}
