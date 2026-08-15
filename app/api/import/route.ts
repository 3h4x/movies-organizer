import { NextRequest } from "next/server";
import {
  enrichMovieMetadata,
  getDb,
  getExistingMovieInsertTargetId,
  getMovieByFilePath,
  insertMovie,
  type MovieInput,
  movieNeedsTmdbEnrichment,
  setSetting,
} from "@/lib/db";
import { linkToExistingPathlessRow } from "@/lib/pathless-row-link";
import { scanDirectoryGenerator } from "@/lib/scanner";
import { searchTmdb } from "@/lib/tmdb";
import { selectTmdbSearchCandidates } from "@/lib/tmdb-match";
import { rateLimit } from "@/lib/rate-limit";
import fs from "fs";

export async function POST(request: NextRequest) {
  const limited = rateLimit(request, "mutation");
  if (limited) return limited;
  const { path: dirPath } = await request.json();

  if (!dirPath || typeof dirPath !== "string") {
    return Response.json({ error: "Path is required" }, { status: 400 });
  }

  if (!fs.existsSync(dirPath)) {
    return Response.json(
      {
        error: `Directory not found: ${dirPath}. If it is a network share, make sure it is mounted.`,
      },
      { status: 404 },
    );
  }

  const db = getDb();

  // Save the library path for future syncs
  setSetting(db, "library_path", dirPath);

  const results = { added: 0, linked: 0, skipped: 0, failed: 0, total: 0 };

  function insertAndCount(movie: MovieInput) {
    const existingTargetId = getExistingMovieInsertTargetId(db, movie);
    insertMovie(db, movie);
    if (existingTargetId != null) {
      results.linked++;
    } else {
      results.added++;
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function sendUpdate(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      }

      // Process each file as it's discovered
      for (const file of scanDirectoryGenerator(dirPath)) {
        results.total++;

        // Immediate discovery update
        sendUpdate({
          type: "discovery",
          count: results.total,
          filename: file.filename,
        });

        // Progress update before processing
        sendUpdate({
          type: "progress",
          current: results.total,
          total: results.total, // Total is growing as we discover
          filename: file.filename,
        });

        // Skip if already imported
        if (getMovieByFilePath(db, file.filePath)) {
          results.skipped++;
        } else {
          const linkedRowId = linkToExistingPathlessRow(db, file, null);
          const shouldEnrichLinkedRow =
            linkedRowId != null && movieNeedsTmdbEnrichment(db, linkedRowId);

          if (linkedRowId != null && !shouldEnrichLinkedRow) {
            results.linked++;
            continue;
          }

          // Search TMDb for metadata
          try {
            const searchResults = await searchTmdb(
              file.parsedTitle,
              file.parsedYear,
            );
            const { strongMatch, fallbackMatch } = selectTmdbSearchCandidates(
              searchResults,
              file.parsedTitle,
              file.parsedYear,
            );

            if (linkedRowId != null) {
              if (strongMatch) {
                enrichMovieMetadata(db, linkedRowId, {
                  title: strongMatch.title,
                  year: strongMatch.year,
                  genre: strongMatch.genre,
                  director: null,
                  rating: strongMatch.rating,
                  poster_url: strongMatch.poster_url,
                  source: "tmdb",
                  imdb_id: strongMatch.imdb_id,
                  tmdb_id: strongMatch.tmdb_id,
                  type: "movie",
                });
              }
              results.linked++;
              continue;
            }

            if (linkToExistingPathlessRow(db, file, strongMatch)) {
              results.linked++;
              continue;
            }

            if (fallbackMatch) {
              insertAndCount({
                title: fallbackMatch.title,
                year: fallbackMatch.year,
                genre: fallbackMatch.genre,
                director: null,
                rating: fallbackMatch.rating,
                poster_url: fallbackMatch.poster_url,
                source: "tmdb",
                imdb_id: fallbackMatch.imdb_id,
                tmdb_id: fallbackMatch.tmdb_id,
                type: "movie",
                file_path: file.filePath,
              });
            } else {
              // Add with parsed info only (no TMDb match)
              insertAndCount({
                title: file.parsedTitle,
                year: file.parsedYear,
                genre: null,
                director: null,
                rating: null,
                poster_url: null,
                source: "local",
                imdb_id: null,
                tmdb_id: null,
                type: "movie",
                file_path: file.filePath,
              });
            }
          } catch {
            if (linkedRowId != null) {
              results.linked++;
              continue;
            }
            results.failed++;
          }
        }
      }

      // Final result
      sendUpdate({ type: "complete", ...results });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}
