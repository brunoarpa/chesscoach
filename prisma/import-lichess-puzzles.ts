/**
 * Import curated tactics from the Lichess open puzzle database into the Puzzle table.
 *
 * The database is CC0 / public domain (https://database.lichess.org/#puzzles), so no
 * attribution is legally required, but we still keep each puzzle's Lichess id in
 * `externalId` for provenance and to make re-runs idempotent.
 *
 * You download the file yourself (it is a ~1 GB zstd CSV, ~5 M rows):
 *
 *   curl -O https://database.lichess.org/lichess_db_puzzle.csv.zst
 *
 * Then point this at it. It streams a `.zst` directly through the `zstd` CLI (so no
 * 1 GB temp file), or reads a plain decompressed `.csv`:
 *
 *   npx tsx prisma/import-lichess-puzzles.ts ~/Downloads/lichess_db_puzzle.csv.zst            # dry run, writes nothing
 *   npx tsx prisma/import-lichess-puzzles.ts ~/Downloads/lichess_db_puzzle.csv.zst --commit   # actually insert
 *
 * How the formats line up. A Lichess row is:
 *
 *   PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags
 *
 * and by Lichess convention `FEN` is the position BEFORE the puzzle, `Moves[0]` is the
 * opponent's lead-in move that is played automatically, and `Moves[1..]` is the line
 * the solver has to find. That maps straight onto our model:
 *
 *   setupFen   = FEN
 *   setupMove  = SAN(Moves[0])
 *   fen        = position after Moves[0]
 *   sideToMove = whose turn after the lead-in (the solver)
 *   solution   = SAN(Moves[1..])   (even index = solver move, odd = auto-played reply)
 *
 * The puzzles are added ALONGSIDE any existing ones, appended to the end of each
 * tier's ladder. Nothing is deleted.
 */

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Chess } from "chess.js";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import "dotenv/config";
import { puzzleSlug } from "../src/lib/puzzles";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// --- tuning -----------------------------------------------------------------

const PER_TIER = 50;

// Rating buckets -> difficulty. Shifted up from a beginner spread: the low bands
// (a sub-1000 mate-in-1 is trivial) made Warm-up and Sharp too obvious. These are
// Lichess puzzle ratings, which run a touch higher than chess.com player strength.
//
// `maxPlies` is the longest solution (in half-moves) a tier accepts. It is a cap,
// not a target: within a tier the picks are spread across every length up to it, so
// a tier is a mix of 1-move, 2-move, ... puzzles rather than all the same depth.
const TIERS: { difficulty: number; min: number; max: number; maxPlies: number }[] = [
  { difficulty: 1, min: 1200, max: 1500, maxPlies: 3 }, // Warm-up: 1-2 solver moves
  { difficulty: 2, min: 1500, max: 1800, maxPlies: 5 }, // Sharp: 1-3
  { difficulty: 3, min: 1800, max: 2100, maxPlies: 7 }, // Tricky: up to 4
  { difficulty: 4, min: 2100, max: 2400, maxPlies: 9 }, // Brutal: up to 5
  { difficulty: 5, min: 2400, max: 10000, maxPlies: 11 }, // Brilliant: up to 6
];

// Quality gate. Popularity is Lichess's upvote score (-100..100); NbPlays is how
// many times it has been served (proxy for how vetted it is); RatingDeviation low
// means the rating is well-calibrated. Kept modest so the 2200+ tier, which has far
// fewer heavily-played puzzles, still fills up; ranking by NbPlays does the real
// curation.
const MIN_POPULARITY = 80;
const MIN_PLAYS = 200;
const MAX_RATING_DEVIATION = 90;

// --- csv streaming ----------------------------------------------------------

function openLines(path: string) {
  if (path.endsWith(".zst")) {
    const zstd = spawn("zstd", ["-dc", path], { stdio: ["ignore", "pipe", "inherit"] });
    zstd.on("error", (err) => {
      console.error(
        `\nCould not run \`zstd\` to read ${path}: ${err.message}\n` +
          "Install it (macOS: brew install zstd) or decompress first with `zstd -d file.zst`.",
      );
      process.exit(1);
    });
    return createInterface({ input: zstd.stdout!, crlfDelay: Infinity });
  }
  return createInterface({ input: createReadStream(path), crlfDelay: Infinity });
}

interface Row {
  id: string;
  fen: string;
  moves: string[];
  rating: number;
  ratingDeviation: number;
  popularity: number;
  nbPlays: number;
  themes: string;
  openingTags: string;
}

// FEN/moves/URL never contain commas and the space-separated fields are quote-free,
// so a plain split is safe for this dataset.
function parseRow(line: string): Row | null {
  const f = line.split(",");
  if (f.length < 8) return null;
  return {
    id: f[0],
    fen: f[1],
    moves: f[2].split(" ").filter(Boolean),
    rating: Number(f[3]),
    ratingDeviation: Number(f[4]),
    popularity: Number(f[5]),
    nbPlays: Number(f[6]),
    themes: f[7] ?? "",
    openingTags: f[9] ?? "",
  };
}

// --- transform --------------------------------------------------------------

function uciToMoveArg(uci: string) {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4, 5) || undefined };
}

interface Derived {
  fen: string;
  solution: string[];
  sideToMove: "w" | "b";
  setupFen: string;
  setupMove: string;
}

/**
 * Replay the Lichess line to our stored shape, or return null if any move is
 * illegal from the given position (a handful of DB rows don't validate cleanly and
 * are simply skipped).
 */
function derive(row: Row): Derived | null {
  if (row.moves.length < 2) return null; // need a lead-in + at least one solver move
  const board = new Chess();
  try {
    board.load(row.fen);
  } catch {
    return null;
  }

  const lead = board.move(uciToMoveArg(row.moves[0]));
  if (!lead) return null;

  const fen = board.fen();
  const sideToMove = board.turn();
  const solution: string[] = [];
  for (const uci of row.moves.slice(1)) {
    const m = board.move(uciToMoveArg(uci));
    if (!m) return null;
    solution.push(m.san);
  }

  return { fen, solution, sideToMove, setupFen: row.fen, setupMove: lead.san };
}

// A short, SEO-friendly title from the opening ("Italian Game") or, failing that,
// the most descriptive theme ("Mate in 2", "Fork"). Feeds puzzleSlug().
const THEME_LABELS: Record<string, string> = {
  mateIn1: "Mate in 1",
  mateIn2: "Mate in 2",
  mateIn3: "Mate in 3",
  mateIn4: "Mate in 4",
  fork: "Fork",
  pin: "Pin",
  skewer: "Skewer",
  discoveredAttack: "Discovered Attack",
  sacrifice: "Sacrifice",
  deflection: "Deflection",
  doubleCheck: "Double Check",
  hangingPiece: "Hanging Piece",
  backRankMate: "Back Rank Mate",
  smotheredMate: "Smothered Mate",
  trappedPiece: "Trapped Piece",
  attraction: "Attraction",
};

function titleFor(row: Row): string | null {
  const opening = row.openingTags.split(" ").filter(Boolean)[0];
  if (opening) return opening.replace(/_/g, " ");
  for (const key of Object.keys(THEME_LABELS)) {
    if (row.themes.split(" ").includes(key)) return THEME_LABELS[key];
  }
  return null;
}

// --- select -----------------------------------------------------------------

type Candidate = Row & { derived: Derived; title: string | null };

async function main() {
  const path = process.argv[2];
  const commit = process.argv.includes("--commit");
  if (!path) {
    console.error("Usage: npx tsx prisma/import-lichess-puzzles.ts <lichess_db_puzzle.csv[.zst]> [--commit]");
    process.exit(1);
  }

  // For each tier keep the most-played candidates bucketed by solution length (in
  // solver moves), so the final pick can spread across lengths instead of being all
  // one-movers. Bucketing before trimming is what protects the longer puzzles: they
  // get fewer plays, so a single play-ranked pool would drop them all. Each bucket
  // is capped so memory stays flat over 6 M rows.
  const BUCKET_CAP = PER_TIER * 2;
  const pools = new Map<number, Map<number, Candidate[]>>(
    TIERS.map((t) => [t.difficulty, new Map<number, Candidate[]>()]),
  );
  const byPlays = (a: Candidate, b: Candidate) => b.nbPlays - a.nbPlays || b.popularity - a.popularity;
  const solverMovesOf = (c: Candidate) => Math.ceil(c.derived.solution.length / 2);

  let scanned = 0;
  const rl = openLines(path);
  for await (const line of rl) {
    if (!line || line.startsWith("PuzzleId,")) continue;
    scanned++;
    if (scanned % 500000 === 0) console.log(`  scanned ${scanned.toLocaleString()} rows...`);

    const row = parseRow(line);
    if (!row) continue;
    if (!Number.isFinite(row.rating)) continue;
    if (row.popularity < MIN_POPULARITY) continue;
    if (row.nbPlays < MIN_PLAYS) continue;
    if (row.ratingDeviation > MAX_RATING_DEVIATION) continue;

    const tier = TIERS.find((t) => row.rating >= t.min && row.rating < t.max);
    if (!tier) continue;
    // moves = lead-in + solution, so solution plies = moves.length - 1.
    if (row.moves.length - 1 > tier.maxPlies) continue;

    const derived = derive(row);
    if (!derived) continue;

    const cand: Candidate = { ...row, derived, title: titleFor(row) };
    const buckets = pools.get(tier.difficulty)!;
    const len = solverMovesOf(cand);
    let bucket = buckets.get(len);
    if (!bucket) buckets.set(len, (bucket = []));
    bucket.push(cand);
    if (bucket.length > BUCKET_CAP) {
      bucket.sort(byPlays);
      bucket.length = BUCKET_CAP;
    }
  }

  console.log(`Scanned ${scanned.toLocaleString()} rows.\n`);

  // Final pick: top PER_TIER per tier, skipping any Lichess id already imported.
  const existing = new Set(
    (
      await prisma.puzzle.findMany({
        where: { externalId: { not: null } },
        select: { externalId: true },
      })
    ).map((p) => p.externalId!),
  );

  let created = 0;
  for (const tier of TIERS) {
    // Round-robin across the length buckets (1-move, 2-move, ...), most-played first
    // within each, so the tier ends up an even mix of lengths rather than all the
    // shortest. If a length runs dry the others carry the rest.
    const buckets = pools.get(tier.difficulty)!;
    const available = new Map(
      [...buckets].map(([len, arr]) => [
        len,
        [...arr].sort(byPlays).filter((c) => !existing.has(c.id)),
      ]),
    );
    const lengths = [...available.keys()].sort((a, b) => a - b);
    const picks: Candidate[] = [];
    for (let round = 0; picks.length < PER_TIER && lengths.some((l) => available.get(l)!.length); round++) {
      const arr = available.get(lengths[round % lengths.length])!;
      if (arr.length) picks.push(arr.shift()!);
    }

    // Append after whatever is already in the tier so the existing ladder is untouched.
    const last = await prisma.puzzle.findFirst({
      where: { difficulty: tier.difficulty },
      orderBy: { orderIndex: "desc" },
      select: { orderIndex: true },
    });
    let orderIndex = last?.orderIndex ?? 0;

    const rows = picks.map((c) => {
      orderIndex++;
      return {
        // The opening/theme feeds the SEO slug, but is NOT stored as the display
        // title: on screen a puzzle is just "Tier #N" so the name never spoils the
        // answer (e.g. "Mate in 2").
        slug: puzzleSlug(tier.difficulty, orderIndex, c.title),
        externalId: c.id,
        difficulty: tier.difficulty,
        orderIndex,
        fen: c.derived.fen,
        solution: c.derived.solution,
        sideToMove: c.derived.sideToMove,
        setupFen: c.derived.setupFen,
        setupMove: c.derived.setupMove,
        title: null,
        theme: c.themes || null,
        sourcePgn: null,
        published: true,
      };
    });

    console.log(
      `Tier ${tier.difficulty} (${tier.min}-${tier.max}): ${rows.length} to add` +
        (rows.length < PER_TIER ? "  <- below target, loosen the gate to fill" : ""),
    );
    if (rows[0]) console.log(`   e.g. ${rows[0].slug}  ${rows[0].setupMove} -> ${rows[0].solution.join(" ")}`);

    if (commit && rows.length) {
      const res = await prisma.puzzle.createMany({ data: rows, skipDuplicates: true });
      created += res.count;
    }
  }

  if (commit) {
    console.log(`\nInserted ${created} puzzles.`);
  } else {
    console.log(`\nDry run - nothing written. Re-run with --commit to insert.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
