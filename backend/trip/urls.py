from django.urls import path

from .views import (auth_logout_view, auth_session_view, auth_view,
                    calculate_hos_view, calculate_trip_view, generate_eld_view,
                    health_check)

urlpatterns = [
    path("health/", health_check, name="trip-health"),
    path("auth/", auth_view, name="trip-auth"),
    path("auth/logout/", auth_logout_view, name="trip-auth-logout"),
    path("auth/session/", auth_session_view, name="trip-auth-session"),
    path("calculate/", calculate_trip_view, name="trip-calculate"),
    path("hos/", calculate_hos_view, name="trip-hos"),
    path("eld/", generate_eld_view, name="trip-eld"),
]
