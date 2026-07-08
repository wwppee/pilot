import { SkeletonCard } from "@/components/Skeleton";

/**
 * Sessions list loading — approximate the table layout (no top
 * row, 10 skeleton rows for typical density). Renders fast on
 * networks, but on cold start with a slow disk this is the
 * difference between "blank" and "feels responsive".
 */
export default function SessionsLoading() {
  return (
    <div className="space-y-6">
      <div>
        <div className="h-7 w-32 surface rounded mb-1" />
        <div className="h-3 w-64 surface rounded" />
      </div>
      <div className="surface rounded-lg overflow-hidden">
        <div className="px-3 py-2 surface-2">
          <SkeletonCard lines={1} height={14} />
        </div>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="px-3 py-3 border-t border-[var(--border)]">
            <SkeletonCard lines={2} />
          </div>
        ))}
      </div>
    </div>
  );
}
