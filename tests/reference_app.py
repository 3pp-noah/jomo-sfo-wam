"""uvicorn entry for the fidelity reference: backend/main.py with the stepping test clock.
Run from a fresh copy of the project:  uvicorn tests.reference_app:app --port 8043"""

from tests.fake_clock import install

install()
import backend.main  # noqa: E402

app = backend.main.app
