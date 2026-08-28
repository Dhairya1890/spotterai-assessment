import { useEffect, useState } from 'react'
import './App.css'
import './eld-export.css'
import RouteMap from './RouteMap.jsx'
import { exportEldPdf } from './exportEldPdf.js'

const configuredApi = import.meta.env.VITE_API_BASE_URL?.trim()
const configuredApiBase = configuredApi && !configuredApi.includes('<your-render-domain>')
  ? configuredApi.replace(/\/$/, '')
  : 'http://localhost:8000/api'
const API = configuredApiBase.endsWith('/api') ? configuredApiBase : `${configuredApiBase}/api`
const INITIAL_FORM = { current_location: '', pickup_location: '', dropoff_location: '', current_cycle_used: '0' }
const STATUS_NAMES = { off_duty: 'Off duty', sleeper_berth: 'Sleeper berth', driving: 'Driving', on_duty_not_driving: 'On duty (ND)' }

function TripForm({ form, setForm, onSubmit, onClear, loading, error }) {
  const cycle = Number(form.current_cycle_used || 0)
  const update = (event) => setForm({ ...form, [event.target.name]: event.target.value })
  return <form className="panel form" onSubmit={onSubmit} noValidate>
    <header className="panel-head"><div><span className="eyebrow">Plan trip</span><h2>Trip parameters</h2></div><b className="step">01</b></header>
    <div className="fields">
      {[
        ['current_location', 'Current location', 'Chicago, IL'],
        ['pickup_location', 'Pickup location', 'Enter facility or address'],
        ['dropoff_location', 'Dropoff location', 'Enter destination'],
      ].map(([name, label, placeholder], index) => <label className={`field ${index === 0 ? 'wide' : ''}`} key={name}><span>{label}</span><input name={name} value={form[name]} onChange={update} placeholder={placeholder} required /></label>)}
      <label className="field wide"><span>Cycle hours used <em>70hr / 8d</em></span><input name="current_cycle_used" type="number" min="0" max="70" step="0.5" value={form.current_cycle_used} onChange={update} /><div className="progress"><i style={{ width: `${Math.min(100, Math.max(0, cycle / 70 * 100))}%` }} /></div><small>{Math.max(0, 70 - cycle).toFixed(1)} hrs remaining</small></label>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    <footer className="actions"><button type="button" className="quiet" onClick={onClear}>Clear</button><button className="primary" disabled={loading}>{loading ? 'Calculating...' : 'Calculate trip'} <b>-&gt;</b></button></footer>
  </form>
}

function RoutePreview({ result }) {
  return <section className="panel map-panel"><header className="panel-head"><div><span className="eyebrow">Live route</span><h2>Route preview</h2></div><span className="muted">{result.route.total_distance_miles} mi</span></header><RouteMap route={result.route} stops={result.hos.all_stops} /></section>
}

function Timeline({ days }) {
  return <section className="panel timeline"><header className="panel-head"><div><span className="eyebrow">Schedule</span><h2>Daily itinerary</h2></div><span className="muted">{days.length} days</span></header><div className="timeline-body">{days.map((day) => <article className="day" key={day.day_number}><header><strong>D{day.day_number}</strong><div><b>Day {day.day_number}</b><small>{day.total_hours_driving}h driving · {day.total_hours_on_duty_not_driving}h on duty</small></div><code>{day.cycle_hours_used_end_of_day}h cycle</code></header>{day.events.map((event, index) => <div className="event" key={`${event.start_time}-${index}`}><i className={event.event_type} /><time>{event.start_time}<small>{event.end_time}</small></time><div><b>{event.notes}</b><span>{event.location}</span></div></div>)}</article>)}</div></section>
}

function EldLog({ days }) {
  const [active, setActive] = useState(0)
  const day = days[active]
  if (!day) return null
  return <section className="panel eld"><header className="panel-head"><div><span className="eyebrow">Compliance record</span><h2>ELD log</h2></div><div className="eld-actions"><div className="switch"><button onClick={() => setActive(Math.max(0, active - 1))} disabled={!active}>&lt;</button><span>Day {active + 1} of {days.length}</span><button onClick={() => setActive(Math.min(days.length - 1, active + 1))} disabled={active === days.length - 1}>&gt;</button></div><button type="button" className="export-button" onClick={() => exportEldPdf(days)} title="Download all ELD days as a PDF">Export PDF</button></div></header><div className="eld-grid"><div className="hours"><span>Status</span>{Array.from({ length: 13 }, (_, index) => <b key={index}>{String(index * 2).padStart(2, '0')}</b>)}</div>{Object.entries(STATUS_NAMES).map(([status, label]) => <div className="eld-row" key={status}><span>{label}</span><div>{day.grid.map((slot, index) => slot === status && <i key={index} style={{ left: `${index / 96 * 100}%`, width: `${100 / 96 + .2}%` }} />)}</div><b>{Number(day.totals[status] || 0).toFixed(1)}h</b></div>)}</div><div className="remarks"><h3>Log events &amp; remarks</h3>{day.events.map((event, index) => <div key={`${event.start_time}-${index}`}><time>{event.start_time}</time><b>{STATUS_NAMES[event.status]}</b><span>{event.location}</span><em>{event.notes}</em></div>)}</div></section>
}

function AuthPage({ onAuthenticated }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const response = await fetch(`${API}/trip/auth/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: mode, email: email.trim(), password }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || !body.success) throw new Error(body.error || 'Authentication failed.')
      onAuthenticated(body.user)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Authentication failed.')
    } finally {
      setLoading(false)
    }
  }

  return <main className="auth-page"><div className="auth-brand"><strong>Spotter<span>AI</span></strong><p>Fleet compliance, simplified.</p></div><section className="auth-panel"><div className="auth-tabs"><button className={mode === 'login' ? 'selected' : ''} onClick={() => setMode('login')}>Log in</button><button className={mode === 'signup' ? 'selected' : ''} onClick={() => setMode('signup')}>Sign up</button></div><form onSubmit={submit}><label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="driver@fleet.com" required /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" minLength="8" required /></label>{error && <p className="error" role="alert">{error}</p>}<button className="primary auth-submit" disabled={loading}>{loading ? 'Authenticating...' : mode === 'login' ? 'Sign in' : 'Create account'} <b>-&gt;</b></button></form></section></main>
}

function App() {
  const [user, setUser] = useState(null)
  const [form, setForm] = useState(INITIAL_FORM)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch(`${API}/trip/auth/session/`, { credentials: 'include' })
      .then((response) => response.ok ? response.json() : null)
      .then((body) => { if (body?.authenticated) setUser(body.user) })
      .catch(() => {})
  }, [])

  if (!user) return <AuthPage onAuthenticated={setUser} />
  async function submit(event) {
    event.preventDefault(); setError('')
    const cycle = Number(form.current_cycle_used)
    if (!form.current_location.trim() || !form.pickup_location.trim() || !form.dropoff_location.trim()) return setError('Enter all three trip locations.')
    if (!Number.isFinite(cycle) || cycle < 0 || cycle > 70) return setError('Cycle hours must be between 0 and 70.')
    setLoading(true)
    try { const response = await fetch(`${API}/trip/calculate/`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ current_location: form.current_location.trim(), pickup_location: form.pickup_location.trim(), dropoff_location: form.dropoff_location.trim(), current_cycle_used: cycle }) }); const body = await response.json(); if (!response.ok || !body.success) throw new Error(body.error || 'Trip calculation failed.'); setResult(body) } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Trip calculation failed.') } finally { setLoading(false) }
  }
  function clear() { setForm(INITIAL_FORM); setResult(null); setError('') }
  async function logout() { await fetch(`${API}/trip/auth/logout/`, { method: 'POST', credentials: 'include' }); setUser(null); clear() }
  return <div className="app"><header className="mobile-bar"><b>Spotter<span>AI</span></b></header><aside className="sidebar"><div className="brand"><strong>Spotter<span>AI</span></strong><small>Fleet operations</small></div><p className="driver">DRIVER ID <b>8842</b></p><button type="button" className="new-trip" onClick={clear}>+ New trip</button><nav><a className={!result ? 'active' : ''} href="#planner">01&nbsp;&nbsp; Plan trip</a><a className={result ? 'active' : ''} href="#route">02&nbsp;&nbsp; Review route</a><a className={result ? 'active' : ''} href="#eld">03&nbsp;&nbsp; ELD log</a></nav><button type="button" className="logout" onClick={logout}>Sign out</button></aside><main className="main-content"><header className="page-head"><div><span className="eyebrow">{result ? 'Route review' : 'Dispatch workspace'}</span><h1>{result ? `${form.current_location} to ${form.dropoff_location}` : 'Plan the road ahead.'}</h1><p>{result ? 'Review the calculated route and compliance record.' : 'Enter trip details to calculate a legally compliant HOS schedule.'}</p></div></header><div id="planner" className="content">{!result && <TripForm form={form} setForm={setForm} onSubmit={submit} onClear={clear} loading={loading} error={error} />} {!result && <><section id="route" className="panel route-empty"><span className="eyebrow">Review route</span><h2>Route appears after calculation</h2><p>Enter your trip details above to load the OpenStreetMap route and stops.</p></section><section id="eld" className="panel route-empty"><span className="eyebrow">ELD log</span><h2>Compliance log appears after calculation</h2><p>Calculate a trip to review the driver duty-status record.</p></section></>}{result && <><div className="metrics">{[['Trip days', result.hos.total_trip_days], ['Driving hours', `${result.hos.total_driving_hours}h`], ['On-duty hours', `${result.hos.total_on_duty_hours}h`], ['Cycle after trip', `${result.hos.cycle_hours_used_after_trip}h`], ['Restart required', result.hos.had_cycle_restart ? 'Yes · 34h' : 'No'], ['Total stops', result.hos.all_stops.length]].map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div><div className="results"><div id="route"><RoutePreview result={result} /></div><Timeline days={result.hos.days} /></div><div id="eld"><EldLog days={result.eld.days} /></div><button type="button" className="recalculate" onClick={clear}>Calculate another trip</button></>}</div></main></div>
}

export default App
