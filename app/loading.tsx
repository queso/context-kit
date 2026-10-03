export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted font-sans">
      <output className="flex flex-col items-center gap-4">
        <div className="size-8 animate-spin rounded-full border-4 border-border border-t-foreground" />
        <span className="sr-only">Loading</span>
      </output>
    </div>
  )
}
