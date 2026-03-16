from rest_framework import serializers
from .models import EntityBody, ModelPart, CarVariant, VariantPart, PartSlot


class PartSlotSerializer(serializers.ModelSerializer):
    class Meta:
        model = PartSlot
        fields = ['id', 'name', 'display_name', 'order']


class ModelPartSerializer(serializers.ModelSerializer):
    class Meta:
        model = ModelPart
        fields = ['id', 'name', 'jpm_path', 'part_data', 'attachment_meta', 'slot']


class VariantPartSerializer(serializers.ModelSerializer):
    part = ModelPartSerializer(read_only=True)
    part_id = serializers.PrimaryKeyRelatedField(
        queryset=ModelPart.objects.all(), source='part', write_only=True
    )

    class Meta:
        model = VariantPart
        fields = ['id', 'part', 'part_id', 'order']


class EntityBodySerializer(serializers.ModelSerializer):
    class Meta:
        model = EntityBody
        fields = ['id', 'name', 'jem_file_name', 'entity_type', 'body_data']


class CarVariantSerializer(serializers.ModelSerializer):
    variant_parts = VariantPartSerializer(
        source='variantpart_set', many=True, read_only=True
    )
    body_name = serializers.CharField(source='body.name', read_only=True)
    body_id = serializers.PrimaryKeyRelatedField(
        queryset=EntityBody.objects.all(), source='body', write_only=True
    )

    class Meta:
        model = CarVariant
        fields = [
            'id', 'file_name', 'trigger_name', 'body_id', 'body_name',
            'order', 'texture_override', 'variant_parts',
        ]


class CarVariantWriteSerializer(serializers.ModelSerializer):
    """Used for create/update — accepts part_ids list to set VariantParts."""
    part_ids = serializers.ListField(
        child=serializers.IntegerField(), write_only=True, required=False
    )

    class Meta:
        model = CarVariant
        fields = ['id', 'file_name', 'trigger_name', 'body', 'order', 'texture_override', 'part_ids']

    def _set_parts(self, variant, part_ids):
        VariantPart.objects.filter(variant=variant).delete()
        for i, pid in enumerate(part_ids):
            part = ModelPart.objects.get(pk=pid)
            VariantPart.objects.create(variant=variant, part=part, order=i)

    def create(self, validated_data):
        part_ids = validated_data.pop('part_ids', [])
        variant = super().create(validated_data)
        self._set_parts(variant, part_ids)
        return variant

    def update(self, instance, validated_data):
        part_ids = validated_data.pop('part_ids', None)
        variant = super().update(instance, validated_data)
        if part_ids is not None:
            self._set_parts(variant, part_ids)
        return variant
