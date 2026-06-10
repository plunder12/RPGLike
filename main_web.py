"""Web 版入口 — python main_web.py"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import uvicorn

if __name__ == "__main__":
    print("文字暗黑 Web 版: http://127.0.0.1:8765")
    uvicorn.run("web.server:app", host="127.0.0.1", port=8765, reload=False)
