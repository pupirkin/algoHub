"""In-process fixed-window rate limiting for write endpoints (ARCHITECTURE_PLAN §5).

Deliberately tiny and dependency-free: no Redis (ADR-0005/CLAUDE.md). Limits are per process — with N uvicorn
workers the effective limit is N x limit; acceptable until a measured need justifies shared storage (ADR).
Client identity is ``request.client.host``; behind a reverse proxy run uvicorn with ``--proxy-headers`` and a
strict ``--forwarded-allow-ips``, otherwise every user shares the proxy's address (and one bucket).

Use ``limited_route_class`` so the check runs BEFORE FastAPI reads and parses the body: malformed or invalid
requests are counted too.
"""

from __future__ import annotations

import math
import threading
import time
from collections import OrderedDict
from collections.abc import Callable, Coroutine, Sequence
from dataclasses import dataclass
from typing import Any

from fastapi import Request, Response
from fastapi.routing import APIRoute

from shared_kernel.errors import RateLimitedError


@dataclass(frozen=True, slots=True)
class Rule:
    limit: int
    window_s: float

    def __post_init__(self) -> None:
        if self.limit < 1 or self.window_s <= 0:
            msg = "limit must be >= 1 and window_s > 0"
            raise ValueError(msg)


class FixedWindowLimiter:
    """Counts hits per key in fixed windows. Thread-safe; O(1) amortized per hit; memory bounded.

    Windows are kept ordered by start time, so expired entries are always at the front and eviction is a pop.
    Under a flood of more than ``max_keys`` distinct live clients the oldest windows are dropped (their
    counters reset) — a deliberate trade-off for bounded memory.
    """

    def __init__(
        self, rule: Rule, *, clock: Callable[[], float] = time.monotonic, max_keys: int = 10_000
    ) -> None:
        self._rule = rule
        self._clock = clock
        self._max_keys = max_keys
        self._windows: OrderedDict[str, tuple[float, int]] = OrderedDict()  # key -> (window_start, count)
        self._lock = threading.Lock()

    def __len__(self) -> int:
        return len(self._windows)

    def hit(self, key: str) -> float | None:
        """Registers one hit. Returns None if allowed, else seconds until the window resets."""
        now = self._clock()
        with self._lock:
            entry = self._windows.get(key)
            if entry is None or now - entry[0] >= self._rule.window_s:
                self._windows.pop(key, None)
                self._windows[key] = (now, 1)  # newest window goes to the end
                self._evict(now)
                return None
            start, count = entry
            if count >= self._rule.limit:
                return start + self._rule.window_s - now
            self._windows[key] = (start, count + 1)  # updating keeps the position (ordered by start)
            return None

    def _evict(self, now: float) -> None:
        while self._windows:
            _, (start, _) = next(iter(self._windows.items()))
            if now - start < self._rule.window_s:
                break
            self._windows.popitem(last=False)
        while len(self._windows) > self._max_keys:
            self._windows.popitem(last=False)


def client_key(request: Request) -> str:
    return request.client.host if request.client is not None else "unknown"


def enforce(limiters: Sequence[FixedWindowLimiter], request: Request) -> None:
    """Raises RateLimitedError (429, error envelope, Retry-After) when any limiter rejects the client."""
    key = client_key(request)
    for limiter in limiters:
        retry_after = limiter.hit(key)
        if retry_after is not None:
            seconds = max(1, math.ceil(retry_after))
            raise RateLimitedError(
                "Too many requests, try again later",
                details={"retry_after_s": seconds},
                headers={"Retry-After": str(seconds)},
            )


def limited_route_class(
    get_limiters: Callable[[Request], Sequence[FixedWindowLimiter]],
) -> type[APIRoute]:
    """APIRoute subclass that enforces the limiters before the request body is read or validated."""

    class RateLimitedRoute(APIRoute):
        def get_route_handler(self) -> Callable[[Request], Coroutine[Any, Any, Response]]:
            original = super().get_route_handler()

            async def handler(request: Request) -> Response:
                enforce(get_limiters(request), request)
                return await original(request)

            return handler

    return RateLimitedRoute
