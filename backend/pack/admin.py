from django.contrib import admin
from .models import EntityBody, ModelPart, CarVariant, VariantPart, PartSlot


@admin.register(PartSlot)
class PartSlotAdmin(admin.ModelAdmin):
    list_display = ['order', 'name', 'display_name']
    list_display_links = ['name']
    list_editable = ['display_name', 'order']


class VariantPartInline(admin.TabularInline):
    model = VariantPart
    extra = 0


@admin.register(EntityBody)
class EntityBodyAdmin(admin.ModelAdmin):
    list_display = ['name', 'jem_file_name', 'entity_type']


@admin.register(ModelPart)
class ModelPartAdmin(admin.ModelAdmin):
    list_display = ['name', 'jpm_path']


@admin.register(CarVariant)
class CarVariantAdmin(admin.ModelAdmin):
    list_display = ['file_name', 'trigger_name', 'body', 'order']
    inlines = [VariantPartInline]
