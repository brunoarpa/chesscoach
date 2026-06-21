import { Chess } from "chess.js";

// A move-variation tree (chess.com-style branches). Each node holds the SAN of
// the move that reached it from its parent's position. `children[0]` is the main
// continuation; any further children are variations (alternatives to children[0]).
// The root node carries no move (san === "") and represents the start position.
export interface MoveNode {
  id: string;
  san: string;
  parentId: string | null;
  children: string[];
}

export interface MoveTree {
  rootId: string;
  nodes: Record<string, MoveNode>;
  // Starting position the root represents. Absent means the standard initial
  // position; a FEN here lets a tree begin from an arbitrary uploaded position.
  startFen?: string;
}

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createTree(startFen?: string): MoveTree {
  const rootId = newId();
  const tree: MoveTree = {
    rootId,
    nodes: { [rootId]: { id: rootId, san: "", parentId: null, children: [] } },
  };
  // Only record a custom starting position; a standard start stays implicit so
  // existing trees and PGN round-trips are unchanged.
  if (startFen && startFen.trim()) tree.startFen = startFen.trim();
  return tree;
}

// Build a tree whose root is an arbitrary uploaded position. Returns null when
// the FEN is not a legal position.
export function fenToTree(fen: string): MoveTree | null {
  const trimmed = fen.trim();
  try {
    new Chess(trimmed);
  } catch {
    return null;
  }
  return createTree(trimmed);
}

// SANs from the root down to `nodeId` (root excluded), in play order.
export function sanPath(tree: MoveTree, nodeId: string): string[] {
  const path: string[] = [];
  let cur: MoveNode | undefined = tree.nodes[nodeId];
  while (cur && cur.parentId !== null) {
    path.push(cur.san);
    cur = tree.nodes[cur.parentId];
  }
  return path.reverse();
}

// Depth = number of half-moves (plies) from the root. Root is 0.
export function plyOf(tree: MoveTree, nodeId: string): number {
  let depth = 0;
  let cur: MoveNode | undefined = tree.nodes[nodeId];
  while (cur && cur.parentId !== null) {
    depth++;
    cur = tree.nodes[cur.parentId];
  }
  return depth;
}

export function gameAtNode(tree: MoveTree, nodeId: string): Chess {
  let g: Chess;
  try {
    g = new Chess(tree.startFen);
  } catch {
    g = new Chess();
  }
  for (const san of sanPath(tree, nodeId)) {
    try {
      g.move(san);
    } catch {
      break;
    }
  }
  return g;
}

export function fenAtNode(tree: MoveTree, nodeId: string): string {
  return gameAtNode(tree, nodeId).fen();
}

// Add `san` as a move from `nodeId`. If that move already exists as a child we
// just return its id (so replaying a known line never duplicates nodes); the
// first new move from a node with existing children becomes a variation.
export function addMove(
  tree: MoveTree,
  nodeId: string,
  san: string
): { tree: MoveTree; nodeId: string } {
  const parent = tree.nodes[nodeId];
  if (!parent) return { tree, nodeId };

  const existing = parent.children.find((cid) => tree.nodes[cid]?.san === san);
  if (existing) return { tree, nodeId: existing };

  const id = newId();
  const child: MoveNode = { id, san, parentId: nodeId, children: [] };
  return {
    tree: {
      ...tree,
      nodes: {
        ...tree.nodes,
        [id]: child,
        [nodeId]: { ...parent, children: [...parent.children, id] },
      },
    },
    nodeId: id,
  };
}

export function mainlineForward(tree: MoveTree, nodeId: string): string | null {
  return tree.nodes[nodeId]?.children[0] ?? null;
}

// Follow the main continuation (children[0]) to the leaf of the current line.
export function endOfLine(tree: MoveTree, nodeId: string): string {
  let cur = nodeId;
  let next = mainlineForward(tree, cur);
  while (next) {
    cur = next;
    next = mainlineForward(tree, cur);
  }
  return cur;
}

// SANs of the main line from the root to its end.
export function mainlineSans(tree: MoveTree): string[] {
  return sanPath(tree, endOfLine(tree, tree.rootId));
}

// Mainline-only PGN, used for backward-compatible persistence in `boardPgn`.
export function treeToMainlinePgn(tree: MoveTree): string {
  const moves = mainlineSans(tree);
  let pgn = "";
  for (let i = 0; i < moves.length; i++) {
    if (i % 2 === 0) pgn += `${Math.floor(i / 2) + 1}. `;
    pgn += `${moves[i]} `;
  }
  return pgn.trim();
}

// Hydrate a (linear) tree from a plain PGN - used for lessons persisted before
// the tree existed, where only `boardPgn` is available.
export function pgnToTree(pgn: string): MoveTree {
  let tree = createTree();
  if (!pgn || !pgn.trim()) return tree;

  let history: string[] = [];
  try {
    const g = new Chess();
    g.loadPgn(pgn);
    history = g.history();
  } catch {
    return tree;
  }

  let cur = tree.rootId;
  for (const san of history) {
    const res = addMove(tree, cur, san);
    tree = res.tree;
    cur = res.nodeId;
  }
  return tree;
}

// Make `nodeId` the main continuation (children[0]) of its parent.
export function promoteVariation(tree: MoveTree, nodeId: string): MoveTree {
  const node = tree.nodes[nodeId];
  if (!node || node.parentId === null) return tree;
  const parent = tree.nodes[node.parentId];
  const idx = parent.children.indexOf(nodeId);
  if (idx <= 0) return tree; // already main, or missing
  const children = [nodeId, ...parent.children.filter((c) => c !== nodeId)];
  return {
    ...tree,
    nodes: { ...tree.nodes, [parent.id]: { ...parent, children } },
  };
}

// Delete `nodeId` and its whole subtree; returns the parent as the new position.
export function deleteSubtree(
  tree: MoveTree,
  nodeId: string
): { tree: MoveTree; nodeId: string } {
  const node = tree.nodes[nodeId];
  if (!node || node.parentId === null) return { tree, nodeId }; // never delete root

  const nodes = { ...tree.nodes };
  const stack = [nodeId];
  while (stack.length) {
    const id = stack.pop()!;
    const n = nodes[id];
    if (!n) continue;
    stack.push(...n.children);
    delete nodes[id];
  }
  const parent = nodes[node.parentId];
  nodes[node.parentId] = {
    ...parent,
    children: parent.children.filter((c) => c !== nodeId),
  };
  return { tree: { rootId: tree.rootId, nodes }, nodeId: node.parentId };
}

// Validate an untrusted value (from the DB or a remote peer) as a MoveTree.
// Returns null when the shape is wrong so callers can fall back to a fresh tree.
export function sanitizeTree(value: unknown): MoveTree | null {
  if (!value || typeof value !== "object") return null;
  const t = value as Partial<MoveTree>;
  if (typeof t.rootId !== "string" || !t.nodes || typeof t.nodes !== "object") {
    return null;
  }
  const root = t.nodes[t.rootId];
  if (!root || root.parentId !== null) return null;
  for (const [id, node] of Object.entries(t.nodes)) {
    if (
      !node ||
      node.id !== id ||
      typeof node.san !== "string" ||
      !Array.isArray(node.children)
    ) {
      return null;
    }
  }
  const sanitized: MoveTree = { rootId: t.rootId, nodes: t.nodes };
  // Carry over a custom starting position only when it is a legal FEN, so a
  // malformed value from the DB or a peer falls back to the standard start
  // rather than breaking gameAtNode.
  if (typeof t.startFen === "string" && t.startFen.trim()) {
    try {
      new Chess(t.startFen.trim());
      sanitized.startFen = t.startFen.trim();
    } catch {
      // ignore invalid FEN
    }
  }
  return sanitized;
}
