// BootScene：Phase 0 不加载外部美术，仅用 Graphics 生成占位纹理。
// 后续阶段在此预加载真正的精灵图集 / tileset / 音频。

import { TILE, COLORS } from "../constants.js";

export default class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  preload() {
    this._makeRectTexture("tile_floor", TILE, TILE, COLORS.floor, COLORS.floorAlt);
    this._makeRectTexture("tile_floor_alt", TILE, TILE, COLORS.floorAlt, COLORS.floor);
    this._makeRectTexture("tile_wall", TILE, TILE, COLORS.wall, COLORS.wallTop);
    this._makePlayerTexture();

    // 怪物占位纹理：普通 / 精英 / BOSS。
    this._makeRectTexture("enemy_normal", TILE - 8, TILE - 8, 0x8a3a3a, 0xc05a5a);
    this._makeRectTexture("enemy_elite", TILE - 2, TILE - 2, 0x7a3a8a, 0xb05ac0);
    this._makeRectTexture("enemy_boss", TILE + 10, TILE + 10, 0x9a2a2a, 0xff5a3a);
  }

  create() {
    this.scene.start("TitleScene");
  }

  // 生成带描边的方块纹理（占位）。
  _makeRectTexture(key, w, h, fill, border) {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(fill, 1);
    g.fillRect(0, 0, w, h);
    g.lineStyle(1, border, 0.6);
    g.strokeRect(0.5, 0.5, w - 1, h - 1);
    g.generateTexture(key, w, h);
    g.destroy();
  }

  // 玩家占位：金色圆角块 + 朝向小三角。
  _makePlayerTexture() {
    const size = TILE - 6;
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(COLORS.player, 1);
    g.fillRoundedRect(0, 0, size, size, 5);
    g.lineStyle(2, 0x000000, 0.4);
    g.strokeRoundedRect(1, 1, size - 2, size - 2, 5);
    g.generateTexture("player", size, size);
    g.destroy();
  }
}
