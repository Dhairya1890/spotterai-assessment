from django.urls import path

from .views import calculate_hos_view, calculate_trip_view, generate_eld_view, health_check

urlpatterns = [
    path("health/", health_check, name="trip-health"),
    path("calculate/", calculate_trip_view, name="trip-calculate"),
    path("hos/", calculate_hos_view, name="trip-hos"),
    path("eld/", generate_eld_view, name="trip-eld"),
]
