// 虚拟摇杆：左下角，供触屏设备移动角色。

const DEPTH = 2200;

export default class VirtualJoystick {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.radius = options.radius ?? 52;
    this.thumbRadius = options.thumbRadius ?? 22;
    this.baseX = options.x ?? 72;
    this.baseY = options.y ?? scene.scale.height - 118;
    this.maxDrag = this.radius - 6;

    this.active = false;
    this.vector = { x: 0, y: 0 };
    this._pointerId = null;
    this._objs = [];

    this._build();
    this._bindEvents();
  }

  _build() {
    const { scene } = this;

    const zone = scene.add
      .circle(this.baseX, this.baseY, this.radius + 18, 0x000000, 0.001)
      .setScrollFactor(0)
      .setDepth(DEPTH)
      .setInteractive({ useHandCursor: false });

    const base = scene.add
      .circle(this.baseX, this.baseY, this.radius, 0x1a1820, 0.55)
      .setScrollFactor(0)
      .setDepth(DEPTH + 1)
      .setStrokeStyle(2, 0xc9a227, 0.45);

    const thumb = scene.add
      .circle(this.baseX, this.baseY, this.thumbRadius, 0xc9a227, 0.75)
      .setScrollFactor(0)
      .setDepth(DEPTH + 2)
      .setStrokeStyle(1, 0xffffff, 0.35);

    this.zone = zone;
    this.base = base;
    this.thumb = thumb;
    this._objs.push(zone, base, thumb);
  }

  _bindEvents() {
    this.zone.on("pointerdown", (pointer) => this._onDown(pointer));
    this.scene.input.on("pointermove", this._onMove, this);
    this.scene.input.on("pointerup", this._onUp, this);
    this.scene.input.on("pointerupoutside", this._onUp, this);
  }

  _onDown(pointer) {
    if (this._pointerId !== null) return;
    this._pointerId = pointer.id;
    this.active = true;
    this._updateThumb(pointer.x, pointer.y);
  }

  _onMove(pointer) {
    if (this._pointerId !== pointer.id) return;
    this._updateThumb(pointer.x, pointer.y);
  }

  _onUp(pointer) {
    if (this._pointerId !== pointer.id) return;
    this._reset();
  }

  _updateThumb(px, py) {
    const dx = px - this.baseX;
    const dy = py - this.baseY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const clamped = Math.min(dist, this.maxDrag);
    const nx = dx / dist;
    const ny = dy / dist;

    this.thumb.setPosition(
      this.baseX + nx * clamped,
      this.baseY + ny * clamped
    );

    const strength = clamped / this.maxDrag;
    this.vector = { x: nx * strength, y: ny * strength };
  }

  _reset() {
    this._pointerId = null;
    this.active = false;
    this.vector = { x: 0, y: 0 };
    this.thumb.setPosition(this.baseX, this.baseY);
  }

  /** @returns {{ x: number, y: number, active: boolean }} */
  getVector() {
    return { x: this.vector.x, y: this.vector.y, active: this.active };
  }

  containsScreenPoint(x, y) {
    const d = Phaser.Math.Distance.Between(x, y, this.baseX, this.baseY);
    return d <= this.radius + 24;
  }

  destroy() {
    this.scene.input.off("pointermove", this._onMove, this);
    this.scene.input.off("pointerup", this._onUp, this);
    this.scene.input.off("pointerupoutside", this._onUp, this);
    this._objs.forEach((o) => o.destroy());
    this._objs = [];
  }
}
