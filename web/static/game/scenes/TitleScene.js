// TitleScene：选择 / 创建角色，复用现有 REST API。
// 选定角色后拉取完整属性并进入 TownScene（城镇 → 地牢的入口）。

import { Api } from "../systems/apiClient.js";
import { COLORS } from "../constants.js";

const FONT = "Microsoft YaHei, sans-serif";

export default class TitleScene extends Phaser.Scene {
  constructor() {
    super("TitleScene");
  }

  create() {
    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.cx = this.cameras.main.width / 2;
    this.items = [];
    this.classes = [];

    this.add
      .text(this.cx, 50, "文字暗黑 · 2D 地牢", {
        fontFamily: FONT,
        fontSize: "28px",
        color: "#c9a227",
      })
      .setOrigin(0.5);

    this.hint = this.add
      .text(this.cx, 90, "加载中…", {
        fontFamily: FONT,
        fontSize: "14px",
        color: "#9a9088",
      })
      .setOrigin(0.5);

    this._loadAndRender();
  }

  async _loadAndRender() {
    try {
      this.classes = await Api.listClasses();
      const chars = await Api.listCharacters();
      this._renderList(chars);
    } catch (e) {
      this.hint.setText(`加载失败：${e.message}`);
    }
  }

  _clear() {
    this.items.forEach((o) => o.destroy());
    this.items = [];
  }

  _renderList(chars) {
    this._clear();
    this.hint.setText(chars.length ? "选择一个冒险者进入地牢" : "暂无角色，请创建");

    let y = 140;
    chars.forEach((c) => {
      const label = `${c.name}  ·  ${c.class_display}  ·  Lv.${c.level}  ·  最高 ${c.floor} 层`;
      const row = this._button(this.cx, y, label, () => this._enterGame(c.name));
      this.items.push(row);
      y += 44;
    });

    const createBtn = this._button(this.cx, y + 16, "＋ 创建新角色", () => this._startCreate(), "#5cb85c");
    this.items.push(createBtn);
  }

  _startCreate() {
    const name = window.prompt("输入新角色名（最多 20 字）：");
    if (!name || !name.trim()) return;
    this._renderClassPicker(name.trim());
  }

  _renderClassPicker(name) {
    this._clear();
    this.hint.setText(`为「${name}」选择职业`);

    let y = 150;
    this.classes.forEach((cls) => {
      const btn = this._button(this.cx, y, `${cls.name} — ${cls.desc}`, () =>
        this._doCreate(name, cls.id)
      );
      this.items.push(btn);
      y += 56;
    });

    const back = this._button(this.cx, y + 10, "返回", () => this._loadAndRender(), "#9a9088");
    this.items.push(back);
  }

  async _doCreate(name, classId) {
    this.hint.setText("创建中…");
    try {
      await Api.createCharacter(name, classId);
      await this._enterGame(name);
    } catch (e) {
      this.hint.setText(`创建失败：${e.message}`);
    }
  }

  async _enterGame(name) {
    this.hint.setText("进入地牢…");
    try {
      const character = await Api.getCharacter(name);
      this.scene.start("TownScene", { character });
    } catch (e) {
      this.hint.setText(`加载角色失败：${e.message}`);
    }
  }

  // 居中可点击按钮（带 hover 反馈）。
  _button(x, y, text, onClick, color = "#e8e0d5") {
    const t = this.add
      .text(x, y, text, {
        fontFamily: FONT,
        fontSize: "16px",
        color,
        backgroundColor: "rgba(26,24,32,0.9)",
        padding: { x: 16, y: 10 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    t.on("pointerover", () => t.setStyle({ backgroundColor: "rgba(61,53,68,0.95)" }));
    t.on("pointerout", () => t.setStyle({ backgroundColor: "rgba(26,24,32,0.9)" }));
    t.on("pointerdown", onClick);
    return t;
  }
}
