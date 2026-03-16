# Garage64 — Pack Structure & Organization

Covers how the texture pack filesystem, the Django database, and OptiFine CEM interact,
and how to keep track of every car base and part so users can build their own collections.

---

## How OptiFine loads CEM files

1. On entity render, OptiFine checks `optifine/cem/<entity_type>.jem`
   (e.g. `oak_boat.jem` for the Boat entity).
2. If a `.properties` file exists (`optifine/cem/<entity_type>.properties`),
   OptiFine can load a *different* JEM per entity depending on matching rules
   (name, NBT, biome, etc.).
3. Part files (`.jpm`) can live anywhere; they are referenced by path inside the JEM.
4. Textures can live anywhere; they are referenced by path inside the JEM or JPM.

This means:

- The **entity-type JEM name is fixed** by Minecraft (`oak_boat.jem`, `armor_stand.jem`, …).
- **Variant JEMs** (e.g. `oak_boat2.jem`) are custom names that get mapped to entities
  via the `.properties` file — these names are `CarVariant.file_name` in the DB.
- There is **no restriction** on where `.jpm` and texture files live,
  so we can organise them in a car-centric folder layout.

---

## Database → Filesystem mapping

| DB model | DB field | Filesystem path |
|---|---|---|
| `EntityBody` | `jem_file_name` | Not written directly; used as entity type identifier |
| `EntityBody` | `body_data.texture` | `optifine/cem/<car_slug>/<car_slug>.png` |
| `EntityBody` | `body_data.textureSize` | embedded in the PNG dimensions |
| `ModelPart` | `jpm_path` | `optifine/cem/<car_slug>/parts/<part_name>.jpm` |
| `ModelPart` | part texture (in `part_data`) | `optifine/cem/<car_slug>/parts/<part_name>.png` |
| `CarVariant` | `file_name` | `optifine/cem/<variant_file_name>.jem` |
| `CarVariant` | entity type (via body) | `optifine/cem/<entity_type>.properties` entry |

> **`EntityBody` is a template**, not a file.
> The export system reads `body_data` and inlines the selected parts as `submodels`,
> then writes one `.jem` per `CarVariant` — never a bare body JEM.

---

## Recommended directory layout

```
assets/minecraft/
│
├── textures/
│   └── entity/
│       └── boat/
│           └── oak.png          ← vanilla fallback (never edited)
│
└── optifine/
    └── cem/
        │
        ├── oak_boat.properties  ← one file per entity type; lists all variant triggers
        │
        ├── oak_boat2.jem        ┐
        ├── oak_boat3.jem        │  generated variant JEMs (one per CarVariant)
        ├── oak_boat4.jem        ┘
        │
        └── miata/               ← one folder per car model slug (= EntityBody.name)
            │
            ├── miata.png        ← default/unpainted texture for this car base
            │                       (= body_data.texture target)
            │
            └── parts/
                ├── miata_stock_wheels.jpm
                ├── miata_stock_wheels.png
                ├── miata_duce_wheels.jpm
                ├── miata_duce_wheels.png
                ├── miata_popups.jpm
                └── miata_popups.png
```

### Why one folder per car model?
- All assets for a car are co-located; deleting/archiving a car model is one `rm -rf`.
- Part textures can reuse the same base palette as the body texture without path conflicts.
- Adding a second car (e.g. `corvette/`) doesn't touch any miata paths.

---

## Per-variant texture (user collections)

The current system gives every variant of a car the *same* body texture.
For users to have their own painted cars, each `CarVariant` needs its own texture copy.

### Recommended convention

```
optifine/cem/<car_slug>/variants/<variant_file_name>.png
```

Example: user paints a blue version of oak_boat3 →
`optifine/cem/miata/variants/oak_boat3.png`

### What needs to change in the DB

Add an optional `texture_override` field to `CarVariant`:

```python
class CarVariant(models.Model):
    # ... existing fields ...
    texture_override = models.CharField(
        max_length=200, blank=True,
        help_text="If set, the compiled JEM uses this texture path "
                  "instead of the body default. "
                  "e.g. 'optifine/cem/miata/variants/oak_boat3.png'"
    )
```

The `compiled_jem` view resolves the final texture as:
```python
texture = variant.texture_override or body.body_data.get('texture')
```

And the export system writes a copy of the base texture to the variant path on first paint.

### Workflow for a user collection

1. Browse **Bodies** → pick a car base (e.g. "Miata").
2. Go to **Studio → Compose** → select which parts to include.
3. Save as a new `CarVariant` (give it a `file_name` and `trigger_name`).
4. Go to **Studio → Texture** → paint the body colour / details.
   The texture editor saves to `optifine/cem/miata/variants/<file_name>.png`
   and sets `texture_override` on the variant.
5. **Export** regenerates all JEM files + the `.properties` file.

Each saved variant = one car in the user's collection.

---

## Properties file format (OptiFine reference)

```properties
# optifine/cem/oak_boat.properties
# One block per variant; variants matched top-to-bottom.

model.0=oak_boat2
nbt.display.Name=ipattern:*miata_stock*

model.1=oak_boat3
nbt.display.Name=ipattern:*miata_duce*
```

The `trigger_name` field on `CarVariant` maps to the `nbt.display.Name` pattern.
The `order` field controls the block order in the file (lower = checked first).

---

## Adding a new car model — checklist

1. **Create folder:** `optifine/cem/<car_slug>/`
2. **Add body texture:** `optifine/cem/<car_slug>/<car_slug>.png`
3. **Create `EntityBody` in DB:**
   - `name` = `<car_slug>` (e.g. `corvette_base`)
   - `jem_file_name` = the Minecraft entity type to override (e.g. `oak_boat`)
   - `entity_type` = same (e.g. `boat`)
   - `body_data` = full JEM JSON with `texture` pointing to the car folder texture
4. **For each part:**
   - Add JPM + texture to `optifine/cem/<car_slug>/parts/`
   - Create `ModelPart` in DB with `jpm_path` matching the file path and `part_data` = JPM JSON
   - Set `slot` and `attachment_meta` as needed
5. **Create at least one `CarVariant`** linking the body + default parts.
6. **Export** to generate the JEM and properties files.

---

## Part slots — organising the UI

`PartSlot` records define the sidebar categories in Studio → Compose.

Recommended slots for a car:

| `name` (slug) | `display_name` | `order` | Behaviour |
|---|---|---|---|
| `wheels` | Wheels | 1 | radio (one choice) |
| `body_kit` | Body Kit | 2 | radio |
| `extras` | Extras | 3 | checkboxes (multi-select) |

Parts not assigned to a slot still appear (under "Extras" or ungrouped),
but assigning slots gives users a clearer composition UI.

---

## Summary of invariants

- `ModelPart.jpm_path` **must** match the `model` key in the JEM attachment entry exactly.
- `CarVariant.file_name` **must** be unique across the whole pack (it becomes a JEM filename).
- The `entity_type` on `EntityBody` **must** be a valid Minecraft entity name
  so OptiFine knows which entity to intercept.
- Textures referenced in `body_data` or `part_data` must be relative to
  `assets/minecraft/` (no leading slash) or prefixed `minecraft:` — both forms work.
