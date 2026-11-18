import React, { useCallback, useEffect, useState } from 'react'
import { getContext, patchContextFields, deleteContextField } from './api.js'
import './prefs.css'

// Preferences tab: the user's own context from GET /context, editable in place.
// List fields add with PATCH /context/fields and remove with DELETE; number
// fields overwrite. These are what grocery products, Meal Pick and Model 2
// adapt to (allergies are also applied for the whole household).

const DIETS = ['vegan', 'vegetarian', 'pescatarian', 'gluten free', 'dairy free', 'halal', 'kosher', 'low carb / keto']

// Each list section: the context key it writes, where its values live in the
// GET /context response, and optional suggestions.
const LISTS = [
  { title: 'Allergies', key: 'allergy', read: (c) => c.health?.allergies, hint: 'peanuts, tree nuts, dairy…', tone: 'bad' },
  { title: 'Health conditions', key: 'condition', read: (c) => c.health?.conditions, hint: 'diabetes, high blood pressure…' },
  { title: 'Diet', key: 'dietary_restriction', read: (c) => c.dietary?.dietary_restrictions, options: DIETS },
  { title: 'Foods they like', key: 'food_preference', read: (c) => c.dietary?.food_preferences, hint: 'salmon, spicy food…' },
  { title: 'Foods they dislike', key: 'food_dislike', read: (c) => c.dietary?.food_dislikes, hint: 'mushrooms, olives…' },
  { title: 'Cuisines they love', key: 'cuisine_love', read: (c) => c.dietary?.cuisine_love, hint: 'Indian, Mexican…' },
  { title: 'Cuisines to avoid', key: 'cuisine_avoid', read: (c) => c.dietary?.cuisine_avoid },
  { title: 'Nutrition goals', key: 'dietary_goal', read: (c) => c.nutrition?.dietary_goals, hint: 'high protein, low sodium…' },
]

const NUMBERS = [
  { title: 'Daily calories', key: 'daily_calorie_goal', read: (c) => c.nutrition?.daily_calorie_goal, unit: 'kcal' },
  { title: 'Daily protein', key: 'daily_protein_goal', read: (c) => c.nutrition?.daily_protein_goal, unit: 'g' },
  { title: 'Daily carbs', key: 'daily_carbs_goal', read: (c) => c.nutrition?.daily_carbs_goal, unit: 'g' },
  { title: 'Daily fat', key: 'daily_fat_goal', read: (c) => c.nutrition?.daily_fat_goal, unit: 'g' },
]

export default function Preferences({ getToken }) {
  const [ctx, setCtx] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [showRaw, setShowRaw] = useState(false)

  const load = useCallback(async () => {
    setErr('')
    try {
      setCtx((await getContext(getToken)) || {})
    } catch (e) {
      setErr(e.message)
    }
  }, [getToken])

  useEffect(() => {
    load()
  }, [load])

  // Mutations answer with the new context; fall back to a reload if not.
  async function run(fn) {
    setBusy(true)
    setErr('')
    try {
      const next = await fn()
      if (next && typeof next === 'object' && Object.keys(next).length) setCtx(next)
      else await load()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }
  const add = (key, value) => run(() => patchContextFields(getToken, [{ key, value }]))
  const remove = (key, value) => run(() => deleteContextField(getToken, key, value))

  if (!ctx && !err) return <div className="center muted">Loading preferences…</div>

  const brands = Object.entries(ctx?.grocery?.preferred_brands || {})

  return (
    <div className="prefs">
      <div className="recipes-head">
        <h2>Preferences</h2>
        <div className="prefs-actions">
          {busy && <span className="muted small">Saving…</span>}
          <button className="refresh small" onClick={load}>Refresh</button>
          <button className="refresh small" onClick={() => setShowRaw((v) => !v)}>
            {showRaw ? 'Hide' : 'Show'} raw context
          </button>
        </div>
      </div>
      {err && <div className="error">{err}</div>}
      <p className="muted small prefs-note">
        Grocery products are filtered on everyone's allergies in the household (yours are here) and
        ranked on your diet and nutrition goals.
      </p>

      <div className="prefs-grid">
        {LISTS.map((s) => (
          <ListSection key={s.key} section={s} values={s.read(ctx || {}) || []} onAdd={add} onRemove={remove} disabled={busy} />
        ))}

        <section className="pref-card">
          <h3 className="section-title">Daily targets</h3>
          {NUMBERS.map((n) => (
            <NumberField key={n.key} field={n} value={n.read(ctx || {})} onSave={add} onClear={(k) => remove(k, '')} disabled={busy} />
          ))}
        </section>

        <section className="pref-card">
          <h3 className="section-title">Preferred brands</h3>
          {brands.length === 0 && <div className="muted small">None yet.</div>}
          <div className="chips">
            {brands.map(([item, brand]) => (
              <span key={item} className="chip">
                {item}: <b>{brand}</b>
                <button className="chip-x" disabled={busy} onClick={() => remove('preferred_brand', `${item}:${brand}`)}>×</button>
              </span>
            ))}
          </div>
          <BrandAdd onAdd={(item, brand) => add('preferred_brand', `${item}:${brand}`)} disabled={busy} />
        </section>
      </div>

      {showRaw && <pre className="raw">{JSON.stringify(ctx, null, 2)}</pre>}
    </div>
  )
}

function ListSection({ section, values, onAdd, onRemove, disabled }) {
  const [text, setText] = useState('')
  const submit = (v) => {
    v = (v ?? text).trim()
    if (!v) return
    onAdd(section.key, v)
    setText('')
  }
  const lower = values.map((v) => String(v).toLowerCase())
  return (
    <section className="pref-card">
      <h3 className="section-title">{section.title}</h3>
      <div className="chips">
        {values.length === 0 && <span className="muted small">None.</span>}
        {values.map((v) => (
          <span key={v} className={`chip ${section.tone === 'bad' ? 'chip-bad' : ''}`}>
            {v}
            <button className="chip-x" disabled={disabled} onClick={() => onRemove(section.key, v)} title="Remove">×</button>
          </span>
        ))}
      </div>
      {section.options && (
        <div className="chips options">
          {section.options
            .filter((o) => !lower.includes(o.toLowerCase()))
            .map((o) => (
              <button key={o} className="chip chip-option" disabled={disabled} onClick={() => submit(o)}>+ {o}</button>
            ))}
        </div>
      )}
      <form
        className="pref-add"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={section.hint || 'Add…'} disabled={disabled} />
        <button disabled={disabled || !text.trim()}>Add</button>
      </form>
    </section>
  )
}

function NumberField({ field, value, onSave, onClear, disabled }) {
  const [text, setText] = useState(value ? String(value) : '')
  useEffect(() => setText(value ? String(value) : ''), [value])
  const changed = text.trim() !== (value ? String(value) : '')
  return (
    <form
      className="num-row"
      onSubmit={(e) => {
        e.preventDefault()
        if (text.trim()) onSave(field.key, text.trim())
      }}
    >
      <label>{field.title}</label>
      <input type="number" min="0" value={text} onChange={(e) => setText(e.target.value)} disabled={disabled} />
      <span className="muted small">{field.unit}</span>
      <button className="refresh small" disabled={disabled || !changed || !text.trim()}>Save</button>
      {value ? (
        <button type="button" className="chip-x" disabled={disabled} onClick={() => onClear(field.key)} title="Clear">×</button>
      ) : null}
    </form>
  )
}

function BrandAdd({ onAdd, disabled }) {
  const [item, setItem] = useState('')
  const [brand, setBrand] = useState('')
  return (
    <form
      className="pref-add"
      onSubmit={(e) => {
        e.preventDefault()
        if (item.trim() && brand.trim()) {
          onAdd(item.trim(), brand.trim())
          setItem('')
          setBrand('')
        }
      }}
    >
      <input value={item} onChange={(e) => setItem(e.target.value)} placeholder="item (milk)" disabled={disabled} />
      <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="brand (Horizon)" disabled={disabled} />
      <button disabled={disabled || !item.trim() || !brand.trim()}>Add</button>
    </form>
  )
}
