import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  getGroceries,
  addGroceries,
  removeGrocery,
  pickGroceryProduct,
  clearGroceryProduct,
  searchGroceryProducts,
  getContext,
} from './api.js'
import WeekPlan from './WeekPlan.jsx'
import './search.css'
import './prefs.css'

// Groceries tab: the household's grocery list with real catalog products on
// each item (US, safe for every member's allergies, ranked on the diet,
// nutrition goals and usual brands). Pick one to put it "in the cart"; browse
// more with the product search. New items' products can take a few seconds:
// the list refreshes itself until they land.

export default function Groceries({ getToken }) {
  const [items, setItems] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')
  const [input, setInput] = useState('')
  const [allergies, setAllergies] = useState([])
  const [browse, setBrowse] = useState(null) // the item whose products are being browsed
  const [showPlan, setShowPlan] = useState(false) // the week plan from scheduled meals
  const poll = useRef(null)

  const apply = (out) => setItems(out?.items || [])

  const load = useCallback(async () => {
    try {
      apply(await getGroceries(getToken))
      setErr('')
    } catch (e) {
      setErr(e.message)
    }
  }, [getToken])

  useEffect(() => {
    load()
    getContext(getToken)
      .then((c) => setAllergies(c?.health?.allergies || []))
      .catch(() => {})
  }, [load, getToken])

  // Products not ranked yet (no product_suggestions key): poll a few times.
  const pending = (items || []).filter((it) => it.active && it.product_suggestions === undefined && !it.catalog_ref)
  useEffect(() => {
    clearTimeout(poll.current)
    if (pending.length === 0) return
    let tries = 0
    const tick = async () => {
      tries++
      await load()
      if (tries < 6) poll.current = setTimeout(tick, 3000)
    }
    poll.current = setTimeout(tick, 3000)
    return () => clearTimeout(poll.current)
  }, [pending.length, load])

  async function run(label, fn) {
    setBusy(label)
    setErr('')
    try {
      apply(await fn())
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy('')
    }
  }

  const add = () => {
    const names = input.split(',').map((s) => s.trim()).filter(Boolean)
    if (names.length === 0) return
    setInput('')
    run('Adding…', () => addGroceries(getToken, names))
  }

  if (items === null && !err) return <div className="center muted">Loading groceries…</div>

  const active = (items || []).filter((it) => it.active)
  const bought = (items || []).filter((it) => !it.active)

  return (
    <div className="groceries">
      <div className="recipes-head">
        <h2>Groceries</h2>
        <div className="prefs-actions">
          {busy && <span className="muted small">{busy}</span>}
          <button className="refresh small" onClick={() => setShowPlan(!showPlan)}>
            {showPlan ? 'Hide week plan' : 'Week plan'}
          </button>
          <button className="refresh small" onClick={load}>Refresh</button>
        </div>
      </div>
      <p className="muted small prefs-note">
        Products are US-only and checked against every household allergy
        {allergies.length ? <> (yours: <b>{allergies.join(', ')}</b>)</> : null}. Edit preferences in the
        Preferences tab.
      </p>
      {err && <div className="error">{err}</div>}

      {showPlan && <WeekPlan getToken={getToken} onApplied={load} />}

      <form
        className="pref-add grocery-add"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Add items — e.g. greek yogurt, sandwich bread, granola" />
        <button disabled={!input.trim() || !!busy}>Add</button>
      </form>

      {active.length === 0 && <div className="muted small pad">The list is empty.</div>}
      <div className="g-list">
        {active.map((it) => (
          <GroceryRow
            key={it.id}
            it={it}
            busy={!!busy}
            onPick={(ref) => run('Picking…', () => pickGroceryProduct(getToken, it.id, ref))}
            onClear={() => run('Clearing…', () => clearGroceryProduct(getToken, it.id))}
            onRemove={() => run('Removing…', () => removeGrocery(getToken, it.id))}
            onBrowse={() => setBrowse(it)}
          />
        ))}
      </div>

      {bought.length > 0 && (
        <section className="section">
          <h3 className="section-title">Checked off ({bought.length})</h3>
          <div className="muted small">{bought.map((b) => b.name).join(', ')}</div>
        </section>
      )}

      {browse && (
        <BrowseModal
          getToken={getToken}
          item={browse}
          onClose={() => setBrowse(null)}
          onPick={async (ref) => {
            setBrowse(null)
            await run('Picking…', () => pickGroceryProduct(getToken, browse.id, ref))
          }}
        />
      )}
    </div>
  )
}

function snapshotProduct(it) {
  const s = it.catalog_snapshot
  return s && (s.product || s.food) ? s.product || s.food : null
}

function GroceryRow({ it, busy, onPick, onClear, onRemove, onBrowse }) {
  const picked = snapshotProduct(it)
  const sugs = it.product_suggestions
  return (
    <div className="g-row">
      <div className="g-head">
        <div>
          <span className="g-name">{it.name}</span>
          {it.quantity > 1 && <span className="muted small"> × {it.quantity}</span>}
          {it.is_usual && <span className="tag">usual</span>}
          {it.allergy_warning && <span className="status status-bad">Contains {it.allergy_warning.allergy}</span>}
        </div>
        <div className="g-actions">
          <button className="refresh small" onClick={onBrowse} disabled={busy}>More products</button>
          <button className="chip-x" onClick={onRemove} disabled={busy} title="Remove item">×</button>
        </div>
      </div>

      {picked && (
        <div className="g-picked">
          <span className="status status-good">In the cart</span>
          <ProductLine p={picked} />
          {it.product_warning && <span className="status status-bad">Now conflicts: {it.product_warning.allergy}</span>}
          <button className="refresh small" onClick={onClear} disabled={busy}>Remove product</button>
        </div>
      )}

      {sugs === undefined && !picked && <div className="muted small">Finding products…</div>}
      {sugs && sugs.length === 0 && !picked && <div className="muted small">No product is safe for the household.</div>}
      {sugs && sugs.length > 0 && (
        <div className="p-grid">
          {sugs.map((s) => (
            <ProductCard key={s.product.ref} s={s} picked={it.catalog_ref === s.product.ref} onPick={() => onPick(s.product.ref)} disabled={busy} />
          ))}
        </div>
      )}
      {it.preferred_brands?.length > 0 && (
        <div className="muted small">Usual brands: {it.preferred_brands.map((b) => `${b.brand} (${b.frequency}×)`).join(', ')}</div>
      )}
    </div>
  )
}

function size(p) {
  return p.package_size ? `${+Number(p.package_size).toFixed(1)} ${p.package_unit || ''}` : ''
}

function nutrient(p, code, unit) {
  const v = p.nutrients?.[code]?.amount
  return v != null ? `${Math.round(v * 10) / 10}${unit}` : null
}

function ProductLine({ p }) {
  return (
    <span className="p-line">
      <b>{p.brand}</b> {p.name} {size(p) && <span className="muted">· {size(p)}</span>}
    </span>
  )
}

function ProductCard({ s, picked, onPick, disabled }) {
  const p = s.product
  const facts = [
    nutrient(p, 'PROCNT', 'g protein'),
    nutrient(p, 'SUGAR', 'g sugar'),
    nutrient(p, 'ENERC_KCAL', ' kcal'),
  ].filter(Boolean)
  return (
    <div className={`p-card ${picked ? 'picked' : ''}`}>
      {p.image_url ? <img className="p-img" src={p.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <div className="p-img placeholder" />}
      <div className="p-body">
        <div className="web-site">{p.brand || '—'}</div>
        <div className="recipe-title">{p.name}</div>
        <div className="muted small">
          {[size(p), facts.length ? facts.join(' · ') + ` /${p.basis || '100g'}` : ''].filter(Boolean).join(' · ')}
        </div>
        {s.reasons?.length > 0 && (
          <div className="web-tags">
            {s.reasons.map((r) => (
              <span key={r} className="macro">{r}</span>
            ))}
          </div>
        )}
        <div className="web-actions">
          <span className="muted small">fit {Math.round((s.score || 0) * 100)}</span>
          {picked ? (
            <span className="status status-good">Picked</span>
          ) : (
            <button className="recipe-save-btn" onClick={onPick} disabled={disabled}>Pick</button>
          )}
        </div>
      </div>
    </div>
  )
}

function BrowseModal({ getToken, item, onClose, onPick }) {
  const [q, setQ] = useState(item.name)
  const [res, setRes] = useState({ loading: true, products: [], err: '' })
  const search = useCallback(
    async (query) => {
      setRes({ loading: true, products: [], err: '' })
      try {
        const out = await searchGroceryProducts(getToken, query, 20)
        setRes({ loading: false, products: out?.products || [], err: '' })
      } catch (e) {
        setRes({ loading: false, products: [], err: e.message })
      }
    },
    [getToken]
  )
  useEffect(() => {
    search(item.name)
  }, [search, item.name])
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="ip-backdrop" onClick={onClose}>
      <div className="ip-modal wide" onClick={(e) => e.stopPropagation()}>
        <header className="ip-head">
          <div className="ip-title">Products for “{item.name}”</div>
          <button className="ip-x" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <form
          className="pref-add browse-bar"
          onSubmit={(e) => {
            e.preventDefault()
            if (q.trim().length >= 2) search(q.trim())
          }}
        >
          <input value={q} onChange={(e) => setQ(e.target.value)} />
          <button>Search</button>
        </form>
        <div className="ip-body">
          {res.loading && <div className="muted">Searching the catalog…</div>}
          {res.err && <div className="error">{res.err}</div>}
          {!res.loading && !res.err && res.products.length === 0 && <div className="muted">Nothing safe for the household matches.</div>}
          <div className="p-grid">
            {res.products.map((s) => (
              <ProductCard key={s.product.ref} s={s} picked={item.catalog_ref === s.product.ref} onPick={() => onPick(s.product.ref)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
