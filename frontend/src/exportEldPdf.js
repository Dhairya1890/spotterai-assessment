import { jsPDF } from 'jspdf'

const statuses = [
  ['off_duty', 'Off duty'],
  ['sleeper_berth', 'Sleeper berth'],
  ['driving', 'Driving'],
  ['on_duty_not_driving', 'On duty (ND)'],
]

const colors = {
  off_duty: [244, 241, 234],
  sleeper_berth: [155, 180, 196],
  driving: [249, 115, 22],
  on_duty_not_driving: [91, 154, 104],
}

function drawGrid(doc, day, startY) {
  const left = 48
  const top = startY + 12
  const width = 135
  const rowHeight = 9
  const gridWidth = 112
  const slotWidth = gridWidth / 96
  doc.setFontSize(8)
  doc.setTextColor(115, 95, 86)
  doc.text('Status', left, top - 4)
  for (let hour = 0; hour <= 24; hour += 2) {
    doc.text(`${String(hour).padStart(2, '0')}:00`, left + 22 + (hour / 24) * gridWidth, top - 4, { align: hour === 24 ? 'right' : 'left' })
  }

  statuses.forEach(([status, label], row) => {
    const y = top + row * rowHeight
    doc.setDrawColor(224, 192, 177)
    doc.rect(left + 22, y - 6, gridWidth, rowHeight)
    doc.setTextColor(37, 25, 19)
    doc.text(label, left, y)
    day.grid.forEach((slot, index) => {
      if (slot !== status) return
      const color = colors[status]
      doc.setFillColor(...color)
      doc.rect(left + 22 + index * slotWidth, y - 5, slotWidth + 0.15, rowHeight - 2, 'F')
    })
    doc.setTextColor(37, 25, 19)
    doc.text(`${Number(day.totals[status] || 0).toFixed(1)}h`, left + 139, y)
  })
  return top + statuses.length * rowHeight + 5
}

function drawEvents(doc, day, startY) {
  let y = startY
  doc.setFillColor(255, 241, 235)
  doc.rect(40, y, 130, 9, 'F')
  doc.setTextColor(37, 25, 19)
  doc.setFontSize(10)
  doc.text('Log events and remarks', 44, y + 6)
  y += 16
  doc.setFontSize(8)
  day.events.forEach((event) => {
    if (y > 270) {
      doc.addPage()
      y = 20
    }
    const lines = doc.splitTextToSize(`${event.start_time} - ${event.end_time}   ${event.status.replaceAll('_', ' ')}   ${event.location}   ${event.notes}`, 130)
    doc.setTextColor(115, 95, 86)
    doc.text(lines, 44, y)
    y += Math.max(7, lines.length * 4 + 3)
  })
}

export function exportEldPdf(days) {
  if (!Array.isArray(days) || days.length === 0) return
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  days.forEach((day, index) => {
    if (index > 0) doc.addPage()
    doc.setTextColor(37, 25, 19)
    doc.setFontSize(18)
    doc.text('SpotterAI ELD Log', 40, 24)
    doc.setFontSize(12)
    doc.text(`Day ${day.day_number} of ${days.length}`, 40, 32)
    doc.setFontSize(8)
    doc.setTextColor(115, 95, 86)
    doc.text('Electronic duty record generated from the calculated trip plan', 40, 39)
    const eventEnd = drawGrid(doc, day, 54)
    drawEvents(doc, day, eventEnd + 12)
  })
  doc.save(`spotterai-eld-${new Date().toISOString().slice(0, 10)}.pdf`)
}
