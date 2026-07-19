-- CreateTable
CREATE TABLE "Puzzle" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "difficulty" INTEGER NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "fen" TEXT NOT NULL,
    "solution" TEXT[],
    "sideToMove" TEXT NOT NULL,
    "title" TEXT,
    "theme" TEXT,
    "sourcePgn" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Puzzle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PuzzleSolve" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "puzzleId" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "solvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PuzzleSolve_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Puzzle_slug_key" ON "Puzzle"("slug");

-- CreateIndex
CREATE INDEX "Puzzle_difficulty_orderIndex_idx" ON "Puzzle"("difficulty", "orderIndex");

-- CreateIndex
CREATE INDEX "Puzzle_published_idx" ON "Puzzle"("published");

-- CreateIndex
CREATE INDEX "PuzzleSolve_userId_idx" ON "PuzzleSolve"("userId");

-- CreateIndex
CREATE INDEX "PuzzleSolve_puzzleId_idx" ON "PuzzleSolve"("puzzleId");

-- CreateIndex
CREATE UNIQUE INDEX "PuzzleSolve_userId_puzzleId_key" ON "PuzzleSolve"("userId", "puzzleId");

-- AddForeignKey
ALTER TABLE "PuzzleSolve" ADD CONSTRAINT "PuzzleSolve_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PuzzleSolve" ADD CONSTRAINT "PuzzleSolve_puzzleId_fkey" FOREIGN KEY ("puzzleId") REFERENCES "Puzzle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

