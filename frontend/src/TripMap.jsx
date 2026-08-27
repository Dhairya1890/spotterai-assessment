import { useEffect, useMemo } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'

const stopColors = {
  pickup: '#e36b35',
  dropoff: '#397044',
  fuel: '#c58b2b',
  break_30min: '#65716b',
  rest_10hr: '#526b86',
  restart_34hr: '#8c4d64',
}

function FitRoute({ positions }) {
  const map = useMap()

  useEffect(() => {
    if (positions.length > 1) {
      map.fitBounds(L.latLngBounds(positions), { padding: [28, 28] })
    }
  }, [map, positions])

  return null
}

function markerIcon(color) {
  return L.divIcon({
    className: 'stop-marker',
    html: `<span style="background:${color}"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10],
  })
}

function toPosition(point) {
  if (!point || !Number.isFinite(Number(point.lat)) || !Number.isFinite(Number(point.lng))) return null
  return [Number(point.lat), Number(point.lng)]
}

export default function TripMap({ route, stops = [] }) {
  const routePositions = useMemo(
    () => (route?.geometry?.coordinates || []).map(([lng, lat]) => [Number(lat), Number(lng)]).filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng)),
    [route?.geometry?.coordinates],
  )
  const markers = useMemo(() => stops.map((stop) => {
    const direct = toPosition(stop)
    const fallback = stop.stop_type === 'dropoff' ? routePositions.at(-1) : routePositions[0]
    const position = direct || fallback
    return position ? { ...stop, position } : null
  }).filter(Boolean), [routePositions, stops])

  if (!routePositions.length) {
    return <div className="map-empty"><span aria-hidden="true">⌖</span><p>Map preview appears after a route is calculated.</p></div>
  }

  const center = routePositions[Math.floor(routePositions.length / 2)]
  return (
    <div className="map-frame">
      <MapContainer center={center} zoom={5} scrollWheelZoom className="trip-map">
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Polyline positions={routePositions} pathOptions={{ color: '#e36b35', weight: 4, opacity: 0.9 }} />
        <FitRoute positions={routePositions} />
        {markers.map((stop, index) => (
          <Marker key={`${stop.stop_type}-${stop.arrival_time}-${index}`} position={stop.position} icon={markerIcon(stopColors[stop.stop_type] || '#182229')}>
            <Popup>
              <strong>{stop.stop_type.replaceAll('_', ' ')}</strong>
              <br />{stop.location}
              <br />{stop.arrival_time} - {stop.departure_time}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      <div className="map-label"><span /> Route overview</div>
    </div>
  )
}
