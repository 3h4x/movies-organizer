"use client";
// tamtam inspected 2026-05-21

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";

export default function SearchIndexPage() {
  const [query, setQuery] = useState("");
  const router = useRouter();

  function submit() {
    const q = query.trim();
    if (q) router.push(`/search/${encodeURIComponent(q)}`);
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => router.push("/")}
            className="text-gray-500 hover:text-white transition-colors flex items-center gap-1.5 text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back
          </button>
          <h1 className="text-white font-semibold text-sm">Search TMDb</h1>
        </div>
        <div className="flex gap-2 max-w-md">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Search movies..."
            autoFocus
            className="flex-1 bg-gray-800/60 text-white px-4 py-2.5 rounded-xl border border-gray-700/50 focus:border-indigo-500/50 focus:outline-none placeholder-gray-600 text-sm"
          />
          <Button
            onClick={submit}
            disabled={!query.trim()}
            className="px-5 py-2.5 rounded-xl text-sm"
          >
            Search
          </Button>
        </div>
      </div>
    </div>
  );
}
