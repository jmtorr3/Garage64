# Garage64

A full-stack web tool for creating and managing OptiFine CEM (Custom Entity Models) texture packs for Minecraft. Build custom cars by composing a base body with swappable parts, paint textures, preview in real-time 3D, and export a ready-to-use pack.

## Features

- **Garage** — browse, create, and edit car variants; select a body + parts; preview live in 3D
- **Studio** — compose variants, edit UV maps, paint textures, and open the 3D modeler
- **Parts** — manage the library of swappable parts (wheels, body kits, etc.) grouped by base model
- **Export** — one-click generation of `.jem`, `.jpm`, and `.properties` files into `Garage64_LATEST/`
- **Home** — splash page with an auto-rotating 3D preview of your default variant

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, React Router v6, Three.js, Vite |
| Backend | Django 4.2, Django REST Framework, Pillow |
| Database | SQLite (dev) |

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+

### Run (both together)

```bash
./dev.sh
```

Or separately:

**Backend**
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

**Frontend**
```bash
cd frontend
npm install
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000/api/
- Django admin: http://localhost:8000/admin/

## API Overview

| Endpoint | Description |
|---|---|
| `GET/POST /api/variants/` | List or create car variants |
| `GET/PUT/DELETE /api/variants/{id}/` | Retrieve, update, or delete a variant |
| `GET /api/variants/{id}/compiled_jem/` | Build the final JEM with all parts inlined |
| `POST /api/variants/export/` | Export pack to `Garage64_LATEST/` |
| `GET/POST /api/parts/` | Manage model parts (JPM) |
| `GET /api/bodies/` | List entity bodies (JEM templates) |
| `GET/POST /api/slots/` | Manage part slot categories |
| `GET/PUT /api/asset/?path=<rel>` | Read or write pack asset files |

## Data Model

```
EntityBody          — base JEM template (e.g. miata_base / oak_boat entity)
  └── CarVariant    — one .jem file: body + selected parts + texture override
        └── VariantPart (through) → ModelPart
                                      └── PartSlot (slot category e.g. wheels)
```

## Documentation

- [Frontend](frontend/FRONTEND.md) — pages, components, API layer, data structures, styling
- [Backend](backend/BACKEND.md) — models, REST endpoints, management commands, environment variables

## Pack Output

Exported files land in `Garage64_LATEST/assets/minecraft/optifine/cem/`:

```
<model>/
  <model>.jem          — body geometry with part submodels inlined
  parts/
    <part>.jpm         — individual part geometry
  variants/
    <variant>.png      — per-variant texture (if overridden)
<model>.properties     — OptiFine trigger → variant mapping
```
