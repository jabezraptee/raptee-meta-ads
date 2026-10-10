from __future__ import annotations
import time
from typing import Dict, List, Optional
from backend.config import get_logger
from backend.models import MetaAdItem

logger = get_logger("Storage")


class StorageService:
    """Enterprise session-scoped in-memory storage with LRU/TTL lifecycle."""

    def __init__(self, ttl_seconds: int = 86400 * 3):
        # session_id -> { adArchiveId -> MetaAdItem }
        self._sessions: Dict[str, Dict[str, MetaAdItem]] = {}
        # session_id -> last_activity_timestamp
        self._session_activity: Dict[str, float] = {}
        self._ttl_seconds = ttl_seconds

    def _normalize_session_id(self, session_id: Optional[str]) -> str:
        s = (session_id or "").strip()
        return s if s else "default"

    def _cleanup_stale(self) -> None:
        """Evicts sessions inactive for more than TTL (default 3 days)."""
        now = time.time()
        stale_keys = [
            sid for sid, last_active in self._session_activity.items()
            if now - last_active > self._ttl_seconds
        ]
        for sid in stale_keys:
            self._sessions.pop(sid, None)
            self._session_activity.pop(sid, None)
            logger.debug(f"Evicted stale session [{sid}]")

    def save_ads(self, session_id: str, ads: List[MetaAdItem]) -> int:
        sid = self._normalize_session_id(session_id)
        self._cleanup_stale()

        if sid not in self._sessions:
            self._sessions[sid] = {}

        for ad in ads:
            self._sessions[sid][ad.adArchiveId] = ad

        self._session_activity[sid] = time.time()
        count = len(self._sessions[sid])
        logger.info(f"Session [{sid}]: Buffered {count} total unique ads.")
        return count

    def get_ads(self, session_id: str) -> List[MetaAdItem]:
        sid = self._normalize_session_id(session_id)
        self._cleanup_stale()
        if sid in self._session_activity:
            self._session_activity[sid] = time.time()
        ads_map = self._sessions.get(sid, {})
        return list(ads_map.values())

    def clear_session(self, session_id: str) -> bool:
        sid = self._normalize_session_id(session_id)
        if sid in self._sessions:
            self._sessions.pop(sid, None)
            self._session_activity.pop(sid, None)
            logger.info(f"Session [{sid}] cleared.")
            return True
        return False

    def count_ads(self, session_id: str) -> int:
        sid = self._normalize_session_id(session_id)
        return len(self._sessions.get(sid, {}))

    def total_sessions(self) -> int:
        return len(self._sessions)

    # Backward compatibility helpers
    def get_all_ads(self) -> List[MetaAdItem]:
        return self.get_ads("default")


storage = StorageService()
