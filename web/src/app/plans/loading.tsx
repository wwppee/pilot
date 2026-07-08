import { SkeletonCard } from "@/components/Skeleton";

/** Plans list loading — card grid + header skeleton. */
export default function PlansLoading() {
  return (
    <div className="space-y-6">
      <div>
        <div className="h-7 w-40 surface rounded mb-1" />
        <div className="h-3 w-72 surface rounded" />
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-9 w-24 surface rounded-full" />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} lines={3} />
        ))}
      </div>
    </div>
  );
}
