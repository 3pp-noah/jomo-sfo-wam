"""Stand-in for httpx. main.py uses it only to call the Anthropic API, and only when
ANTHROPIC_API_KEY is set; the published page never holds a key, so this is never reached."""


class AsyncClient:
    def __init__(self, *args, **kwargs):
        raise RuntimeError("Outbound model calls are not available in the published page.")
