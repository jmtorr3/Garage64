from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import EntityBodyViewSet, ModelPartViewSet, CarVariantViewSet, PartSlotViewSet, pack_asset

router = DefaultRouter()
router.register('bodies', EntityBodyViewSet, basename='body')
router.register('parts', ModelPartViewSet, basename='part')
router.register('variants', CarVariantViewSet, basename='variant')
router.register('slots', PartSlotViewSet, basename='slot')

urlpatterns = router.urls + [
    path('asset/', pack_asset),
]
