// HUD：固定在屏幕上的角色状态显示。
// Phase 1 展示：角色名/等级/职业、血条、资源条、层数、金币。
// 数据当前为静态（进场快照），但接口设计为可 update，供后续实时战斗复用。

const FONT = "Microsoft YaHei, sans-serif";
const DEPTH = 2000;

// 不同职业资源条配色（按 resource_name 粗略映射）。
const RESOURCE_COLORS = {
  怒气: 0xd9534f,
  法力: 0x4a90e2,
  真气: 0xc9a227,
};

export default class Hud {
  constructor(scene, character) {
    this.scene = scene;
    const cam = scene.cameras.main;
    this.viewW = cam.width;
    this.viewH = cam.height;

    this._buildTopInfo();
    this._buildBars(character);
    this.update(character);
  }

  _buildTopInfo() {
    this.nameText = this._text(12, 10, "", 16, "#c9a227");
    this.floorText = this._text(this.viewW - 12, 10, "", 14, "#e8e0d5").setOrigin(1, 0);
    this._buildRiftBar();
  }

  _buildRiftBar() {
    const barW = 280;
    const barH = 14;
    const x = (this.viewW - barW) / 2;
    const y = 38;
    this.riftBarW = barW;
    this.riftLabel = this._text(x + barW / 2, y - 2, "秘境进度", 11, "#9a9088").setOrigin(0.5, 1);
    this._bg(x, y, barW, barH);
    this.riftFill = this._fill(x, y, barW, barH, 0xc9a227);
    this.riftText = this._text(x + barW / 2, y + barH / 2, "0%", 11, "#ffffff").setOrigin(0.5);
  }

  updateRiftProgress(current, quota, phase = "explore") {
    if (!this.riftFill) return;
    const ratio = quota > 0 ? Phaser.Math.Clamp(current / quota, 0, 1) : 0;
    this.riftFill.width = this.riftBarW * ratio;
    const pct = Math.floor(ratio * 100);
    if (phase === "boss") {
      this.riftLabel.setText("首领战");
      this.riftText.setText("BOSS");
      this.riftFill.setFillStyle(0xd9534f);
    } else {
      this.riftLabel.setText("秘境进度");
      this.riftText.setText(`${pct}%  (${current}/${quota})`);
      this.riftFill.setFillStyle(0xc9a227);
    }
  }

  _buildBars(character) {
    const barW = 240;
    const barH = 16;
    const x = (this.viewW - barW) / 2;
    const hpY = this.viewH - 46;
    const resY = this.viewH - 24;
    this.barW = barW;

    // HP 条
    this._bg(x, hpY, barW, barH);
    this.hpFill = this._fill(x, hpY, barW, barH, 0x5cb85c);
    this.hpText = this._text(x + barW / 2, hpY + barH / 2, "", 12, "#ffffff").setOrigin(0.5);

    // 资源条
    const resColor = RESOURCE_COLORS[character.resource_name] || 0x4a90e2;
    this._bg(x, resY, barW, barH);
    this.resFill = this._fill(x, resY, barW, barH, resColor);
    this.resText = this._text(x + barW / 2, resY + barH / 2, "", 12, "#ffffff").setOrigin(0.5);

    this.barX = x;
  }

  update(character) {
    this.nameText.setText(
      `${character.name}  Lv.${character.level}  ${character.class_name}`
    );
    this.floorText.setText(
      `第 ${character.floor} 层 · 最高 ${character.highest_floor} · 金 ${character.gold}`
    );

    const s = character.stats;
    this._setBar(this.hpFill, s.hp, s.max_hp);
    this.hpText.setText(`HP ${s.hp} / ${s.max_hp}`);

    this._setBar(this.resFill, character.resource, character.resource_max);
    this.resText.setText(
      `${character.resource_name} ${character.resource} / ${character.resource_max}`
    );
  }

  _setBar(fill, value, max) {
    const ratio = max > 0 ? Phaser.Math.Clamp(value / max, 0, 1) : 0;
    fill.width = this.barW * ratio;
  }

  _bg(x, y, w, h) {
    return this.scene.add
      .rectangle(x, y, w, h, 0x000000, 0.55)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x3d3544)
      .setScrollFactor(0)
      .setDepth(DEPTH);
  }

  _fill(x, y, w, h, color) {
    return this.scene.add
      .rectangle(x, y, w, h, color, 1)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH + 1);
  }

  _text(x, y, str, size, color) {
    return this.scene.add
      .text(x, y, str, {
        fontFamily: FONT,
        fontSize: `${size}px`,
        color,
      })
      .setScrollFactor(0)
      .setDepth(DEPTH + 2);
  }
}
