import { SkeletonCard } from "@/components/Skeleton";

/**
 * Root loading state — fires while the home / page is fetching
 * stats + recent sessions + packs. Uses skeleton primitives to
 * outline the eventual layout so the user sees structure immediately
 * instead of a blank screen.
 *
 * Auto-detected by Next.js as the segment-level Suspense fallback.
 * Equivalent to putting <Suspense fallback={<HomeFallback />} /> in
 * a parent layout.
 */
export default function HomeLoading() {
  return (
    <div className="space-y-6">
      {/* Header still renders sync; only the data-heavy body skeletons */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonCard key={i} lines={2} height={84} />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} lines={3} />
        ))}
      </div>
      <SkeletonCard lines={6} />
      <SkeletonCard lines={4} />
    </div>
  );
}
