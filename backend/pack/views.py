import json
import mimetypes
import os
from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view
from rest_framework.response import Response

from .models import EntityBody, ModelPart, CarVariant, VariantPart, PartSlot
from .serializers import (
    EntityBodySerializer,
    ModelPartSerializer,
    CarVariantSerializer,
    CarVariantWriteSerializer,
    PartSlotSerializer,
)


class PartSlotViewSet(viewsets.ModelViewSet):
    queryset = PartSlot.objects.all()
    serializer_class = PartSlotSerializer


class EntityBodyViewSet(viewsets.ModelViewSet):
    queryset = EntityBody.objects.all()
    serializer_class = EntityBodySerializer


class ModelPartViewSet(viewsets.ModelViewSet):
    queryset = ModelPart.objects.all()
    serializer_class = ModelPartSerializer


class CarVariantViewSet(viewsets.ModelViewSet):
    queryset = CarVariant.objects.all().order_by('order')

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return CarVariantWriteSerializer
        return CarVariantSerializer

    @action(detail=True, methods=['get'])
    def compiled_jem(self, request, pk=None):
        """Return the fully compiled JEM JSON for this variant (body + injected parts)."""
        variant = self.get_object()
        jem = json.loads(json.dumps(variant.body.body_data))
        if variant.texture_override:
            jem['texture'] = variant.texture_override

        attachments = []
        for vp in VariantPart.objects.filter(variant=variant).order_by('order'):
            # Build an inlined entry: attachment wrapper + JPM geometry as submodels.
            # The viewer renders submodels directly; "model" refs to .jpm files are skipped.
            entry = {k: v for k, v in vp.part.attachment_meta.items() if k != 'model'}
            jpm = vp.part.part_data
            # Wrap the JPM root as a submodel of the attachment entry
            entry['submodels'] = [jpm]
            attachments.append(entry)

        if attachments:
            jem['models'] = [jem['models'][0]] + attachments + jem['models'][1:]

        return Response(jem)

    @action(detail=False, methods=['post'])
    def export(self, request):
        """
        Regenerate all .jem files and .properties files in the pack
        from the current database state.
        """
        pack_root = Path(settings.PACK_ROOT)
        cem_dir = pack_root / 'assets' / 'minecraft' / 'optifine' / 'cem'
        errors = []

        variants = CarVariant.objects.all().order_by('order')

        # Group variants by entity body to generate one .properties file per body
        bodies_seen: dict[int, list[CarVariant]] = {}
        for variant in variants:
            bodies_seen.setdefault(variant.body_id, []).append(variant)

        for body_id, body_variants in bodies_seen.items():
            body = EntityBody.objects.get(pk=body_id)

            for variant in body_variants:
                try:
                    _write_jem(cem_dir, variant)
                except Exception as e:
                    errors.append(f'{variant.file_name}.jem: {e}')

            try:
                _write_properties(cem_dir, body, body_variants)
            except Exception as e:
                errors.append(f'{body.jem_file_name}.properties: {e}')

        # Write each .jpm file
        for part in ModelPart.objects.all():
            try:
                _write_jpm(cem_dir, part)
            except Exception as e:
                errors.append(f'{part.name}.jpm: {e}')

        if errors:
            return Response({'status': 'partial', 'errors': errors},
                            status=status.HTTP_207_MULTI_STATUS)
        return Response({'status': 'ok'})


# ── helpers ──────────────────────────────────────────────────────────────────

def _write_jem(cem_dir: Path, variant: CarVariant):
    """Build and write a .jem file for a CarVariant."""
    jem = json.loads(json.dumps(variant.body.body_data))  # deep copy
    if variant.texture_override:
        jem['texture'] = variant.texture_override

    # Collect attachment entries for each part in order
    attachments = []
    for vp in VariantPart.objects.filter(variant=variant).order_by('order'):
        entry = dict(vp.part.attachment_meta)
        entry['model'] = vp.part.jpm_path
        attachments.append(entry)

    if attachments:
        # Insert after index 0 (the "front" body entry)
        jem['models'] = [jem['models'][0]] + attachments + jem['models'][1:]

    out_path = cem_dir / f'{variant.file_name}.jem'
    out_path.write_text(json.dumps(jem, indent='\t'), encoding='utf-8')


def _write_jpm(cem_dir: Path, part: ModelPart):
    """Write the .jpm file for a ModelPart."""
    # Derive sub-path from jpm_path:
    # "minecraft:optifine/cem/miata/parts/miata_duce_wheels.jpm"
    # → miata/parts/miata_duce_wheels.jpm
    rel = part.jpm_path.split('optifine/cem/', 1)[-1]
    out_path = cem_dir / rel
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(part.part_data, indent='\t'), encoding='utf-8')


def _write_properties(cem_dir: Path, body: EntityBody, variants: list):
    """
    Regenerate the .properties file for an entity body.
    Only triggered variants (trigger_name != '') get entries.
    """
    triggered = [v for v in variants if v.trigger_name]
    if not triggered:
        return

    lines = [f'# Auto-generated by Garage64 editor\n']
    for v in sorted(triggered, key=lambda v: v.order):
        lines.append(f'models.{v.order}={v.order + 1}\n')
        lines.append(f'name.{v.order}={v.trigger_name}\n')

    props_path = cem_dir / f'{body.jem_file_name}.properties'
    props_path.write_text(''.join(lines), encoding='utf-8')


# ── Music file server ─────────────────────────────────────────────────────────

AUDIO_EXTS = {'.mp3', '.flac', '.ogg', '.wav', '.m4a', '.aac', '.opus'}
MUSIC_ROOT  = Path.home()

@api_view(['GET'])
def music_list(request):
    """
    GET /api/music/?dir=/some/path — list audio files in the given directory.
    Falls back to ~/Music then ~/ if dir not supplied or invalid.
    """
    raw_dir = request.query_params.get('dir', '').strip()
    if raw_dir:
        root = Path(raw_dir).expanduser()
    else:
        root = Path.home() / 'Music'
        if not root.is_dir():
            root = MUSIC_ROOT

    if not root.is_dir():
        return Response({'error': f'Not a directory: {root}'}, status=400)

    tracks = []
    for p in sorted(root.rglob('*')):
        if p.is_file() and p.suffix.lower() in AUDIO_EXTS:
            tracks.append({'name': p.name, 'path': str(p)})
    return Response(tracks)

@api_view(['GET'])
def music_stream(request):
    """GET /api/music/stream/?path=<absolute-path> — stream an audio file."""
    raw = request.query_params.get('path', '')
    p = Path(raw).expanduser()
    if not p.is_file() or p.suffix.lower() not in AUDIO_EXTS:
        raise Http404
    # Must stay inside the user's home directory
    try:
        p.relative_to(MUSIC_ROOT)
    except ValueError:
        raise Http404
    mime, _ = mimetypes.guess_type(str(p))
    return FileResponse(open(p, 'rb'), content_type=mime or 'audio/mpeg')


# ── Pack asset file server ────────────────────────────────────────────────────

@api_view(['GET', 'PUT'])
def pack_asset(request):
    """
    GET  /api/asset/?path=textures/entity/boat/oak.png  — serve file
    PUT  /api/asset/?path=textures/entity/boat/oak.png  — overwrite file (raw body)
    """
    rel = request.query_params.get('path', '')
    if not rel or '..' in rel:
        raise Http404

    full_path = Path(settings.PACK_ROOT) / 'assets' / 'minecraft' / rel

    if request.method == 'PUT':
        full_path.parent.mkdir(parents=True, exist_ok=True)
        full_path.write_bytes(request.body)
        return Response({'status': 'ok'})

    if not full_path.exists() or not full_path.is_file():
        raise Http404

    mime, _ = mimetypes.guess_type(str(full_path))
    return FileResponse(open(full_path, 'rb'), content_type=mime or 'application/octet-stream')
