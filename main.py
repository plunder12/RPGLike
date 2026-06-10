"""游戏入口。"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ui.menu import GameMenu


def main() -> None:
    GameMenu().run()


if __name__ == "__main__":
    main()
