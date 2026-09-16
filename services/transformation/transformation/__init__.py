"""Omniqora transformation service. The pinned shared knowledge snapshot is reusable."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "vendor"))
__version__ = "0.3.0"
