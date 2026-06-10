// SkillBar：技能栏 UI，显示 Q/E/R/F 技能槽。
// 每槽：技能图标（按范围类型着色）+ 按键 + 技能名 + 资源消耗 + CD 遮罩/倒计时。
// 放在 UIScene 中，每帧由 UIScene.update(time) 刷新 CD 状态。

const FONT = "Microsoft YaHei, sans-serif";
const SLOT_W = 60;
const SLOT_H = 58;
const GAP = 8;
const DEPTH = 2100;

// 按 range_type 区分技能颜色。
const SKILL_COLORS = {
  aoe:    0xff7a3a,   // 橙——范围技能
  ranged: 0x4a90e2,  // 蓝——远程/法术
  heal:   0x5cb85c,  // 绿——治疗
  buff:   0xc98ad0,  // 紫——增益
  melee:  0xc9a227,  // 金——近战
};

export default class SkillBar {
  constructor(scene, skills) {
    this.scene = scene;
    this.slots = [];
    if (!skills || skills.length === 0) return;
    this._build(skills);
  }

  _build(skills) {
    const cam = this.scene.cameras.main;
    const totalW = skills.length * SLOT_W + (skills.length - 1) * GAP;
    const startX = (cam.width - totalW) / 2;
    const baseY = cam.height - 100;

    skills.forEach((skill, i) => {
      const x = startX + i * (SLOT_W + GAP);
      this.slots.push(this._buildSlot(x, baseY, skill));
    });
  }

  _buildSlot(x, y, skill) {
    const iconColor = SKILL_COLORS[skill.range_type] || SKILL_COLORS.melee;

    // 外框
    const bg = this.scene.add
      .rectangle(x, y, SLOT_W, SLOT_H, 0x1a1820, 0.92)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH)
      .setStrokeStyle(1, 0x3d3544);

    // 技能图标色块
    const icon = this.scene.add
      .rectangle(x + 4, y + 4, SLOT_W - 8, SLOT_W - 12, iconColor, 0.65)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH + 1);

    // 按键标记（左上角）
    this.scene.add
      .text(x + 5, y + 5, skill.key || "", {
        fontFamily: FONT, fontSize: "11px", color: "#ffffff",
        stroke: "#000000", strokeThickness: 2,
      })
      .setScrollFactor(0).setDepth(DEPTH + 3);

    // 技能名（图标下方）
    this.scene.add
      .text(x + SLOT_W / 2, y + SLOT_W - 6, skill.name, {
        fontFamily: FONT, fontSize: "10px", color: "#e8e0d5",
      })
      .setOrigin(0.5, 0).setScrollFactor(0).setDepth(DEPTH + 3);

    // 资源消耗（右下角）
    if (skill.resource_cost > 0) {
      this.scene.add
        .text(x + SLOT_W - 4, y + SLOT_H - 4, String(skill.resource_cost), {
          fontFamily: FONT, fontSize: "10px", color: "#9a9088",
        })
        .setOrigin(1, 1).setScrollFactor(0).setDepth(DEPTH + 3);
    }

    // CD 遮罩（覆盖图标区域）
    const cdOverlay = this.scene.add
      .rectangle(x + 4, y + 4, SLOT_W - 8, SLOT_W - 12, 0x000000, 0)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH + 2);

    // CD 倒计时文字
    const cdText = this.scene.add
      .text(x + SLOT_W / 2, y + (SLOT_W - 12) / 2 + 4, "", {
        fontFamily: FONT, fontSize: "15px", color: "#ffffff",
        stroke: "#000000", strokeThickness: 3,
      })
      .setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 4);

    return { skill, icon, cdOverlay, cdText };
  }

  // 每帧由 UIScene 调用。skills 是 DungeonScene 里的运行时数组（含 nextReadyAt）。
  update(time, skills) {
    this.slots.forEach((slot, i) => {
      const sk = skills[i];
      if (!sk) return;
      const remaining = Math.max(0, (sk.nextReadyAt || 0) - time);
      if (remaining > 0) {
        slot.cdOverlay.setFillStyle(0x000000, 0.68);
        slot.cdText.setText((remaining / 1000).toFixed(1) + "s");
      } else {
        slot.cdOverlay.setFillStyle(0x000000, 0);
        slot.cdText.setText("");
      }
    });
  }
}
