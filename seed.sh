#!/bin/bash
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT/backend"
source venv/bin/activate
python manage.py migrate
python manage.py import_pack
