import os

import polyline
import requests


_REQUEST_TIMEOUT_SECONDS = 10


def geocode(place_name: str) -> dict:
    print(f"[ORS Geocode] Searching for: {place_name}")
    try:
        api_key = os.environ.get("ORS_API_KEY", "")
        base_url = os.environ.get("ORS_BASE_URL", "").rstrip("/")
        if not api_key:
            raise ValueError("ORS_API_KEY is not configured")
        if not base_url:
            raise ValueError("ORS_BASE_URL is not configured")

        response = requests.get(
            f"{base_url}/geocode/search",
            params={"api_key": api_key, "text": place_name, "size": 1},
            timeout=_REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        data = response.json()
        features = data.get("features", [])
        if not features:
            error = f"No results found for: {place_name}"
            print(f"[ORS Geocode] Failed: {error}")
            return {"success": False, "place_name": place_name, "error": error}

        feature = features[0]
        coordinates = feature.get("geometry", {}).get("coordinates", [])
        display_name = feature.get("properties", {}).get("label")
        requested_tokens = place_name.replace(",", " ").split()
        if (
            len(coordinates) < 2
            or not display_name
            or any(token.casefold() not in display_name.casefold() for token in requested_tokens)
        ):
            if display_name and requested_tokens:
                error = f"No results found for: {place_name}"
                print(f"[ORS Geocode] Failed: {error}")
                return {"success": False, "place_name": place_name, "error": error}
            raise ValueError("ORS returned an incomplete geocoding result")

        lng, lat = coordinates[:2]
        print(f"[ORS Geocode] Result: lat={lat}, lng={lng}, display={display_name}")
        return {
            "success": True,
            "place_name": place_name,
            "lat": lat,
            "lng": lng,
            "display_name": display_name,
        }
    except requests.exceptions.Timeout:
        error = "ORS request timed out after 10 seconds"
    except requests.exceptions.HTTPError as exc:
        status_code = exc.response.status_code if exc.response is not None else None
        if status_code == 401:
            error = "ORS API authentication failed, check your API key"
        else:
            error = f"ORS API error: {status_code}"
    except Exception as exc:
        error = f"Unexpected error: {str(exc)}"

    print(f"[ORS Geocode] Failed: {error}")
    return {"success": False, "place_name": place_name, "error": error}


def get_route(coordinates: list) -> dict:
    try:
        coordinate_count = len(coordinates)
    except Exception as exc:
        error = f"Unexpected error: {str(exc)}"
        print(f"[ORS Route] Failed: {error}")
        return {"success": False, "error": error}

    print(f"[ORS Route] Getting route for {coordinate_count} coordinates")
    if coordinate_count < 2:
        error = "At least 2 coordinates required"
        print(f"[ORS Route] Failed: {error}")
        return {"success": False, "error": error}

    try:
        api_key = os.environ.get("ORS_API_KEY", "")
        base_url = os.environ.get("ORS_BASE_URL", "").rstrip("/")
        if not api_key:
            raise ValueError("ORS_API_KEY is not configured")
        if not base_url:
            raise ValueError("ORS_BASE_URL is not configured")

        response = requests.post(
            f"{base_url}/v2/directions/driving-hgv",
            headers={
                "Authorization": api_key,
                "Content-Type": "application/json",
            },
            json={
                "coordinates": coordinates,
                "units": "mi",
                "instructions": False,
            },
            params={"geometry_format": "geojson"},
            timeout=_REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        data = response.json()
        routes = data.get("routes", [])
        if not routes:
            error = "No route found between provided locations"
            print(f"[ORS Route] Failed: {error}")
            return {"success": False, "error": error}

        route = routes[0]
        summary = route.get("summary", {})
        geometry = route.get("geometry")
        if isinstance(geometry, str):
            geometry_coordinates = [[lng, lat] for lat, lng in polyline.decode(geometry)]
        else:
            geometry_coordinates = geometry.get("coordinates", []) if isinstance(geometry, dict) else []
        raw_segments = route.get("segments", [])
        if "distance" not in summary or "duration" not in summary or not geometry_coordinates:
            raise ValueError("ORS returned an incomplete route result")

        total_distance_miles = round(summary["distance"], 2)
        total_duration_hours = round(summary["duration"] / 3600, 2)
        if raw_segments:
            segments = [
                {
                    "from_index": index,
                    "to_index": index + 1,
                    "distance_miles": round(segment["distance"], 2),
                    "duration_hours": round(segment["duration"] / 3600, 2),
                }
                for index, segment in enumerate(raw_segments)
            ]
        else:
            segments = []
            for index in range(coordinate_count - 1):
                segment_response = requests.post(
                    f"{base_url}/v2/directions/driving-hgv",
                    headers={
                        "Authorization": api_key,
                        "Content-Type": "application/json",
                    },
                    json={
                        "coordinates": coordinates[index : index + 2],
                        "units": "mi",
                        "instructions": False,
                    },
                    timeout=_REQUEST_TIMEOUT_SECONDS,
                )
                segment_response.raise_for_status()
                segment_routes = segment_response.json().get("routes", [])
                if not segment_routes or "summary" not in segment_routes[0]:
                    raise ValueError("ORS returned no summary for a route segment")
                segment_summary = segment_routes[0]["summary"]
                segments.append(
                    {
                        "from_index": index,
                        "to_index": index + 1,
                        "distance_miles": round(segment_summary["distance"], 2),
                        "duration_hours": round(segment_summary["duration"] / 3600, 2),
                    }
                )

        print(f"[ORS Route] Total distance: {total_distance_miles} miles")
        print(f"[ORS Route] Total duration: {total_duration_hours} hours")
        print(f"[ORS Route] Segments: {len(segments)}")
        return {
            "success": True,
            "total_distance_miles": total_distance_miles,
            "total_duration_hours": total_duration_hours,
            "geometry": {"coordinates": geometry_coordinates},
            "segments": segments,
        }
    except requests.exceptions.Timeout:
        error = "ORS request timed out after 10 seconds"
    except requests.exceptions.HTTPError as exc:
        status_code = exc.response.status_code if exc.response is not None else None
        if status_code == 401:
            error = "ORS API authentication failed, check your API key"
        elif status_code == 404:
            error = "No route found between provided locations"
        else:
            response_text = exc.response.text if exc.response is not None else ""
            error = f"ORS API error: {status_code} - {response_text}"
    except Exception as exc:
        error = f"Unexpected error: {str(exc)}"

    print(f"[ORS Route] Failed: {error}")
    return {"success": False, "error": error}
