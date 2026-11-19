import React, { useEffect, useState } from 'react'
import { getRecipe, saveRecipe, unsaveRecipe } from './api.js'
import Credit from './Credit.jsx'

// A Meelo recipe from search, as the app's recipe screen gets it
// (GET /recipes/id/:id): who it's by (the Meelo author card, or the original
// author of an import), the recipe, and Save / Unsave to her library.
export default function RecipeDetail({ getToken, recipeId, relation, onClose, onAdapt }) {
  const [r, setR] = useState(null)
  const [err, setErr] = useState('')
  const [rel, setRel] = useState(relation)
  const [busy, setBusy] = useState('')

  useEffect(() => {
    getRecipe(getToken, recipeId)
      .then(setR)
      .catch((e) => setErr(e.message))
  }, [getToken, recipeId])
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function toggleSave() {
    setBusy(rel === 'saved' ? 'Removing…' : 'Saving…')
    setErr('')
    try {
      if (rel === 'saved') {
        await unsaveRecipe(getToken, recipeId)
        setRel('public')
      } else {
        const out = await saveRecipe(getToken, recipeId)
        setRel(out?.own ? 'own' : 'saved')
      }
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy('')
    }
  }

  const img = r?.images?.[0]?.url
  return (
    <div className="ip-backdrop" onClick={onClose}>
      <div className="ip-modal wide" onClick={(e) => e.stopPropagation()}>
        <header className="ip-head">
          <div className="ip-title">
            {r?.dish_name || 'Recipe'} <span className="muted small">· recipe {recipeId}</span>
          </div>
          <button className="ip-x" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="ip-body">
          {err && <div className="error">{err}</div>}
          {!r && !err && <div className="muted">Loading…</div>}
          {r && (
            <>
              {img && <img className="detail-img" src={img} alt="" />}
              <Credit author={r.author} original={r.original_author} />
              <div className="muted small detail-facts">
                {[r.cuisine_type, (r.meal_type || []).join('/'), r.servings && `serves ${r.servings}`, r.total_time_minutes && `${r.total_time_minutes} min`, r.macros?.calories && `${r.macros.calories} kcal`]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
              <details className="raw-credit">
                <summary className="muted small">author / original_author JSON</summary>
                <pre className="raw">{JSON.stringify({ author: r.author ?? null, original_author: r.original_author ?? null }, null, 2)}</pre>
              </details>
              {r.description && <p>{r.description}</p>}
              <div className="detail-label">Ingredients ({r.ingredients?.length || 0})</div>
              <ul className="ingredients">
                {(r.ingredients || []).map((ing, i) => (
                  <li key={i}>{[ing.quantity, ing.unit, ing.name].filter(Boolean).join(' ')}</li>
                ))}
              </ul>
              <div className="detail-label">Steps ({r.steps?.length || 0})</div>
              <ol className="steps">
                {(r.steps || []).map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </>
          )}
        </div>
        <div className="ip-foot">
          {busy && <span className="muted small">{busy}</span>}
          {rel === 'own' ? (
            <span className="status status-good">Yours</span>
          ) : (
            <button className={`recipe-save-btn ${rel === 'saved' ? 'saved' : ''}`} onClick={toggleSave} disabled={!!busy || !r}>
              {rel === 'saved' ? 'Saved ✓ (remove)' : 'Save to my library'}
            </button>
          )}
          {onAdapt && r && (
            <button className="refresh small" onClick={() => onAdapt(r)}>
              Adapt in chat
            </button>
          )}
          <button className="refresh small" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
