export function PageHeader({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  );
}

/** Placeholder body for pages built in step 6. */
export function ComingSoon({ what }: { what: string }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
      <p className="font-medium">Coming in build step 6</p>
      <p className="max-w-md text-sm text-muted-foreground">{what}</p>
    </div>
  );
}
