interface ProgressBarProps {
  /** Completion as a 0..1 fraction. */
  value: number;
}

export function ProgressBar({ value }: ProgressBarProps) {
  const percent = Math.round(value * 100);
  return (
    <div role="status" aria-label={`Uploading, ${percent}% complete`}>
      <div className="mb-2 h-2 overflow-hidden rounded-full bg-edge">
        <div
          className="h-full bg-brand transition-[width] duration-150 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p>Uploading… {percent}%</p>
    </div>
  );
}
