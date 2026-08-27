import { useState } from 'react'
import './App.css'
import ELDCanvas from './ELDCanvas.jsx'
import TripMap from './TripMap.jsx'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api'

const initialForm = {
  current_location: '',
  pickup_location: '',
  dropoff_location: '',
  current_cycle_used: '0',
}

function App() {
  const [form, setForm] = useState(initialForm)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  function updateField(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  async function submitTrip(event) {
    event.preventDefault()
    setError('')
    setResult(null)

    const cycleHours = Number(form.current_cycle_used)
    if (!form.current_location.trim() || !form.pickup_location.trim() || !form.dropoff_location.trim()) {
      setError('Enter a current location, pickup, and dropoff location.')
      return
    }
    if (!Number.isFinite(cycleHours) || cycleHours < 0 || cycleHours > 70) {
      setError('Cycle hours must be a number between 0 and 70.')
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch(`${API_BASE_URL}/trip/calculate/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_location: form.current_location.trim(),
          pickup_location: form.pickup_location.trim(),
          dropoff_location: form.dropoff_location.trim(),
          current_cycle_used: cycleHours,
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || !body.success) {
        throw new Error(body.error || 'The trip could not be calculated.')
      }
      setResult(body)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The trip could not be calculated.')
    } finally {
      setIsSubmitting(false)
    }
  }

  function clearForm() {
    setForm(initialForm)
    setResult(null)
    setError('')
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">S</div>
        <div>
          <p className="eyebrow">Fleet operations</p>
          <h1>Spotter<span>AI</span></h1>
        </div>
        <div className="status"><i /> Routing engine ready</div>
      </header>

      <section className="workspace">
        <div className="intro">
          <p className="eyebrow">New trip calculation</p>
          <h2>Plan the road ahead.</h2>
          <p className="intro-copy">Build a compliant route plan from the driver&apos;s current hours and three stops.</p>
        </div>

        <form className="trip-form" onSubmit={submitTrip} noValidate>
          <div className="form-heading"><span>01</span><h3>Trip details</h3></div>
          <div className="field-grid">
            <label className="field field-wide">
              <span>Current location</span>
              <input name="current_location" value={form.current_location} onChange={updateField} placeholder="City, state or address" />
            </label>
            <label className="field">
              <span>Pickup location</span>
              <input name="pickup_location" value={form.pickup_location} onChange={updateField} placeholder="City, state or address" />
            </label>
            <label className="field">
              <span>Dropoff location</span>
              <input name="dropoff_location" value={form.dropoff_location} onChange={updateField} placeholder="City, state or address" />
            </label>
            <label className="field cycle-field">
              <span>Cycle hours already used</span>
              <input type="number" name="current_cycle_used" min="0" max="70" step="0.5" value={form.current_cycle_used} onChange={updateField} />
              <small>0 to 70 hours</small>
            </label>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="form-actions">
            <button type="button" className="button-secondary" onClick={clearForm}>Clear</button>
            <button type="submit" className="button-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Calculating...' : 'Calculate trip'} <span aria-hidden="true">-&gt;</span>
            </button>
          </div>
        </form>

        {result && <section className="result-panel" aria-live="polite">
          <div className="result-title"><span className="check">✓</span><div><p className="eyebrow">Calculation complete</p><h3>Trip plan ready</h3></div></div>
          <div className="metrics">
            <div><strong>{result.hos.total_trip_days}</strong><span>Trip days</span></div>
            <div><strong>{result.hos.total_driving_hours}h</strong><span>Driving time</span></div>
            <div><strong>{result.hos.all_stops.length}</strong><span>Total stops</span></div>
            <div><strong>{result.eld.total_trip_days}</strong><span>ELD logs</span></div>
          </div>
          <p className="result-note">Your route, hours-of-service schedule, and ELD logs are ready for review.</p>
        </section>}

        {result && <section className="map-panel">
          <div className="form-heading"><span>02</span><h3>Route overview</h3></div>
          <TripMap route={result.route} stops={result.hos.all_stops} />
        </section>}

        {result && <section className="eld-panel">
          <div className="form-heading"><span>03</span><h3>ELD log</h3></div>
          <ELDCanvas days={result.eld.days} />
        </section>}
      </section>
    </main>
  )
}

export default App
