// A* 寻路 — 使用秘境动态网格（0=可走，1=墙）。

import { TILE } from "../constants.js";

const NEIGHBORS = [
  [0, 1], [0, -1], [1, 0], [-1, 0],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

let _grid = null;
let _cols = 0;
let _rows = 0;

export function setWalkGrid(grid, cols, rows) {
  _grid = grid;
  _cols = cols;
  _rows = rows;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function worldToTile(x, y) {
  return {
    col: clamp(Math.floor(x / TILE), 0, _cols - 1),
    row: clamp(Math.floor(y / TILE), 0, _rows - 1),
  };
}

export function tileToWorld(col, row) {
  return { x: col * TILE + TILE / 2, y: row * TILE + TILE / 2 };
}

function isWalkable(col, row) {
  if (!_grid || col < 0 || row < 0 || col >= _cols || row >= _rows) return false;
  return _grid[row][col] === 0;
}

function heuristic(a, b) {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
}

function key(col, row) {
  return `${col},${row}`;
}

/** 返回世界坐标路点数组（不含起点，含终点）。找不到路返回 []。 */
export function findPathWorld(startX, startY, endX, endY) {
  const start = worldToTile(startX, startY);
  const end = worldToTile(endX, endY);

  if (!isWalkable(start.col, start.row) || !isWalkable(end.col, end.row)) {
    return [];
  }
  if (start.col === end.col && start.row === end.row) {
    return [tileToWorld(end.col, end.row)];
  }

  const open = [{ col: start.col, row: start.row, g: 0, f: heuristic(start, end) }];
  const openSet = new Set([key(start.col, start.row)]);
  const cameFrom = new Map();
  const gScore = new Map([[key(start.col, start.row), 0]]);

  let guard = 0;
  while (open.length > 0 && guard++ < 1200) {
    open.sort((a, b) => a.f - b.f);
    const current = open.shift();
    const ck = key(current.col, current.row);
    openSet.delete(ck);

    if (current.col === end.col && current.row === end.row) {
      const tiles = [];
      let cur = ck;
      while (cameFrom.has(cur)) {
        const [c, r] = cur.split(",").map(Number);
        tiles.unshift({ col: c, row: r });
        cur = cameFrom.get(cur);
      }
      return tiles.map(t => tileToWorld(t.col, t.row));
    }

    for (const [dc, dr] of NEIGHBORS) {
      const nc = current.col + dc;
      const nr = current.row + dr;
      const nk = key(nc, nr);
      if (!isWalkable(nc, nr)) continue;

      if (dc !== 0 && dr !== 0) {
        if (!isWalkable(current.col + dc, current.row) ||
            !isWalkable(current.col, current.row + dr)) continue;
      }

      const stepCost = dc !== 0 && dr !== 0 ? 1.414 : 1;
      const tentative = (gScore.get(ck) ?? Infinity) + stepCost;
      if (tentative >= (gScore.get(nk) ?? Infinity)) continue;

      cameFrom.set(nk, ck);
      gScore.set(nk, tentative);
      const f = tentative + heuristic({ col: nc, row: nr }, end);
      if (!openSet.has(nk)) {
        open.push({ col: nc, row: nr, g: tentative, f });
        openSet.add(nk);
      }
    }
  }

  return [];
}
