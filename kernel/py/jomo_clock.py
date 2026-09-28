"""A microsecond wall clock for time.time() inside the page.

Pyodide's time.time() advances in whole milliseconds, so rows written within one millisecond
share a timestamp and the backend's "ORDER BY ts DESC" lists them in an arbitrary order. Native
Python reads the clock to the microsecond, which keeps successive rows distinct and in order.
This reading comes from performance.now() and is made strictly increasing by at least 1 µs.
"""

import time

from js import performance

_last = 0.0


def _time() -> float:
    global _last
    t = (performance.timeOrigin + performance.now()) / 1000.0
    if t <= _last:
        t = _last + 1e-6
    _last = t
    return t


time.time = _time
