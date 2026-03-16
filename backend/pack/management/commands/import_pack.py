"""
python manage.py import_pack

Reads the existing pack files from PACK_ROOT and seeds the database:
  - EntityBody  ← oak_boat.jem (the clean base body, no jpm entries)
  - ModelPart   ← each .jpm file found referenced inside jem variants
  - CarVariant  ← one per .jem file (default + triggered variants)

Run this once after setting up. Re-running is safe — it clears existing data first.
"""

import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand

from pack.models import EntityBody, ModelPart, CarVariant, VariantPart


class Command(BaseCommand):
    help = 'Seed the database from the existing pack files in PACK_ROOT'

    def handle(self, *args, **options):
        pack_root = Path(settings.PACK_ROOT)
        cem_dir = pack_root / 'assets' / 'minecraft' / 'optifine' / 'cem'

        self.stdout.write('Clearing existing data...')
        VariantPart.objects.all().delete()
        CarVariant.objects.all().delete()
        ModelPart.objects.all().delete()
        EntityBody.objects.all().delete()

        # ── 1. Create the base body from oak_boat.jem ─────────────────────
        base_jem_path = cem_dir / 'oak_boat.jem'
        base_data = json.loads(base_jem_path.read_text(encoding='utf-8'))

        body = EntityBody.objects.create(
            name='miata_base',
            jem_file_name='oak_boat',
            entity_type='boat',
            body_data=base_data,
        )
        self.stdout.write(self.style.SUCCESS(f'Created EntityBody: {body.name}'))

        # ── 2. Parse variant .jem files ────────────────────────────────────
        # Read .properties to get trigger names keyed by variant index
        props_path = cem_dir / 'oak_boat.properties'
        trigger_map = _parse_properties(props_path)
        # trigger_map = {2: 'Duce', 3: 'DuceH'} (model index → name)

        # Default variant (oak_boat itself, no trigger)
        default_variant = CarVariant.objects.create(
            file_name='oak_boat',
            trigger_name='',
            body=body,
            order=0,
        )
        self.stdout.write(self.style.SUCCESS(f'Created CarVariant: oak_boat (default)'))

        # Indexed variants: oak_boat2, oak_boat3, ...
        parts_cache: dict[str, ModelPart] = {}
        variant_index = 2
        while True:
            jem_path = cem_dir / f'oak_boat{variant_index}.jem'
            if not jem_path.exists():
                break

            jem_data = json.loads(jem_path.read_text(encoding='utf-8'))
            jpm_entries, clean_models = _split_models(jem_data['models'])

            # The clean base should already match body_data, but we store it as-is
            trigger_name = trigger_map.get(variant_index, '')
            variant = CarVariant.objects.create(
                file_name=f'oak_boat{variant_index}',
                trigger_name=trigger_name,
                body=body,
                order=variant_index - 1,  # order 1, 2, ...
            )

            for i, entry in enumerate(jpm_entries):
                jpm_path_str = entry['model']
                part = _get_or_create_part(jpm_path_str, entry, cem_dir, parts_cache)
                VariantPart.objects.create(variant=variant, part=part, order=i)

            self.stdout.write(
                self.style.SUCCESS(
                    f'Created CarVariant: oak_boat{variant_index} '
                    f'(trigger="{trigger_name}", parts={len(jpm_entries)})'
                )
            )
            variant_index += 1

        self.stdout.write(self.style.SUCCESS('Import complete.'))


# ── helpers ──────────────────────────────────────────────────────────────────

def _parse_properties(path: Path) -> dict:
    """
    Parse oak_boat.properties into {model_index: trigger_name}.
    Example: models.2=3  name.2=DuceH  →  {3: 'DuceH'}
    """
    if not path.exists():
        return {}
    result = {}
    index_to_model = {}
    index_to_name = {}
    for line in path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if line.startswith('#') or not line:
            continue
        key, _, value = line.partition('=')
        key = key.strip()
        value = value.strip()
        if key.startswith('models.'):
            idx = int(key.split('.', 1)[1])
            index_to_model[idx] = int(value)
        elif key.startswith('name.'):
            idx = int(key.split('.', 1)[1])
            index_to_name[idx] = value
    for idx in index_to_model:
        model_num = index_to_model[idx]
        name = index_to_name.get(idx, '')
        result[model_num] = name
    return result


def _split_models(models: list) -> tuple[list, list]:
    """
    Split a JEM models array into:
      - jpm_entries: entries that have a "model" key (part attachments)
      - rest: everything else (standard bones)
    """
    jpm_entries = [m for m in models if 'model' in m]
    rest = [m for m in models if 'model' not in m]
    return jpm_entries, rest


def _get_or_create_part(
    jpm_path_str: str,
    entry: dict,
    cem_dir: Path,
    cache: dict,
) -> ModelPart:
    """Load or create a ModelPart from a jpm path string."""
    if jpm_path_str in cache:
        return cache[jpm_path_str]

    # Derive filesystem path from the minecraft: namespace path
    # "minecraft:optifine/cem/miata/parts/miata_duce_wheels.jpm"
    rel = jpm_path_str.split('optifine/cem/', 1)[-1]
    full_path = cem_dir / rel

    part_data = {}
    if full_path.exists():
        part_data = json.loads(full_path.read_text(encoding='utf-8'))

    # attachment_meta = entry minus the "model" key
    attachment_meta = {k: v for k, v in entry.items() if k != 'model'}

    # Derive a friendly name from the filename
    name = Path(rel).stem  # e.g. "miata_duce_wheels"

    part, _ = ModelPart.objects.get_or_create(
        jpm_path=jpm_path_str,
        defaults={
            'name': name,
            'part_data': part_data,
            'attachment_meta': attachment_meta,
        },
    )
    cache[jpm_path_str] = part
    return part
