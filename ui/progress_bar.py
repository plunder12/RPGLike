"""文字进度条。"""

BAR_WIDTH = 22
FILL_CHAR = "#"
EMPTY_CHAR = "-"
# 标签显示宽度（中文计 2、英文计 1），保证进度条左对齐
LABEL_DISPLAY_WIDTH = 4


def _display_width(text: str) -> int:
    return sum(2 if ord(c) > 127 else 1 for c in text)


def _pad_label(label: str, width: int = LABEL_DISPLAY_WIDTH) -> str:
    pad = width - _display_width(label)
    return label + (" " * pad if pad > 0 else "")


def hp_bar(current: int, maximum: int, width: int = BAR_WIDTH) -> str:
    if maximum <= 0:
        return f"[{EMPTY_CHAR * width}] 0% (0/0)"
    current = max(0, min(current, maximum))
    ratio = current / maximum
    filled = int(round(ratio * width))
    filled = max(0, min(width, filled))
    bar = FILL_CHAR * filled + EMPTY_CHAR * (width - filled)
    pct = ratio * 100
    return f"[{bar}] {pct:5.1f}% ({current}/{maximum})"


def format_combat_hp(label: str, current: int, maximum: int) -> str:
    return f"  {_pad_label(label)}: {hp_bar(current, maximum)}"