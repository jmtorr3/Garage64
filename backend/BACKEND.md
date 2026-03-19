# Garage64 Backend Documentation

Django REST Framework backend for the Garage64 Minecraft resource pack editor.

---

## Models

| Model | Purpose |
|---|---|
| `PartSlot` | Named category for mutually-exclusive swappable parts (e.g. wheels, headlights) |
| `EntityBody` | Base car geometry — stores the full JEM JSON for a body |
| `ModelPart` | One swappable JPM part — geometry + attachment metadata |
| `CarVariant` | One .jem variant = a body + ordered set of parts |
| `VariantPart` | Through table linking CarVariant ↔ ModelPart with order |

### PartSlot
```
name          CharField(50, unique)   slug used in ModelPart.slot
display_name  CharField(100)          shown in UI
order         PositiveIntegerField    controls display order
```

### EntityBody
```
name           CharField(100, unique)  e.g. "miata_base"
jem_file_name  CharField(100)          e.g. "oak_boat" (no extension)
entity_type    CharField(50)           e.g. "boat"
body_data      JSONField               full JEM JSON (no jpm-referencing entries)
```

### ModelPart
```
name             CharField(100, unique)  e.g. "miata_duce_wheels"
jpm_path         CharField(300)          e.g. "minecraft:optifine/cem/miata/parts/miata_duce_wheels.jpm"
part_data        JSONField               raw JPM file content
slot             CharField(50, blank)    groups mutually-exclusive parts; blank = standalone toggle
attachment_meta  JSONField               wrapper object inserted into JEM models array (excludes "model" key)
```

### CarVariant
```
file_name         CharField(100, unique)  e.g. "oak_boat2"
trigger_name      CharField(100, blank)   .properties trigger string; blank = default variant
body              ForeignKey(EntityBody)
parts             ManyToManyField(ModelPart, through=VariantPart)
order             PositiveIntegerField    index in .properties file (0 = default)
texture_override  CharField(300, blank)   overrides body_data.texture if set
```

### VariantPart (through table)
```
variant  ForeignKey(CarVariant)
part     ForeignKey(ModelPart)
order    PositiveIntegerField
```
Unique together: `(variant, part)`

---

## API Endpoints

### Slots — `/api/slots/`
| Method | Path | Description |
|---|---|---|
| GET | `/api/slots/` | List all slots |
| POST | `/api/slots/` | Create slot |
| PUT | `/api/slots/{id}/` | Update slot |
| PATCH | `/api/slots/{id}/` | Partial update |
| DELETE | `/api/slots/{id}/` | Delete slot |

### Bodies — `/api/bodies/`
| Method | Path | Description |
|---|---|---|
| GET | `/api/bodies/` | List all bodies |
| POST | `/api/bodies/` | Create body |
| GET | `/api/bodies/{id}/` | Get body detail |
| PUT | `/api/bodies/{id}/` | Update body |
| PATCH | `/api/bodies/{id}/` | Partial update |
| DELETE | `/api/bodies/{id}/` | Delete body |

### Parts — `/api/parts/`
| Method | Path | Description |
|---|---|---|
| GET | `/api/parts/` | List all parts |
| POST | `/api/parts/` | Create part |
| GET | `/api/parts/{id}/` | Get part detail |
| PUT | `/api/parts/{id}/` | Update part |
| PATCH | `/api/parts/{id}/` | Partial update (e.g. just `slot`) |
| DELETE | `/api/parts/{id}/` | Delete part |

### Variants — `/api/variants/`
| Method | Path | Description |
|---|---|---|
| GET | `/api/variants/` | List all variants (ordered) |
| POST | `/api/variants/` | Create variant — accepts `part_ids: [int]` |
| GET | `/api/variants/{id}/` | Get variant (includes nested `variant_parts`) |
| PUT | `/api/variants/{id}/` | Replace variant + reassign parts |
| PATCH | `/api/variants/{id}/` | Partial update |
| DELETE | `/api/variants/{id}/` | Delete variant |
| GET | `/api/variants/{id}/compiled_jem/` | Fully compiled JEM with parts inlined as submodels |
| POST | `/api/variants/export/` | Write all `.jem`, `.jpm`, `.properties` files to `PACK_ROOT` |

### Assets — `/api/asset/`
| Method | Path | Description |
|---|---|---|
| GET | `/api/asset/?path=<rel>` | Serve file from `{PACK_ROOT}/assets/minecraft/<rel>` |
| PUT | `/api/asset/?path=<rel>` | Overwrite file with raw request body (creates dirs as needed) |

### Music — `/api/music/`
| Method | Path | Description |
|---|---|---|
| GET | `/api/music/?dir=<path>` | List audio files in directory (falls back to `~/Music`) |
| GET | `/api/music/stream/?path=<abs>` | Stream an audio file (must be within `~`) |

Supported audio formats: `.mp3`, `.flac`, `.ogg`, `.wav`, `.m4a`, `.aac`, `.opus`

---

## Write Serializer (CarVariant)

Create/update variants accept a `part_ids` list which atomically replaces all `VariantPart` entries:

```json
{
  "file_name": "oak_boat2",
  "trigger_name": "miata_red",
  "body": 1,
  "order": 1,
  "part_ids": [3, 7, 12]
}
```

---

## Management Commands

```bash
# Seed database from pack files on disk (clears existing data first)
python manage.py import_pack

# Write all .jem / .jpm / .properties files from database to PACK_ROOT
python manage.py export_pack
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PACK_ROOT` | `../Garage64_LATEST` | Path to the Minecraft resource pack directory |
| `DB_PATH` | `backend/db.sqlite3` | Path to the SQLite database file |

---

## Running Locally

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py import_pack   # optional: seed from existing pack files
python manage.py runserver
```

API available at `http://localhost:8000/api/`
