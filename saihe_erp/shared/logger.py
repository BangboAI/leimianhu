"""
统一日志模块 - 同时输出到 console 和 log.txt
"""

import logging
import sys
from pathlib import Path
from typing import Optional


def setup_logger(name: str = "saihe", log_dir: Optional[str] = None) -> logging.Logger:
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger  # 避免重复添加

    logger.setLevel(logging.DEBUG)
    formatter = logging.Formatter(
        "[%(asctime)s] %(levelname)s - %(name)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    # Console handler
    ch = logging.StreamHandler(sys.stdout)
    ch.setLevel(logging.INFO)
    ch.setFormatter(formatter)
    logger.addHandler(ch)

    # File handler
    log_path = Path(log_dir) if log_dir else Path.cwd() / "logs"
    log_path.mkdir(parents=True, exist_ok=True)
    fh = logging.FileHandler(log_path / "saihe.log", encoding="utf-8")
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(formatter)
    logger.addHandler(fh)

    return logger
