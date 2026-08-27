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
  const top = startY + 24
  const rowHeight = 9
  const gridWidth = 112
  const slotWidth = gridWidth / 96
  doc.setFontSize(8)
  doc.setTextColor(115, 95, 86)
  doc.text('Status', left, top - 10)
  for (let hour = 0; hour <= 24; hour += 2) {
    doc.text(`${String(hour).padStart(2, '0')}:00`, left + 22 + (hour / 24) * gridWidth, top - 10, { align: hour === 24 ? 'right' : 'left' })
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
  doc.rect(40, y, 130, 10, 'F')
  doc.setTextColor(37, 25, 19)
  doc.setFontSize(10)
  doc.text('Log events and remarks', 44, y + 6.5)
  y += 18
  doc.setFontSize(8)
  doc.setTextColor(115, 95, 86)
  doc.text('Time', 44, y)
  doc.text('Status', 65, y)
  doc.text('Location', 95, y)
  doc.text('Remarks', 143, y)
  y += 7
  day.events.forEach((event) => {
    const location = doc.splitTextToSize(event.location || '', 44)
    const notes = doc.splitTextToSize(event.notes || '', 25)
    const rowHeight = Math.max(11, Math.max(location.length, notes.length) * 4 + 6)
    if (y + rowHeight > 270) {
      doc.addPage()
      y = 24
    }
    doc.setDrawColor(224, 192, 177)
    doc.line(40, y - 4, 170, y - 4)
    doc.setTextColor(115, 95, 86)
    doc.text(`${event.start_time} - ${event.end_time}`, 44, y)
    doc.text(event.status.replaceAll('_', ' '), 65, y)
    doc.text(location, 95, y)
    doc.text(notes, 143, y)
    y += rowHeight
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
    drawEvents(doc, day, eventEnd + 20)
  })
  doc.save(`spotterai-eld-${new Date().toISOString().slice(0, 10)}.pdf`)
}
