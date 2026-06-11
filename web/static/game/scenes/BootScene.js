// BootScene：加载正式美术资源。

import {
  TILE,
  COLORS,
  ASSET_BASE,
  CHAR_FRAME,
  ENEMY_FRAME,
  PLAYER_CLASSES,
  ENEMY_SPRITES,
} from "../constants.js";

const ASSET_VER = "3";

export default class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  preload() {
    this.load.on("loaderror", (file) => {
      console.error("[BootScene] 资源加载失败:", file.key, file.url);
    });

    this._loadTiles();
    this._loadCharacters();
    this._loadEnemies();
  }

  create() {
    this._createCharacterAnims();
    this._createEnemyAnims();
    this._ensureEnemyFallbacks();

    if (!this.textures.exists("barbarian")) {
      this._makePlayerTexture();
    }

    const slimeOk = this.textures.exists("enemy_slime");
    if (slimeOk) {
      const frames = this.textures.get("enemy_slime").frameTotal;
      console.info("[BootScene] enemy_slime 就绪,", frames, "帧");
    } else {
      console.warn("[BootScene] enemy_slime 未加载，普通怪将使用占位方块");
    }

    this.scene.start("TitleScene");
  }

  _assetUrl(subpath) {
    return `${ASSET_BASE}/${subpath}?v=${ASSET_VER}`;
  }

  _loadTiles() {
    for (const key of ["tile_floor", "tile_floor_alt", "tile_wall"]) {
      this.load.image(key, this._assetUrl(`tiles/${key}.png`));
    }
  }

  _loadCharacters() {
    for (const id of PLAYER_CLASSES) {
      this.load.spritesheet(id, this._assetUrl(`characters/${id}.png`), {
        frameWidth: CHAR_FRAME,
        frameHeight: CHAR_FRAME,
      });
    }
  }

  _loadEnemies() {
    for (const key of ENEMY_SPRITES) {
      this.load.spritesheet(key, this._assetUrl(`enemies/${key}.png`), {
        frameWidth: ENEMY_FRAME,
        frameHeight: ENEMY_FRAME,
      });
    }
  }

  /** 仅当史莱姆未加载时，才生成占位方块（精英/BOSS）。 */
  _ensureEnemyFallbacks() {
    if (this.textures.exists("enemy_slime")) {
      if (this.textures.exists("enemy_normal")) {
        this.textures.remove("enemy_normal");
      }
      return;
    }
    this._makeRectTexture("enemy_normal", TILE - 8, TILE - 8, 0x8a3a3a, 0xc05a5a);
    this._makeRectTexture("enemy_elite", TILE - 2, TILE - 2, 0x7a3a8a, 0xb05ac0);
    this._makeRectTexture("enemy_boss", TILE + 10, TILE + 10, 0x9a2a2a, 0xff5a3a);
  }

  _createCharacterAnims() {
    for (const id of PLAYER_CLASSES) {
      if (!this.textures.exists(id)) continue;
      this._registerSheetAnims(id, [
        { suffix: "idle", start: 0, end: 3, frameRate: 6, repeat: -1 },
        { suffix: "walk", start: 4, end: 7, frameRate: 8, repeat: -1 },
        { suffix: "attack", start: 8, end: 11, frameRate: 10, repeat: 0 },
      ]);
    }
  }

  _createEnemyAnims() {
    for (const key of ENEMY_SPRITES) {
      if (!this.textures.exists(key)) continue;
      this._registerSheetAnims(key, [
        { suffix: "idle", start: 0, end: 3, frameRate: 6, repeat: -1 },
        { suffix: "walk", start: 4, end: 7, frameRate: 8, repeat: -1 },
        { suffix: "attack", start: 8, end: 11, frameRate: 10, repeat: 0 },
        { suffix: "death", start: 12, end: 15, frameRate: 10, repeat: 0 },
      ]);
    }
  }

  _registerSheetAnims(textureKey, defs) {
    for (const def of defs) {
      const animKey = `${textureKey}_${def.suffix}`;
      if (this.anims.exists(animKey)) continue;
      this.anims.create({
        key: animKey,
        frames: this.anims.generateFrameNumbers(textureKey, {
          start: def.start,
          end: def.end,
        }),
        frameRate: def.frameRate,
        repeat: def.repeat,
      });
    }
  }

  _makeRectTexture(key, w, h, fill, border) {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(fill, 1);
    g.fillRect(0, 0, w, h);
    g.lineStyle(1, border, 0.6);
    g.strokeRect(0.5, 0.5, w - 1, h - 1);
    g.generateTexture(key, w, h);
    g.destroy();
  }

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
