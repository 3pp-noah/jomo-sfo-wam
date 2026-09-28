"""A stepping clock for the fidelity comparison, installed identically in the reference
backend and in the in-page kernel so that clock-derived values can be compared exactly.
Every reading advances 1 ms. Only the backend's own two clock sources are replaced:
main.py's time.time() and research_agent.py's datetime.now(). main.py itself
reads the clock only inside requests, so replacing it after import loses nothing."""

import datetime as _dt
import time as _time


class _State:
    t = 1790000000.0


def reading() -> float:
    _State.t += 0.001
    return _State.t


class _Time:
    time = staticmethod(reading)

    def __getattr__(self, name):
        return getattr(_time, name)


class _DateTime(_dt.datetime):
    @classmethod
    def now(cls, tz=None):
        return _dt.datetime.fromtimestamp(reading(), tz)


def install() -> None:
    """Call before importing backend.main: the research store seeds its rows at import time."""
    import backend.research_agent as research_agent
    research_agent.datetime = _DateTime
    import backend.main as main
    main.time = _Time()
