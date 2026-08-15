"use client";

import type { PersonRating } from "@/components/movie-detail/types";

interface CreditsSectionProps {
  director: string | null;
  writer: string | null;
  actors: string | null;
  isLoadingMetadata: boolean;
  personRatings: Record<string, PersonRating>;
  onPersonClick?: (name: string) => void;
}

function CreditGroup({
  label,
  people,
  personRatings,
  onPersonClick,
}: {
  label: string;
  people: string;
  personRatings: Record<string, PersonRating>;
  onPersonClick?: (name: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">
        {label}
      </p>
      <div className="flex flex-col gap-1">
        {people.split(",").map((person, index) => {
          const name = person.trim();
          const rating = personRatings[name];
          return (
            <div key={`${name}-${index}`} className="flex items-center gap-2">
              <button
                onClick={() => onPersonClick?.(name)}
                className="text-white text-sm font-medium hover:text-indigo-400 transition-colors text-left"
              >
                {name}
              </button>
              {rating && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-500/20 text-indigo-400">
                  {rating.avg_rating}/10 ({rating.movie_count})
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function CreditsSection({
  director,
  writer,
  actors,
  isLoadingMetadata,
  personRatings,
  onPersonClick,
}: CreditsSectionProps) {
  return (
    <div className="bg-gray-800/40 rounded-2xl p-5 border border-gray-700/30 space-y-4">
      {director && (
        <CreditGroup
          label="Director"
          people={director}
          personRatings={personRatings}
          onPersonClick={onPersonClick}
        />
      )}
      {writer && (
        <CreditGroup
          label="Scenario"
          people={writer}
          personRatings={personRatings}
          onPersonClick={onPersonClick}
        />
      )}
      {actors && (
        <CreditGroup
          label="Actors"
          people={actors}
          personRatings={personRatings}
          onPersonClick={onPersonClick}
        />
      )}
      {!director && !writer && !actors && isLoadingMetadata && (
        <div className="animate-pulse space-y-4">
          <div className="h-3 bg-gray-700 rounded w-1/2"></div>
          <div className="h-4 bg-gray-700 rounded w-3/4"></div>
        </div>
      )}
    </div>
  );
}
