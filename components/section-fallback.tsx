/** Placeholder while a portal section streams in. */
export function SectionFallback() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <div className="h-28 animate-pulse rounded-xl bg-sunken" />
      <div className="h-64 animate-pulse rounded-xl bg-sunken" />
    </div>
  );
}
