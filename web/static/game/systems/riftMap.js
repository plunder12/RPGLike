// 秘境分块地图：多套基础地形，左右缺口随机拼接，横向探索。

import { TILE } from "../constants.js";

export const CHUNK_COLS = 18;
export const CHUNK_ROWS = 12;
export const GAP_ROWS = [5, 6, 7];

/** 1=墙 0=地面 */
function shell(rows, cols, fill) {
  const g = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r === 0 || r === rows - 1) g[r][c] = 1;
      else if (c === 0 || c === cols - 1) {
        g[r][c] = GAP_ROWS.includes(r) ? 0 : 1;
      } else {
        g[r][c] = fill(r, c) ? 1 : 0;
      }
    }
  }
  return g;
}

const CHUNK_TEMPLATES = [
  shell(CHUNK_ROWS, CHUNK_COLS, () => false),
  shell(CHUNK_ROWS, CHUNK_COLS, (r, c) => c >= 7 && c <= 10 && r >= 4 && r <= 8),
  shell(CHUNK_ROWS, CHUNK_COLS, (r, c) =>
    (c === 5 && r === 4) || (c === 12 && r === 8) || (c === 8 && r === 3)
  ),
  shell(CHUNK_ROWS, CHUNK_COLS, (r, c) =>
    (r >= 3 && r <= 5 && (c === 4 || c === 13)) ||
    (r >= 7 && r <= 9 && (c === 6 || c === 11))
  ),
  shell(CHUNK_ROWS, CHUNK_COLS, (r, c) =>
    r >= 2 && r <= 9 && c >= 8 && c <= 9
  ),
];

function pickTemplates(count) {
  const pool = [...CHUNK_TEMPLATES];
  const out = [];
  for (let i = 0; i < count; i++) {
    if (pool.length === 0) pool.push(...CHUNK_TEMPLATES);
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

/** 收集左右缺口格（用于 BOSS 阶段封门） */
function collectGapCells(grid, cols, rows, chunkCount) {
  const gaps = [];
  for (let ci = 0; ci < chunkCount; ci++) {
    const leftCol = ci * CHUNK_COLS;
    const rightCol = leftCol + CHUNK_COLS - 1;
    for (const r of GAP_ROWS) {
      if (grid[r][leftCol] === 0) gaps.push({ col: leftCol, row: r });
      if (grid[r][rightCol] === 0) gaps.push({ col: rightCol, row: r });
    }
  }
  return gaps;
}

/**
 * 随机拼接秘境地图。
 * @returns {{ grid, cols, rows, chunkCount, gapCells, chunkOffsets, spawnPoints }}
 */
export function buildRiftMap(chunkCount) {
  const templates = pickTemplates(chunkCount);
  const rows = CHUNK_ROWS;
  const cols = chunkCount * CHUNK_COLS;
  const grid = Array.from({ length: rows }, () => Array(cols).fill(1));

  for (let ci = 0; ci < chunkCount; ci++) {
    const tmpl = templates[ci];
    const ox = ci * CHUNK_COLS;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < CHUNK_COLS; c++) {
        grid[r][ox + c] = tmpl[r][c];
      }
    }
  }

  // 块间接缝：确保通道连通
  for (let ci = 1; ci < chunkCount; ci++) {
    const seam = ci * CHUNK_COLS;
    for (const r of GAP_ROWS) {
      grid[r][seam] = 0;
    }
  }

  const gapCells = collectGapCells(grid, cols, rows, chunkCount);
  const chunkOffsets = Array.from({ length: chunkCount }, (_, i) => i * CHUNK_COLS);

  const floorTiles = [];
  const spawnPoints = [];
  for (let ci = 0; ci < chunkCount; ci++) {
    const spots = [];
    const ox = chunkOffsets[ci];
    for (let r = 1; r < rows - 1; r++) {
      for (let c = ox + 2; c < ox + CHUNK_COLS - 2; c++) {
        if (grid[r][c] === 0) {
          const pt = { x: c * TILE + TILE / 2, y: r * TILE + TILE / 2, col: c, row: r };
          floorTiles.push(pt);
          spots.push(pt);
        }
      }
    }
    spawnPoints.push(spots);
  }

  return {
    grid,
    cols,
    rows,
    chunkCount,
    gapCells,
    chunkOffsets,
    floorTiles,
    spawnPoints,
    width: cols * TILE,
    height: rows * TILE,
  };
}

export function tileCenter(col, row) {
  return { x: col * TILE + TILE / 2, y: row * TILE + TILE / 2 };
}
