// Phaser 启动入口（Phase 0）。
// Phaser 通过 CDN 以全局变量方式引入，这里直接使用全局 `Phaser`。

import BootScene from "./scenes/BootScene.js";
import TitleScene from "./scenes/TitleScene.js";
import TownScene from "./scenes/TownScene.js";
import DungeonScene from "./scenes/DungeonScene.js";
import UIScene from "./scenes/UIScene.js";
import { COLORS } from "./constants.js";

if (typeof Phaser === "undefined") {
  const root = document.getElementById("game-root");
  if (root) {
    root.innerHTML =
      "<p style='color:#d04040;padding:24px;font-family:Microsoft YaHei,sans-serif'>" +
      "Phaser 引擎加载失败，请刷新页面或检查网络连接。</p>";
  }
  throw new Error("Phaser not loaded");
}

const config = {
  type: Phaser.AUTO,
  parent: "game-root",
  width: 960,
  height: 600,
  backgroundColor: COLORS.bg,
  pixelArt: true,
  physics: {
    default: "arcade",
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, TitleScene, TownScene, DungeonScene, UIScene],
};

// eslint-disable-next-line no-new
new Phaser.Game(config);
