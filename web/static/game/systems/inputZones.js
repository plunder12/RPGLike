// 屏幕 UI 热区：地牢场景点击时需跳过，避免与 HUD/摇杆冲突。

export function isDungeonUiZone(x, y, width, height, hasJoystick) {
  if (y > height - 128) return true;
  if (hasJoystick && x < 160 && y > height - 220) return true;
  if (x > width - 56 && y < 52) return true;
  return false;
}

export function isTouchDevice(game) {
  return game.device.input.touch;
}
