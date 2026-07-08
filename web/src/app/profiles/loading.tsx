import { SkeletonCard } from "@/components/Skeleton";

/** Profiles list loading — grid of avatar-style cards. */
export default function ProfilesLoading() {
  return (
    <div className="space-y-6">
      <div>
        <div className="h-7 w-32 surface rounded mb-1" />
        <div className="h-3 w-80 surface rounded" />
      </div>
      <SkeletonCard lines={2} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} lines={4} />
        ))}
      </div>
    </div>
  );
}
