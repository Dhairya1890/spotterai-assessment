"""Hours-of-service trip scheduling."""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)

MAX_DRIVING_HOURS_PER_SHIFT = 11.0
MAX_WINDOW_HOURS = 14.0
REQUIRED_BREAK_AFTER_HOURS = 8.0
BREAK_DURATION_HOURS = 0.5
REST_PERIOD_HOURS = 10.0
MAX_CYCLE_HOURS = 70.0
RESTART_HOURS = 34.0
PICKUP_DURATION_HOURS = 1.0
DROPOFF_DURATION_HOURS = 1.0
FUEL_STOP_INTERVAL_MILES = 1000.0
FUEL_STOP_DURATION_HOURS = 0.5
SHIFT_START_HOUR = 6
MINUTES_PER_DAY = 1440


@dataclass
class _Event:
    event_type: str
    start: float
    end: float
    location: str
    notes: str
    start_miles: float = 0.0
    end_miles: float = 0.0


def _number(value: Any, name: str, minimum: float = 0.0) -> float:
    number = float(value)
    if not math.isfinite(number) or number < minimum:
        raise ValueError(f"{name} must be a finite number >= {minimum}")
    return number


def _location(place: dict) -> str:
    return str(place.get("display_name") or "Unknown location")


def _route_location(miles: float, total_miles: float, start_name: str, end_name: str) -> str:
    if miles <= 0:
        return start_name
    if miles >= total_miles:
        return end_name
    return f"Near route mile {miles:.1f}"


def _point_at_miles(coordinates: list, miles: float, total_miles: float) -> dict:
    if not coordinates:
        return {}
    if len(coordinates) == 1:
        coordinate = coordinates[0]
    else:
        fraction = max(0.0, min(1.0, miles / total_miles)) if total_miles else 0.0
        position = fraction * (len(coordinates) - 1)
        index = min(int(position), len(coordinates) - 2)
        remainder = position - index
        first, second = coordinates[index], coordinates[index + 1]
        coordinate = [float(first[0]) + (float(second[0]) - float(first[0])) * remainder,
                      float(first[1]) + (float(second[1]) - float(first[1])) * remainder]
    return {"lat": round(float(coordinate[1]), 6), "lng": round(float(coordinate[0]), 6)}


def _add_event(events: list[_Event], event_type: str, start: float, duration: float,
               location: str, notes: str, start_miles: float = 0.0,
               end_miles: float = 0.0) -> float:
    if duration <= 0:
        return start
    end = start + duration * 60
    events.append(_Event(event_type, start, end, location, notes, start_miles, end_miles))
    return end


def _time(minutes: float) -> str:
    value = int(round(minutes)) % MINUTES_PER_DAY
    return f"{value // 60:02d}:{value % 60:02d}"


def _hours(minutes: float) -> float:
    return round(minutes / 60, 2)


def _validate_input(data: dict) -> tuple:
    if not isinstance(data, dict):
        raise ValueError("Trip input must be an object")
    route = data.get("route")
    if not isinstance(route, dict):
        raise ValueError("route is required")
    places = (data.get("current_location"), data.get("pickup_location"), data.get("dropoff_location"))
    if not all(isinstance(place, dict) for place in places):
        raise ValueError("current_location, pickup_location, and dropoff_location are required")
    total_miles = _number(route.get("total_distance_miles"), "total_distance_miles")
    total_hours = _number(route.get("total_duration_hours"), "total_duration_hours")
    cycle_used = _number(data.get("current_cycle_used"), "current_cycle_used")
    if cycle_used > MAX_CYCLE_HOURS:
        raise ValueError("current_cycle_used cannot exceed 70 hours")
    if total_miles and total_hours <= 0:
        raise ValueError("a non-zero-distance route needs a positive duration")
    geometry = route.get("geometry") or {}
    coordinates = geometry.get("coordinates", []) if isinstance(geometry, dict) else []
    return *places, total_miles, total_hours, cycle_used, coordinates


def calculate_trip(data: dict) -> dict:
    """Calculate the HOS schedule, returning a structured failure on bad input."""
    try:
        current, pickup, dropoff, total_miles, total_hours, cycle_used, coordinates = _validate_input(data)
        current_name, pickup_name, dropoff_name = map(_location, (current, pickup, dropoff))
        location_at_miles = lambda distance: _route_location(distance, total_miles, current_name, dropoff_name)
        pace = total_hours / total_miles if total_miles else 0.0
        fuel_interval = int(FUEL_STOP_INTERVAL_MILES)
        fuel_positions = list(range(fuel_interval, math.floor(total_miles) + 1, fuel_interval))
        events: list[_Event] = []
        current_time = SHIFT_START_HOUR * 60.0
        shift_start = current_time
        miles = shift_driving = driving_since_break = 0.0
        cycle = cycle_used
        fuel_index = 0
        had_restart = False

        def restart() -> None:
            nonlocal current_time, cycle, had_restart, shift_start, shift_driving, driving_since_break
            current_time = _add_event(events, "off_duty", current_time, RESTART_HOURS, location_at_miles(miles), "34-hour cycle restart", miles, miles)
            cycle = 0.0
            had_restart = True
            shift_start = current_time
            shift_driving = driving_since_break = 0.0

        def end_shift() -> None:
            nonlocal current_time, shift_start, shift_driving, driving_since_break
            current_time = _add_event(events, "off_duty", current_time, REST_PERIOD_HOURS, location_at_miles(miles), "10-hour rest period", miles, miles)
            shift_start = current_time
            shift_driving = driving_since_break = 0.0

        if cycle >= MAX_CYCLE_HOURS - PICKUP_DURATION_HOURS:
            restart()
        current_time = _add_event(events, "on_duty_not_driving", current_time, PICKUP_DURATION_HOURS, pickup_name, "Pickup")
        cycle += PICKUP_DURATION_HOURS

        while miles < total_miles - 1e-7:
            if cycle >= MAX_CYCLE_HOURS - 1e-7:
                restart()
                continue
            if shift_driving >= MAX_DRIVING_HOURS_PER_SHIFT - 1e-7 or current_time >= shift_start + MAX_WINDOW_HOURS * 60 - 1e-7:
                end_shift()
                continue
            next_mile = fuel_positions[fuel_index] if fuel_index < len(fuel_positions) else total_miles
            target_miles = min(next_mile, total_miles)
            remaining_hours = (target_miles - miles) * pace
            available = min(MAX_DRIVING_HOURS_PER_SHIFT - shift_driving,
                            (shift_start + MAX_WINDOW_HOURS * 60 - current_time) / 60,
                            REQUIRED_BREAK_AFTER_HOURS - driving_since_break,
                            MAX_CYCLE_HOURS - cycle, remaining_hours)
            if available <= 1e-7:
                if cycle >= MAX_CYCLE_HOURS - 1e-7:
                    restart()
                elif shift_driving >= MAX_DRIVING_HOURS_PER_SHIFT - 1e-7 or current_time >= shift_start + MAX_WINDOW_HOURS * 60 - 1e-7:
                    end_shift()
                else:
                    current_time = _add_event(events, "off_duty", current_time, BREAK_DURATION_HOURS, location_at_miles(miles), "Mandatory 30-minute break", miles, miles)
                    driving_since_break = 0.0
                continue
            start_miles = miles
            miles = min(total_miles, miles + available / pace) if pace else total_miles
            actual_hours = (miles - start_miles) * pace
            current_time = _add_event(events, "driving", current_time, actual_hours,
                                      f"{location_at_miles(start_miles)} to {location_at_miles(miles)}", "Driving segment", start_miles, miles)
            shift_driving += actual_hours
            driving_since_break += actual_hours
            cycle += actual_hours
            logger.info("HOS driving: miles %.2f -> %.2f, hours %.2f, cycle %.2f", start_miles, miles, actual_hours, cycle)
            if miles >= next_mile - 1e-7 and next_mile < total_miles:
                current_time = _add_event(events, "on_duty_not_driving", current_time, FUEL_STOP_DURATION_HOURS, location_at_miles(miles), "Fuel stop", miles, miles)
                cycle += FUEL_STOP_DURATION_HOURS
                fuel_index += 1
            elif miles >= total_miles - 1e-7:
                break
            elif driving_since_break >= REQUIRED_BREAK_AFTER_HOURS - 1e-7:
                current_time = _add_event(events, "off_duty", current_time, BREAK_DURATION_HOURS, location_at_miles(miles), "Mandatory 30-minute break", miles, miles)
                driving_since_break = 0.0

        while cycle + DROPOFF_DURATION_HOURS > MAX_CYCLE_HOURS + 1e-7:
            restart()
        if shift_driving >= MAX_DRIVING_HOURS_PER_SHIFT - 1e-7 or current_time + DROPOFF_DURATION_HOURS * 60 > shift_start + MAX_WINDOW_HOURS * 60 + 1e-7:
            end_shift()
        current_time = _add_event(events, "on_duty_not_driving", current_time, DROPOFF_DURATION_HOURS, dropoff_name, "Dropoff", total_miles, total_miles)
        cycle += DROPOFF_DURATION_HOURS
        return _build_result(events, current, total_miles, total_hours, cycle_used, had_restart, coordinates)
    except (TypeError, ValueError, KeyError, IndexError) as exc:
        logger.warning("HOS calculation failed: %s", exc)
        return {"success": False, "error": str(exc)}


def _build_result(events: list[_Event], current: dict, total_miles: float, total_hours: float,
                  initial_cycle: float, had_restart: bool, coordinates: list) -> dict:
    last_end = max((event.end for event in events), default=SHIFT_START_HOUR * 60)
    day_count = max(1, math.ceil(last_end / MINUTES_PER_DAY))
    days, all_stops = [], []
    for day_number in range(1, day_count + 1):
        day_start, day_end = (day_number - 1) * MINUTES_PER_DAY, day_number * MINUTES_PER_DAY
        day_events = []
        cursor = day_start
        for event in events:
            start, end = max(event.start, day_start), min(event.end, day_end)
            if end <= start:
                continue
            if start > cursor:
                day_events.append({"event_type": "off_duty", "start_time": _time(cursor), "end_time": _time(start),
                                   "duration_hours": _hours(start - cursor), "location": _location(current), "notes": "Off duty"})
            entry = {"event_type": event.event_type, "start_time": _time(start), "end_time": _time(end),
                     "duration_hours": _hours(end - start), "location": event.location, "notes": event.notes}
            entry.update(_point_at_miles(coordinates, event.start_miles, total_miles))
            day_events.append(entry)
            cursor = max(cursor, end)
        if cursor < day_end:
            day_events.append({"event_type": "off_duty", "start_time": _time(cursor), "end_time": _time(day_end),
                               "duration_hours": _hours(day_end - cursor), "location": _location(current), "notes": "Off duty"})
        day_events.sort(key=lambda entry: entry["start_time"])
        driving = sum(e["duration_hours"] for e in day_events if e["event_type"] == "driving")
        on_duty = sum(e["duration_hours"] for e in day_events if e["event_type"] == "on_duty_not_driving")
        off_duty = sum(e["duration_hours"] for e in day_events if e["event_type"] == "off_duty")
        stops = _stops_for_events(events, day_start, day_end, coordinates, total_miles)
        all_stops.extend(stops)
        active = [e for e in events if e.start < day_end and e.end > day_start and e.event_type in ("driving", "on_duty_not_driving")]
        cycle_at_day_end = initial_cycle
        for event in events:
            if event.start >= day_end:
                break
            if event.notes == "34-hour cycle restart" and event.end <= day_end:
                cycle_at_day_end = 0.0
            elif event.event_type in ("driving", "on_duty_not_driving"):
                cycle_at_day_end += _hours(min(event.end, day_end) - event.start) if event.start < day_end else 0.0
        days.append({"day_number": day_number, "date_offset": day_number - 1,
                     "shift_start_time": _time(active[0].start if active else day_start),
                     "shift_end_time": _time(active[-1].end if active else day_start),
                     "total_hours_driving": round(driving, 2),
                     "total_hours_on_duty_not_driving": round(on_duty, 2),
                     "total_hours_off_duty": round(off_duty, 2), "total_hours_sleeper_berth": 0,
                     "cycle_hours_used_end_of_day": round(cycle_at_day_end, 2), "events": day_events, "stops": stops})
    final_cycle = initial_cycle
    for event in events:
        if event.notes == "34-hour cycle restart":
            final_cycle = 0.0
        elif event.event_type in ("driving", "on_duty_not_driving"):
            final_cycle += _hours(event.end - event.start)
    on_duty_total = sum(_hours(event.end - event.start) for event in events if event.event_type in ("driving", "on_duty_not_driving"))
    return {"success": True, "total_trip_days": day_count, "total_driving_hours": round(total_hours, 2),
            "total_on_duty_hours": round(on_duty_total, 2),
            "cycle_hours_used_after_trip": round(final_cycle, 2), "had_cycle_restart": had_restart,
            "days": days, "all_stops": all_stops}


def _stops_for_events(events: list[_Event], day_start: float, day_end: float,
                      coordinates: list, total_miles: float) -> list[dict]:
    types = {"Mandatory 30-minute break": "break_30min", "Fuel stop": "fuel",
             "10-hour rest period": "rest_10hr", "34-hour cycle restart": "restart_34hr",
             "Pickup": "pickup", "Dropoff": "dropoff"}
    stops = []
    for event in events:
        if event.notes not in types or event.start >= day_end or event.end <= day_start:
            continue
        point = _point_at_miles(coordinates, event.start_miles, total_miles)
        stops.append({"stop_type": types[event.notes], "location": event.location, **point,
                      "arrival_time": _time(max(event.start, day_start)), "departure_time": _time(min(event.end, day_end))})
    return stops