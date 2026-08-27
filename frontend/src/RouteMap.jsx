import { useEffect, useMemo } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'

const colors = { pickup: '#39804a', dropoff: '#f97316', fuel: '#d39b22', break_30min: '#65716b', rest_10hr: '#526b86', restart_34hr: '#8c4d64' }

function FitBounds({ positions }) {
  const map = useMap()
  useEffect(() => {
    if (positions.length > 1) map.fitBounds(L.latLngBounds(positions), { padding: [24, 24] })
  }, [map, positions])
  return null
}

function groupedIcon(stops) {
  const color = colors[stops[0].stop_type] || '#251913'
  const count = stops.length
  return L.divIcon({
    className: 'route-marker',
    html: `<span style="background:${color}"></span>${count > 1 ? `<b style="display:grid;place-items:center;min-width:14px;height:14px;padding:0 3px;border:2px solid #fff;border-radius:9px;background:#251913;color:#fff;font:700 9px Arial,sans-serif">${count}</b>` : ''}`,
    iconSize: [count > 1 ? 30 : 18, 22],
    iconAnchor: [count > 1 ? 15 : 9, 11],
    popupAnchor: [0, -10],
  })
}

function positionForStop(stop, routePositions, index) {
  if (Number.isFinite(Number(stop.lat)) && Number.isFinite(Number(stop.lng))) return [Number(stop.lat), Number(stop.lng)]
  if (!routePositions.length) return null
  return routePositions[Math.min(index, routePositions.length - 1)]
}

export default function RouteMap({ route, stops = [] }) {
  const positions = useMemo(() => (route?.geometry?.coordinates || []).map(([lng, lat]) => [Number(lat), Number(lng)]).filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng)), [route?.geometry?.coordinates])
  const markers = useMemo(() => {
    const grouped = new Map()
    stops.forEach((stop, index) => {
      const position = positionForStop(stop, positions, index)
      if (!position) return
      const key = `${position[0].toFixed(5)}:${position[1].toFixed(5)}`
      const group = grouped.get(key) || { position, stops: [] }
      group.stops.push(stop)
      grouped.set(key, group)
    })
    return Array.from(grouped.values())
  }, [positions, stops])

  if (!positions.length) return <div className="map-empty"><strong>No route geometry available</strong><span>ORS returned no map coordinates for this route.</span></div>
  return <div className="real-map"><MapContainer center={positions[0]} zoom={5} scrollWheelZoom className="leaflet-map"><TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><FitBounds positions={positions} /><Polyline positions={positions} pathOptions={{ color: '#f97316', weight: 4, opacity: .9 }} />{markers.map((stop, index) => <Marker key={`${stop.position.join('-')}-${index}`} position={stop.position} icon={groupedIcon(stop.stops)}><Popup>{stop.stops.map((item, stopIndex) => <div key={`${item.stop_type}-${stopIndex}`}><strong>{String(item.stop_type).replaceAll('_', ' ')}</strong><br />{item.location}<br />{item.arrival_time} - {item.departure_time}{stopIndex < stop.stops.length - 1 && <hr />}</div>)}</Popup></Marker>)}</MapContainer><div className="map-legend"><i /> Route <b /> Stops{markers.some((marker) => marker.stops.length > 1) && <small> · grouped overlaps</small>}</div></div>
}
