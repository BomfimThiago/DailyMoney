"""Write the API's OpenAPI schema, from which the app generates its TypeScript types.

uv run python scripts/export_openapi.py ../app/openapi.json
"""

import json
import sys
from pathlib import Path

from app.main import app

Path(sys.argv[1]).write_text(json.dumps(app.openapi(), indent=2, ensure_ascii=False) + "\n")
