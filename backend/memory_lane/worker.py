from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from typing import Callable


class EnrichmentWorker:
    """In-process background worker for async enrichment."""

    def __init__(self, max_workers: int = 2) -> None:
        self._executor = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="enrich")

    def submit(self, fn: Callable, *args, **kwargs):
        return self._executor.submit(fn, *args, **kwargs)

    def shutdown(self, wait: bool = True):
        self._executor.shutdown(wait=wait, cancel_futures=not wait)
