"""Convert HOS schedules into ELD daily log data."""

from __future__ import annotations

import logging
import math
from typing import Any

logger = logging.getLogger(__name__)

MINUTES_PER_DAY = 24 * 60
GRID_INTERVAL_MINUTES = 15
GRID_SLOTS_PER_DAY = MINUTES_PER_DAY // GRID_INTERVAL_MINUTES

STATUS_OFF_DUTY = "off_duty"
STATUS_SLEEPER_BERTH = "sleeper_berth"
STATUS_DRIVING = "driving"
STATUS_ON_DUTY_NOT_DRIVING = "on_duty_not_driving"
VALID_STATUSES = {
    STATUS_OFF_DUTY,
    STATUS_SLEEPER_BERTH,
    STATUS_DRIVING,
    STATUS_ON_DUTY_NOT_DRIVING,
}

EVENT_STATUS_MAP = {
    "off_duty": STATUS_OFF_DUTY,
    "sleeper_berth": STATUS_SLEEPER_BERTH,
    "driving": STATUS_DRIVING,
    "on_duty_not_driving": STATUS_ON_DUTY_NOT_DRIVING,
}


def _time_to_minutes(value: Any) -> int:
    if not isinstance(value, str):
        raise ValueError("event times must be HH:MM strings")
    parts = value.split(":")
    if len(parts) != 2:
        raise ValueError(f"invalid event time: {value}")
    hour, minute = int(parts[0]), int(parts[1])
    if not 0 <= hour <= 23 or not 0 <= minute <= 59:
        raise ValueError(f"invalid event time: {value}")
    return hour * 60 + minute


def _round_hours(minutes: int) -> float:
    return round(minutes / 60, 2)


def _event_interval(event: dict) -> tuple[int, int]:
    start = _time_to_minutes(event.get("start_time"))
    duration = float(event.get("duration_hours"))
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError("event duration must be a positive finite number")
    duration_minutes = int(round(duration * 60))
    if duration_minutes <= 0 or duration_minutes > MINUTES_PER_DAY:
        raise ValueError("event duration must be between 1 minute and 24 hours")
    end = start + duration_minutes
    if end > MINUTES_PER_DAY:
        raise ValueError("events must be split at midnight before ELD generation")
    return start, end


def _normalise_event(event: dict) -> dict:
    if not isinstance(event, dict):
        raise ValueError("each ELD event must be an object")
    event_type = event.get("event_type")
    status = EVENT_STATUS_MAP.get(event_type)
    if status is None:
        raise ValueError(f"unsupported HOS event type: {event_type}")
    start, end = _event_interval(event)
    result = {
        "status": status,
        "start_minute": start,
        "end_minute": end,
        "start_time": event["start_time"],
        "end_time": "24:00" if end == MINUTES_PER_DAY else _format_time(end),
        "duration_hours": _round_hours(end - start),
        "location": event.get("location", ""),
        "notes": event.get("notes", ""),
    }
    for key in ("lat", "lng"):
        if key in event:
            result[key] = event[key]
    return result


def _format_time(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def _validate_timeline(events: list[dict]) -> None:
    ordered = sorted(events, key=lambda event: event["start_minute"])
    cursor = 0
    for event in ordered:
        if event["start_minute"] < cursor:
            raise ValueError("ELD events overlap")
        if event["start_minute"] > cursor:
            raise ValueError("ELD events leave an uncovered period")
        cursor = event["end_minute"]
    if cursor != MINUTES_PER_DAY:
        raise ValueError("ELD events must cover exactly 24 hours")


def _grid_for_events(events: list[dict]) -> list[str]:
    grid = [STATUS_OFF_DUTY] * GRID_SLOTS_PER_DAY
    for slot in range(GRID_SLOTS_PER_DAY):
        midpoint = slot * GRID_INTERVAL_MINUTES + GRID_INTERVAL_MINUTES / 2
        matching = [event for event in events if event["start_minute"] <= midpoint < event["end_minute"]]
        if len(matching) != 1:
            raise ValueError("each ELD grid interval must have exactly one status")
        grid[slot] = matching[0]["status"]
    return grid


def _totals(events: list[dict]) -> dict[str, float]:
    totals = {status: 0.0 for status in VALID_STATUSES}
    for event in events:
        totals[event["status"]] += event["duration_hours"]
    return {status: round(total, 2) for status, total in totals.items()}


def _annotations(events: list[dict]) -> list[dict]:
    annotations = []
    for event in events:
        if not event["notes"]:
            continue
        annotations.append({
            "start_time": event["start_time"],
            "end_time": event["end_time"],
            "status": event["status"],
            "label": event["notes"],
            "location": event["location"],
        })
    return annotations


def generate_eld_logs(hos_result: dict) -> dict:
    """Generate daily ELD logs from a successful ``calculate_trip`` result."""
    try:
        if not isinstance(hos_result, dict):
            raise ValueError("HOS result must be an object")
        if hos_result.get("success") is not True:
            raise ValueError(hos_result.get("error", "HOS calculation was not successful"))
        source_days = hos_result.get("days")
        if not isinstance(source_days, list) or not source_days:
            raise ValueError("HOS result must contain at least one day")

        days = []
        for source_day in source_days:
            if not isinstance(source_day, dict):
                raise ValueError("each HOS day must be an object")
            events = [_normalise_event(event) for event in source_day.get("events", [])]
            _validate_timeline(events)
            events.sort(key=lambda event: event["start_minute"])
            days.append({
                "day_number": source_day.get("day_number"),
                "date_offset": source_day.get("date_offset"),
                "grid_interval_minutes": GRID_INTERVAL_MINUTES,
                "grid": _grid_for_events(events),
                "events": events,
                "annotations": _annotations(events),
                "totals": _totals(events),
            })

        logger.info("Generated ELD logs for %d day(s)", len(days))
        return {
            "success": True,
            "total_trip_days": len(days),
            "days": days,
        }
    except (TypeError, ValueError, KeyError, IndexError) as exc:
        logger.warning("ELD generation failed: %s", exc)
        return {"success": False, "error": str(exc)}


def generate_eld_log(hos_result: dict) -> dict:
    """Backward-compatible singular alias for ``generate_eld_logs``."""
    return generate_eld_logs(hos_result)