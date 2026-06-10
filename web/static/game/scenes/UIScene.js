// UIScene：与 DungeonScene 并行运行的独立 UI 层（不受地牢相机缩放影响）。
// 承载 HUD（血条/资源条）、SkillBar（技能槽 Q/E/R/F）和暂停菜单。

import Hud from "../ui/Hud.js";
import SkillBar from "../ui/SkillBar.js";

const FONT = "Microsoft YaHei, sans-serif";

export default class UIScene extends Phaser.Scene {
  constructor() {
    super("UIScene");
  }

  init(data) {
    this.character = data && data.character ? data.character : null;
    this.skills = data && data.skills ? data.skills : [];
    this._paused = false;
    this._pauseObjs = [];
    this.hud = null;
    this.skillBar = null;
    this._escHandler = null;
  }

  create() {
    if (this.character) {
      this.hud = new Hud(this, this.character);
    }
    if (this.skills.length > 0) {
      this.skillBar = new SkillBar(this, this.skills);
    }
    this._buildPauseBtn();
  }

  // ── 暂停按钮 ──────────────────────────────
  _buildPauseBtn() {
    const W = this.scale.width;
    const btn = this.add.text(W - 12, 10, "≡", {
      fontFamily: FONT, fontSize: "22px", color: "#c9a227",
      backgroundColor: "#1a1820cc", padding: { x: 8, y: 4 },
    }).setOrigin(1, 0).setDepth(500).setInteractive({ useHandCursor: true });

    btn.on("pointerover", () => btn.setStyle({ backgroundColor: "#2a2840cc" }));
    btn.on("pointerout", () => btn.setStyle({ backgroundColor: "#1a1820cc" }));
    btn.on("pointerdown", () => this._togglePause());
    this._pauseBtn = btn;

    // ESC 键也触发暂停菜单（保存引用以便 shutdown 时移除）
    this._escHandler = () => this._togglePause();
    this.input.keyboard.on("keydown-ESC", this._escHandler);
  }

  shutdown() {
    this._hidePauseMenu();
    if (this._escHandler && this.input?.keyboard) {
      this.input.keyboard.off("keydown-ESC", this._escHandler);
      this._escHandler = null;
    }
    const dungeon = this.scene.get("DungeonScene");
    if (dungeon?.scene?.isPaused()) dungeon.scene.resume();
  }

  _togglePause() {
    if (this._paused) {
      this._hidePauseMenu();
    } else {
      this._showPauseMenu();
    }
  }

  _showPauseMenu() {
    if (this._paused) return;
    this._paused = true;

    const dungeon = this.scene.get("DungeonScene");
    if (dungeon) dungeon.scene.pause();

    const W = this.scale.width, H = this.scale.height;
    const pw = 300, ph = 200;
    const px = (W - pw) / 2, py = (H - ph) / 2;
    const D = 600;

    const overlay = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.55).setDepth(D);
    const panel = this.add.rectangle(px, py, pw, ph, 0x1a1820, 0.98)
      .setOrigin(0, 0).setDepth(D + 1).setStrokeStyle(2, 0xc9a227);
    const title = this.add.text(W / 2, py + 20, "已暂停", {
      fontFamily: FONT, fontSize: "20px", color: "#c9a227",
    }).setOrigin(0.5, 0).setDepth(D + 2);

    const mkBtn = (label, y, color, bg, cb) => {
      const b = this.add.text(W / 2, py + y, label, {
        fontFamily: FONT, fontSize: "16px", color,
        backgroundColor: bg, padding: { x: 24, y: 10 },
      }).setOrigin(0.5, 0).setDepth(D + 2).setInteractive({ useHandCursor: true });
      b.on("pointerover", () => b.setAlpha(0.8));
      b.on("pointerout", () => b.setAlpha(1));
      b.on("pointerdown", cb);
      return b;
    };

    const resumeBtn = mkBtn("继续游戏", 64, "#0f0e12", "#c9a227", () => this._hidePauseMenu());
    const townBtn = mkBtn("返回城镇", 116, "#e8e0d5", "#2a2040", () => {
      this._hidePauseMenu();
      const d = this.scene.get("DungeonScene");
      if (d) {
        if (d.scene.isPaused()) d.scene.resume();
        this.scene.stop("UIScene");
        d.scene.start("TownScene", { character: d.character });
      }
    });

    this._pauseObjs = [overlay, panel, title, resumeBtn, townBtn];
  }

  _hidePauseMenu() {
    this._paused = false;
    this._pauseObjs.forEach(o => o.destroy?.());
    this._pauseObjs = [];

    const dungeon = this.scene.get("DungeonScene");
    if (dungeon) dungeon.scene.resume();
  }

  // ── 公开方法（供 DungeonScene 调用）──────────
  initSkills(skills) {
    this.skills = skills;
    if (!this.skillBar && skills.length > 0) {
      this.skillBar = new SkillBar(this, skills);
    }
  }

  updateCharacter(character) {
    this.character = character;
    if (this.hud) this.hud.update(character);
  }

  update(time) {
    if (!this._paused && this.skillBar && this.skills.length > 0) {
      this.skillBar.update(time, this.skills);
    }
  }
}
