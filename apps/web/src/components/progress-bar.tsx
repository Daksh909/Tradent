export function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
}
