from django.db import models


class PartSlot(models.Model):
    """
    A named category for swappable parts (e.g. wheels, headlights).
    Parts in the same slot are mutually exclusive in the Builder.
    Slots appear in the Builder sidebar in `order` even when empty.
    """
    name = models.CharField(max_length=50, unique=True)   # slug used in ModelPart.slot
    display_name = models.CharField(max_length=100)        # shown in UI
    order = models.PositiveIntegerField(default=0)

    def __str__(self):
        return self.display_name

    class Meta:
        ordering = ['order']


class EntityBody(models.Model):
    """
    Stores a base .jem file — the shared car body geometry.
    body_data is the full JEM JSON with NO jpm-referencing entries
    in the models array (those live on ModelPart).
    """
    name = models.CharField(max_length=100, unique=True)  # e.g. "miata_base"
    jem_file_name = models.CharField(max_length=100)       # e.g. "oak_boat" (no extension)
    entity_type = models.CharField(max_length=50)          # e.g. "boat"
    body_data = models.JSONField()                         # full oak_boat.jem content

    def __str__(self):
        return self.name

    class Meta:
        verbose_name_plural = 'entity bodies'


class ModelPart(models.Model):
    """
    One swappable JPM part (wheels, popups, etc.).
    attachment_meta is the wrapper object that gets inserted into the
    JEM models array — everything EXCEPT the "model" key itself.
    """
    name = models.CharField(max_length=100, unique=True)  # e.g. "miata_duce_wheels"
    jpm_path = models.CharField(max_length=300)            # e.g. "minecraft:optifine/cem/miata/parts/miata_duce_wheels.jpm"
    part_data = models.JSONField()                         # raw JPM file content
    # Slot groups mutually-exclusive parts (e.g. "wheels", "headlights").
    # Parts in the same slot use radio-button selection in the Builder UI.
    # Leave blank for standalone toggle parts.
    slot = models.CharField(max_length=50, blank=True)
    # The attachment wrapper: id, part, attach, invertAxis, mirrorTexture,
    # translate, rotate, texture, textureSize — everything except "model"
    attachment_meta = models.JSONField()

    def __str__(self):
        return self.name


class CarVariant(models.Model):
    """
    One .jem variant. Combines a body + a set of ModelParts.
    On export this generates file_name.jem and an entry in
    the entity's .properties file (unless trigger_name is blank,
    which means it is the default/fallback model).
    """
    file_name = models.CharField(max_length=100, unique=True)  # e.g. "oak_boat2"
    # The name string that triggers this variant in .properties (blank = default)
    trigger_name = models.CharField(max_length=100, blank=True)
    body = models.ForeignKey(EntityBody, on_delete=models.CASCADE, related_name='variants')
    # Ordered list of parts attached to this variant
    parts = models.ManyToManyField(ModelPart, through='VariantPart', blank=True)
    # order controls the index in the .properties file (1-based, 0 = default)
    order = models.PositiveIntegerField(default=0)

    def __str__(self):
        return self.file_name

    class Meta:
        ordering = ['order']


class VariantPart(models.Model):
    """Through table — which parts are attached to a variant, and in what order."""
    variant = models.ForeignKey(CarVariant, on_delete=models.CASCADE)
    part = models.ForeignKey(ModelPart, on_delete=models.CASCADE)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order']
        unique_together = [('variant', 'part')]

    def __str__(self):
        return f'{self.variant.file_name} → {self.part.name}'
