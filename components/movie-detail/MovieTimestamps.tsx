"use client";

interface MovieTimestampsProps {
  createdAt: string | null;
  ratedAt: string | null;
}

export default function MovieTimestamps({
  createdAt,
  ratedAt,
}: MovieTimestampsProps) {
  return (
    <div className="flex items-center gap-6 pt-4 border-t border-gray-800">
      {createdAt && (
        <div className="space-y-1">
          <p className="text-[9px] text-gray-600 font-black uppercase tracking-widest">
            Added to Library
          </p>
          <p className="text-[11px] text-gray-500 font-medium">
            {new Date(createdAt).toLocaleDateString()}
          </p>
        </div>
      )}
      {ratedAt && (
        <div className="space-y-1">
          <p className="text-[9px] text-gray-600 font-black uppercase tracking-widest">
            Last Rated
          </p>
          <p className="text-[11px] text-gray-500 font-medium">
            {new Date(ratedAt).toLocaleDateString()}
          </p>
        </div>
      )}
    </div>
  );
}
