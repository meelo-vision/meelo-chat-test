import React, { useCallback, useEffect, useState } from 'react'
import { getWeekPlan, applyWeekPlan } from './api.js'
import './weekplan.css'

// Week plan (core GET /grocery/week-plan): what the household's scheduled
// meals for the next few days need more of, after the pantry and the grocery
// list. Recipes are scaled to the household; amounts in units that don't
// convert are estimated through food densities (≈). The report lists only the
// foods to buy (counts cover covered / on-list / check too); put them on the
// list with POST /apply.

const STATUS = {
  buy: { label: 'Buy', cls: 'wp-buy' },
  covered: { label: 'Covered', cls: 'wp-covered' },
  on_list: { label: 'On list', cls: 'wp-onlist' },
  check: { label: 'Check', cls: 'wp-check' },
}

const fmt = (a, approx = false) => (a ? `${approx ? '≈ ' : ''}${+a.quantity.toFixed(2)}${a.unit ? ' ' + a.unit : ''}` : '—')

const heldText = (h, approx) => {
  if (!h) return '—'
  if (h.amount) return fmt(h.amount, approx)
  return h.rows.map((r) => `${r.name}: ${+r.quantity.toFixed(2)}${r.unit ? ' ' + r.unit : ''}`).join(', ')
}

const day = (ms) => new Date(ms).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

export default function WeekPlan({ getToken, onApplied }) {
  const [days, setDays] = useState(7)
  const [plan, setPlan] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')
  const [picked, setPicked] = useState({})
  const [open, setOpen] = useState({})
  const [result, setResult] = useState(null)

  const load = useCallback(async () => {
    setBusy('Loading…')
    try {
      setPlan(await getWeekPlan(getToken, days))
      setErr('')
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy('')
    }
  }, [getToken, days])

  useEffect(() => {
    load()
  }, [load])

  const items = plan?.items || []
  const buy = items.filter((it) => it.status === 'buy')
  const chosen = buy.filter((it) => picked[it.name])

  async function apply(names) {
    setBusy('Adding to the list…')
    setErr('')
    try {
      const out = await applyWeekPlan(getToken, days, names)
      setPlan(out.plan)
      setResult(out)
      setPicked({})
      onApplied?.()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy('')
    }
  }

  return (
    <section className="section wp">
      <div className="recipes-head">
        <h3 className="section-title">Week plan</h3>
        <div className="prefs-actions">
          {busy && <span className="muted small">{busy}</span>}
          <select value={days} onChange={(e) => setDays(+e.target.value)}>
            {[3, 7, 14].map((d) => (
              <option key={d} value={d}>
                Next {d} days
              </option>
            ))}
          </select>
          <button className="refresh small" onClick={load} disabled={!!busy}>
            Refresh
          </button>
        </div>
      </div>
      {err && <div className="error">{err}</div>}

      {plan && (
        <>
          <div className="wp-meals">
            {plan.meals.length === 0 && <span className="muted small">No home-cooked meals scheduled.</span>}
            {plan.meals.map((m) => (
              <span
                key={m.meal_id}
                className={'chip wp-meal' + (m.status !== 'planned' ? ' wp-meal-off' : '')}
                title={m.servings ? `serves ${m.servings}, scaled ×${+m.scale.toFixed(2)}` : 'servings not listed: as written'}
              >
                {day(m.scheduled_at_ms)} · {m.title || '(untitled)'}
                {m.status === 'planned' && m.scale && m.scale !== 1 ? ` ×${+m.scale.toFixed(2)}` : ''}
                {m.status === 'no_recipe' && ' (no recipe)'}
                {m.status === 'no_ingredients' && ' (no ingredients)'}
              </span>
            ))}
          </div>

          <div className="wp-counts muted small">
            <span>
              Household: <b>{plan.household_size}</b>
            </span>
            {Object.entries(STATUS).map(([k, v]) => (
              <span key={k}>
                {v.label}: <b>{plan.counts?.[k] || 0}</b>
              </span>
            ))}
          </div>

          {items.length === 0 && plan.meals.length > 0 && <div className="muted small">Nothing to buy for these meals.</div>}
          {items.length > 0 && (
            <table className="wp-table">
              <thead>
                <tr>
                  <th />
                  <th>Food</th>
                  <th>Status</th>
                  <th>Needed</th>
                  <th>On hand</th>
                  <th>On list</th>
                  <th>To buy</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <React.Fragment key={it.name}>
                    <tr className={open[it.name] ? 'wp-open' : ''}>
                      <td>
                        {it.status === 'buy' && (
                          <input
                            type="checkbox"
                            checked={!!picked[it.name]}
                            onChange={(e) => setPicked({ ...picked, [it.name]: e.target.checked })}
                          />
                        )}
                      </td>
                      <td>
                        <button className="wp-name" onClick={() => setOpen({ ...open, [it.name]: !open[it.name] })}>
                          {it.name}
                        </button>
                        <span className="muted small"> · {it.uses.length} meal{it.uses.length === 1 ? '' : 's'}</span>
                        {it.is_staple && <span className="muted small"> · staple</span>}
                      </td>
                      <td>
                        <span className={'wp-pill ' + (STATUS[it.status]?.cls || '')}>{STATUS[it.status]?.label || it.status}</span>
                      </td>
                      <td>{fmt(it.needed, it.estimated)}</td>
                      <td>{heldText(it.on_hand, it.estimated)}</td>
                      <td>{heldText(it.on_list, it.estimated)}</td>
                      <td>{it.to_buy ? fmt(it.to_buy, it.estimated) : 'some'}</td>
                    </tr>
                    {open[it.name] && (
                      <tr className="wp-uses">
                        <td />
                        <td colSpan={6}>
                          {it.uses.map((u, i) => (
                            <div key={i} className="small">
                              {day(u.scheduled_at_ms)} · <b>{u.title}</b>: {u.ingredient}
                              {u.scale && u.scale !== 1 ? ` (×${+u.scale.toFixed(2)} = ${+u.quantity.toFixed(2)}${u.unit ? ' ' + u.unit : ''})` : ''}
                            </div>
                          ))}
                          {it.estimated && <div className="muted small">Estimated through the food's density / typical weight.</div>}
                          {it.note && <div className="muted small">{it.note}</div>}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}

          <div className="wp-actions">
            <button disabled={!!busy || buy.length === 0} onClick={() => apply([])}>
              Add all to buy ({buy.length})
            </button>
            <button disabled={!!busy || chosen.length === 0} onClick={() => apply(chosen.map((it) => it.name))}>
              Add selected ({chosen.length})
            </button>
          </div>

          {result && (
            <div className="muted small wp-result">
              {result.applied.length === 0 && 'Nothing added.'}
              {result.applied.map((a) => (
                <div key={a.item_id}>
                  {a.action === 'topped_up' ? 'Topped up' : 'Added'} {a.name}: {fmt(a)}
                </div>
              ))}
              {result.skipped.map((s) => (
                <div key={s.name}>
                  Skipped {s.name} ({STATUS[s.status]?.label || s.status})
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}
