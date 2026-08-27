import json

from django.http import JsonResponse

from .eld_generator import generate_eld_logs
from .hos_calculator import calculate_trip
from .ors_client import geocode, get_route


def _json_body(request) -> tuple[dict | None, JsonResponse | None]:
    if request.method != "POST":
        return None, JsonResponse({"success": False, "error": "POST method required"}, status=405)
    try:
        payload = json.loads(request.body or "{}")
    except (TypeError, ValueError):
        return None, JsonResponse({"success": False, "error": "Request body must be valid JSON"}, status=400)
    if not isinstance(payload, dict):
        return None, JsonResponse({"success": False, "error": "Request body must be a JSON object"}, status=400)
    return payload, None


def _error_response(result: dict, status: int = 400) -> JsonResponse:
    return JsonResponse(result, status=status)


def _resolve_location(value, field_name: str) -> tuple[dict | None, JsonResponse | None]:
    if isinstance(value, str) and value.strip():
        result = geocode(value.strip())
        if not result.get("success"):
            return None, _error_response({"success": False, "error": f"Unable to resolve {field_name}", "details": result}, 502)
        return result, None
    if not isinstance(value, dict):
        return None, _error_response({"success": False, "error": f"{field_name} must be a place name or coordinate object"})
    try:
        lat, lng = float(value["lat"]), float(value["lng"])
    except (KeyError, TypeError, ValueError):
        return None, _error_response({"success": False, "error": f"{field_name} requires numeric lat and lng"})
    if not -90 <= lat <= 90 or not -180 <= lng <= 180:
        return None, _error_response({"success": False, "error": f"{field_name} has invalid coordinates"})
    return {"lat": lat, "lng": lng, "display_name": str(value.get("display_name") or field_name)}, None


def _assemble_trip(payload: dict) -> tuple[dict | None, JsonResponse | None]:
    locations = {}
    for field_name in ("current_location", "pickup_location", "dropoff_location"):
        location, error = _resolve_location(payload.get(field_name), field_name)
        if error:
            return None, error
        locations[field_name] = location

    route = payload.get("route")
    if route is None:
        coordinates = [[locations[field]["lng"], locations[field]["lat"]] for field in locations]
        route = get_route(coordinates)
        if not route.get("success"):
            return None, _error_response({"success": False, "error": "Unable to calculate route", "details": route}, 502)
    elif not isinstance(route, dict):
        return None, _error_response({"success": False, "error": "route must be a JSON object"})

    trip = {**locations, "current_cycle_used": payload.get("current_cycle_used"), "route": route}
    return trip, None


def health_check(request):
    return JsonResponse({"success": True, "service": "trip"})


def calculate_trip_view(request):
    payload, error = _json_body(request)
    if error:
        return error
    trip, error = _assemble_trip(payload)
    if error:
        return error
    hos = calculate_trip(trip)
    if not hos.get("success"):
        return _error_response(hos)
    eld = generate_eld_logs(hos)
    if not eld.get("success"):
        return _error_response(eld)
    return JsonResponse({"success": True, "route": trip["route"], "hos": hos, "eld": eld})


def calculate_hos_view(request):
    payload, error = _json_body(request)
    if error:
        return error
    trip, error = _assemble_trip(payload)
    if error:
        return error
    result = calculate_trip(trip)
    return JsonResponse(result, status=200 if result.get("success") else 400)


def generate_eld_view(request):
    payload, error = _json_body(request)
    if error:
        return error
    result = generate_eld_logs(payload.get("hos") or payload)
    return JsonResponse(result, status=200 if result.get("success") else 400)
