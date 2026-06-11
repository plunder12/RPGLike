#!/usr/bin/env python3
"""切分 AI 原始图集、去背、缩放，输出到 output/ 目录。"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import yaml
from PIL import Image

ROOT = Path(__file__).resolve().parent

RESAMPLE = {
    "nearest": Image.Resampling.NEAREST,
    "bilinear": Image.Resampling.BILINEAR,
    "lanczos": Image.Resampling.LANCZOS,
}


def load_config() -> dict:
    with (ROOT / "config.yaml").open(encoding="utf-8") as f:
        return yaml.safe_load(f)


def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def split_grid(img: Image.Image, rows: int, cols: int) -> list[list[Image.Image]]:
    """按行列切分，余数像素均摊到前几列/行。"""
    w, h = img.size
    col_widths = [w // cols] * cols
    row_heights = [h // rows] * rows
    for i in range(w % cols):
        col_widths[i] += 1
    for i in range(h % rows):
        row_heights[i] += 1

    cells: list[list[Image.Image]] = []
    y = 0
    for rh in row_heights:
        row_cells: list[Image.Image] = []
        x = 0
        for cw in col_widths:
            row_cells.append(img.crop((x, y, x + cw, y + rh)))
            x += cw
        cells.append(row_cells)
        y += rh
    return cells


def remove_dark_background(img: Image.Image, threshold: int) -> Image.Image:
    rgba = img.convert("RGBA")
    px = rgba.load()
    w, h = rgba.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if r <= threshold and g <= threshold and b <= threshold:
                px[x, y] = (0, 0, 0, 0)
    return rgba


def fit_frame(img: Image.Image, size: int, resample: Image.Resampling) -> Image.Image:
    """裁切透明边距后等比缩放，居中放入固定尺寸画布。"""
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    if img.width == 0 or img.height == 0:
        return canvas
    scale = min(size / img.width, size / img.height)
    nw = max(1, round(img.width * scale))
    nh = max(1, round(img.height * scale))
    resized = img.resize((nw, nh), resample)
    ox = (size - nw) // 2
    oy = (size - nh) // 2
    canvas.paste(resized, (ox, oy), resized)
    return canvas


def resize_tile(img: Image.Image, size: int, resample: Image.Resampling) -> Image.Image:
    rgba = img.convert("RGBA")
    return rgba.resize((size, size), resample)


def save_png(img: Image.Image, path: Path) -> None:
    ensure_dir(path.parent)
    img.save(path, format="PNG", compress_level=1)


def process_tiles(cfg: dict, raw_dir: Path, out_dir: Path) -> dict:
    tcfg = cfg["tiles"]
    src = raw_dir / tcfg["source"]
    if not src.exists():
        raise FileNotFoundError(f"缺少地块源图: {src}")

    rows, cols = tcfg["grid"]
    frame_size = tcfg["frame_size"]
    resample = RESAMPLE[tcfg.get("resample", "nearest")]

    tiles_root = ensure_dir(out_dir / "tiles")
    game_tiles = ensure_dir(out_dir / "game_ready" / "tiles")

    img = Image.open(src)
    grid = split_grid(img, rows, cols)

    manifest: dict = {
        "source": tcfg["source"],
        "grid": [rows, cols],
        "frame_size": frame_size,
        "cells": {},
        "aliases": {},
    }

    name_map = {(r, c): name for r, c, name in tcfg["cells"]}

    for r in range(rows):
        for c in range(cols):
            name = name_map.get((r, c), f"tile_{r}_{c}")
            frame = resize_tile(grid[r][c], frame_size, resample)
            save_png(frame, tiles_root / f"{name}.png")
            manifest["cells"][name] = {"row": r, "col": c, "file": f"tiles/{name}.png"}

    for src_name, alias in tcfg.get("aliases", {}).items():
        src_path = tiles_root / f"{src_name}.png"
        if not src_path.exists():
            continue
        dst = game_tiles / f"{alias}.png"
        shutil.copy2(src_path, dst)
        manifest["aliases"][alias] = f"game_ready/tiles/{alias}.png"

    for name in name_map.values():
        src_path = tiles_root / f"{name}.png"
        if src_path.exists():
            shutil.copy2(src_path, game_tiles / f"{name}.png")

    return manifest


def build_spritesheet(frames: list[list[Image.Image]]) -> Image.Image:
    if not frames or not frames[0]:
        raise ValueError("空 spritesheet")
    fw, fh = frames[0][0].size
    cols = len(frames[0])
    rows = len(frames)
    sheet = Image.new("RGBA", (fw * cols, fh * rows), (0, 0, 0, 0))
    for ri, row in enumerate(frames):
        for ci, frame in enumerate(row):
            sheet.paste(frame, (ci * fw, ri * fh), frame)
    return sheet


def process_animated_sheets(
    section_cfg: dict,
    raw_dir: Path,
    out_dir: Path,
    category: str,
    game_subdir: str,
    anim_rates: dict | None = None,
) -> dict:
    """处理角色/怪物等多行 spritesheet。"""
    frame_size = section_cfg["frame_size"]
    resample = RESAMPLE[section_cfg.get("resample", "nearest")]
    bg_threshold = section_cfg.get("bg_threshold", 40)
    row_names: list[str] = section_cfg["rows"]
    rows = len(row_names)
    cols = 4
    default_rates = {"walk": 8, "death": 10}
    rates = {**default_rates, **(anim_rates or {})}

    cat_root = ensure_dir(out_dir / category)
    game_root = ensure_dir(out_dir / "game_ready" / game_subdir)

    manifest: dict = {"frame_size": frame_size, "rows": row_names, category: {}}

    for sheet_cfg in section_cfg["sheets"]:
        src = raw_dir / sheet_cfg["source"]
        if not src.exists():
            raise FileNotFoundError(f"缺少{category}源图: {src}")

        entity_id = sheet_cfg["id"]
        entity_dir = ensure_dir(cat_root / entity_id)
        frames_dir = ensure_dir(entity_dir / "frames")

        img = remove_dark_background(Image.open(src), bg_threshold)
        grid = split_grid(img, rows, cols)

        processed_rows: list[list[Image.Image]] = []
        frame_index: dict = {}

        for ri, row_label in enumerate(row_names):
            row_frames: list[Image.Image] = []
            for ci in range(cols):
                frame = fit_frame(grid[ri][ci], frame_size, resample)
                fname = f"{row_label}_{ci}.png"
                save_png(frame, frames_dir / fname)
                row_frames.append(frame)
                frame_index[f"{row_label}_{ci}"] = f"{category}/{entity_id}/frames/{fname}"
            processed_rows.append(row_frames)

        sheet = build_spritesheet(processed_rows)
        sheet_name = f"{entity_id}.png"
        save_png(sheet, entity_dir / sheet_name)
        shutil.copy2(entity_dir / sheet_name, game_root / sheet_name)

        game_key = section_cfg.get("game_keys", {}).get(entity_id, entity_id)
        if game_key != entity_id:
            shutil.copy2(entity_dir / sheet_name, game_root / f"{game_key}.png")

        anim_meta = {
            "texture": game_key,
            "file": f"{category}/{entity_id}/{sheet_name}",
            "frameWidth": frame_size,
            "frameHeight": frame_size,
            "columns": cols,
            "rows": rows,
            "animations": {
                row_label: {
                    "start": ri * cols,
                    "end": ri * cols + cols - 1,
                    "frameRate": rates.get(row_label, 6),
                    "repeat": 0 if row_label == "death" else (-1 if row_label != "attack" else 0),
                }
                for ri, row_label in enumerate(row_names)
            },
        }
        meta_path = entity_dir / f"{entity_id}.meta.json"
        with meta_path.open("w", encoding="utf-8") as f:
            json.dump(anim_meta, f, ensure_ascii=False, indent=2)

        manifest[category][entity_id] = {
            "display_name": sheet_cfg.get("name", entity_id),
            "source": sheet_cfg["source"],
            "game_key": game_key,
            "sheet": f"{category}/{entity_id}/{sheet_name}",
            "frames": frame_index,
            "meta": f"{category}/{entity_id}/{entity_id}.meta.json",
        }

    return manifest


def process_characters(cfg: dict, raw_dir: Path, out_dir: Path) -> dict:
    return process_animated_sheets(cfg["characters"], raw_dir, out_dir, "characters", "characters")


def process_enemies(cfg: dict, raw_dir: Path, out_dir: Path) -> dict:
    if "enemies" not in cfg:
        return {"frame_size": 0, "rows": [], "enemies": {}}
    return process_animated_sheets(cfg["enemies"], raw_dir, out_dir, "enemies", "enemies", {"attack": 10})


def deploy_to_game(out_dir: Path, game_assets_dir: Path) -> None:
    """将 game_ready 同步到 web/static/game/assets。"""
    src = out_dir / "game_ready"
    if not src.exists():
        return
    for sub in src.iterdir():
        if not sub.is_dir():
            continue
        dst = ensure_dir(game_assets_dir / sub.name)
        for f in sub.glob("*.png"):
            shutil.copy2(f, dst / f.name)


def main() -> None:
    cfg = load_config()
    raw_dir = ROOT / cfg["paths"]["raw_dir"]
    out_dir = ROOT / cfg["paths"]["output_dir"]
    game_assets_dir = ROOT.parent / "web" / "static" / "game" / "assets"

    if out_dir.exists():
        shutil.rmtree(out_dir)
    ensure_dir(out_dir)

    print(f"原始目录: {raw_dir}")
    print(f"输出目录: {out_dir}")
    print()

    tile_manifest = process_tiles(cfg, raw_dir, out_dir)
    char_manifest = process_characters(cfg, raw_dir, out_dir)
    enemy_manifest = process_enemies(cfg, raw_dir, out_dir)

    full_manifest = {
        "tiles": tile_manifest,
        "characters": char_manifest,
        "enemies": enemy_manifest,
    }
    manifest_path = out_dir / "manifest.json"
    with manifest_path.open("w", encoding="utf-8") as f:
        json.dump(full_manifest, f, ensure_ascii=False, indent=2)

    deploy_to_game(out_dir, game_assets_dir)

    print("处理完成:")
    print(f"  地块: {len(tile_manifest['cells'])} 张 → output/tiles/")
    print(f"  游戏别名: {', '.join(tile_manifest['aliases'].keys())} → output/game_ready/tiles/")
    for cid, info in char_manifest["characters"].items():
        print(f"  角色 {info['display_name']} ({cid}): sheet + {len(info['frames'])} 帧")
    for eid, info in enemy_manifest.get("enemies", {}).items():
        print(f"  怪物 {info['display_name']} ({info['game_key']}): sheet + {len(info['frames'])} 帧")
    print(f"  已同步 → {game_assets_dir.relative_to(ROOT.parent)}")
    print(f"  清单: {manifest_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
