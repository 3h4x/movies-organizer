const SKELETON_GROUPS = [1, 2, 3];
const SKELETON_CARDS = [1, 2, 3, 4, 5];

export default function RecommendationSkeleton() {
  return (
    <div className="space-y-10 animate-pulse">
      {SKELETON_GROUPS.map((group) => (
        <div key={group}>
          {/* Header skeleton */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-1 h-5 bg-gray-700 rounded-full" />
            <div className="h-5 w-48 bg-gray-700/50 rounded-lg" />
            <div className="h-4 w-16 bg-gray-800/50 rounded-lg" />
          </div>
          {/* Cards skeleton */}
          <div className="flex gap-4 overflow-hidden">
            {SKELETON_CARDS.map((card) => (
              <div
                key={card}
                className="min-w-[160px] max-w-[160px] flex-shrink-0"
              >
                <div className="rounded-xl overflow-hidden bg-gray-800/40 border border-gray-700/20">
                  <div className="aspect-[2/3] bg-gray-700/30" />
                  <div className="p-3 space-y-2">
                    <div className="h-4 w-24 bg-gray-700/30 rounded" />
                    <div className="h-3 w-16 bg-gray-700/20 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
