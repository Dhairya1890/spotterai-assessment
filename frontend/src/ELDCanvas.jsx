import { useEffect, useRef, useState } from 'react'

const statuses = ['off_duty', 'sleeper_berth', 'driving', 'on_duty_not_driving']
const colors = {
  off_duty: '#f4f1ea',
  sleeper_berth: '#9bb4c4',
  driving: '#e36b35',
  on_duty_not_driving: '#5b9a68',
}
const labels = {
  off_duty: 'Off duty',
  sleeper_berth: 'Sleeper berth',
  driving: 'Driving',
  on_duty_not_driving: 'On duty',
}

function formatDuration(hours) {
  return `${Number(hours).toFixed(1)}h`
}

export default function ELDCanvas({ days = [] }) {
  const canvasRef = useRef(null)
  const [selectedDayIndex, setSelectedDayIndex] = useState(0)
    const activeDayIndex = Math.min(selectedDayIndex, Math.max(0, days.length - 1))
    const day = days[activeDayIndex] || null

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !day) return
    const context = canvas.getContext('2d')
    const width = canvas.clientWidth * window.devicePixelRatio
    const height = 260 * window.devicePixelRatio
    canvas.width = width
    canvas.height = height
    context.scale(window.devicePixelRatio, window.devicePixelRatio)
    const displayWidth = canvas.clientWidth
    const displayHeight = 260
    const left = 126
    const right = 18
    const top = 30
    const rowHeight = 44
    const graphWidth = displayWidth - left - right

    context.clearRect(0, 0, displayWidth, displayHeight)
    context.fillStyle = '#fffdf8'
    context.fillRect(0, 0, displayWidth, displayHeight)
    context.font = '11px Arial'
    context.textBaseline = 'middle'

    for (let hour = 0; hour <= 24; hour += 1) {
      const x = left + (hour / 24) * graphWidth
      context.strokeStyle = hour % 2 === 0 ? '#d6d2c9' : '#e9e6df'
      context.lineWidth = hour % 2 === 0 ? 1 : 0.6
      context.beginPath()
      context.moveTo(x, top)
      context.lineTo(x, top + rowHeight * 4)
      context.stroke()
      if (hour < 24 && hour % 2 === 0) {
        context.fillStyle = '#71766f'
        context.fillText(`${String(hour).padStart(2, '0')}:00`, x + 3, 16)
      }
    }

    statuses.forEach((status, row) => {
      const y = top + row * rowHeight
      context.fillStyle = '#45524f'
      context.fillText(labels[status], 12, y + rowHeight / 2)
      context.strokeStyle = '#dedbd3'
      context.lineWidth = 1
      context.strokeRect(left, y, graphWidth, rowHeight)
    })

    day.grid.forEach((status, slot) => {
      const row = statuses.indexOf(status)
      if (row < 0) return
      const x = left + (slot / day.grid.length) * graphWidth
      const slotWidth = graphWidth / day.grid.length + .5
      context.fillStyle = colors[status]
      context.fillRect(x, top + row * rowHeight + 3, slotWidth, rowHeight - 6)
    })
  }, [day])

  if (!day) return null
  return (
    <div className="eld-log">
      <div className="eld-log-header">
        <div><p className="eyebrow">Electronic duty record</p><h3>Day {day.day_number} log</h3></div>
        <div className="day-controls" aria-label="Select ELD day">
          <button type="button" onClick={() => setSelectedDayIndex((index) => Math.max(0, index - 1))} disabled={selectedDayIndex === 0} aria-label="Previous day">&lt;</button>
            <span>{activeDayIndex + 1} / {days.length}</span>
          <button type="button" onClick={() => setSelectedDayIndex((index) => Math.min(days.length - 1, index + 1))} disabled={selectedDayIndex === days.length - 1} aria-label="Next day">&gt;</button>
        </div>
        <div className="eld-legend">
          {statuses.map((status) => <span key={status}><i style={{ background: colors[status] }} />{labels[status]}</span>)}
        </div>
      </div>
      <div className="canvas-scroll">
        <canvas ref={canvasRef} className="eld-canvas" aria-label={`ELD duty status grid for day ${day.day_number}`} />
      </div>
      <div className="eld-totals">
        {statuses.map((status) => <div key={status}><strong>{formatDuration(day.totals[status])}</strong><span>{labels[status]}</span></div>)}
      </div>
      <details className="eld-events">
        <summary>View log events</summary>
        <ul>
          {day.events.map((event, index) => <li key={`${event.start_time}-${index}`}><b>{event.start_time} - {event.end_time}</b><span>{labels[event.status]} · {event.notes}</span></li>)}
        </ul>
      </details>
    </div>
  )
}
