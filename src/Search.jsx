import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  getSuggestions,
  searchRecipes,
  searchWeb,
  clearRecentSearches,
  importRecipeURL,
} from './api.js'
import './search.css'

// Search tab: the search box with autocomplete (GET /search/suggest), then
// Meelo's own recipes (GET /search/recipes) beside recipe pages from the web
// (GET /search/web) with each page's import_status. Import previews the draft
// from POST /recipes/import; nothing is saved.

const STATUS = {
  ready: { label: 'Ready to import', tone: 'good' },
  unverified: { label: 'Not checked yet', tone: 'neutral' },
  blocked: { label: 'Site blocks import', tone: 'bad' },
  no_recipe: { label: 'No recipe on page', tone: 'bad' },
  multiple_recipes: { label: 'Several recipes', tone: 'bad' },
  link_only: { label: 'Link only', tone: 'neutral' },
}

const KIND_LABEL = { recent: 'Recent', recipe: 'Meelo', web: 'Web' }

export default function Search({ getToken }) {
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('') // the search that was run
  const [suggestions, setSuggestions] = useState([])
  const [showSuggest, setShowSuggest] = useState(false)
  const [highlight, setHighlight] = useState(-1)

  const [meelo, setMeelo] = useState({ loading: false, results: [], err: '' })
  const [web, setWeb] = useState({ loading: false, results: [], err: '', nextPage: null, ms: 0 })
  const [preview, setPreview] = useState(null) // { result, loading, draft, err }

  const boxRef = useRef(null)
  const suggestSeq = useRef(0)

  // Autocomplete, debounced. Empty input shows recents.
  useEffect(() => {
    if (!showSuggest) return
    const seq = ++suggestSeq.current
    const t = setTimeout(async () => {
      try {
        const out = await getSuggestions(getToken, input.trim())
        if (seq === suggestSeq.current) {
          setSuggestions(out?.suggestions || [])
          setHighlight(-1)
        }
      } catch {
        if (seq === suggestSeq.current) setSuggestions([])
      }
    }, 180)
    return () => clearTimeout(t)
  }, [input, showSuggest, getToken])

  // Close the dropdown on outside clicks.
  useEffect(() => {
    const onDown = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setShowSuggest(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const run = useCallback(
    async (q) => {
      q = q.trim().replace(/\s+/g, ' ')
      if (q.length < 2) return
      setInput(q)
      setQuery(q)
      setShowSuggest(false)
      setMeelo({ loading: true, results: [], err: '' })
      setWeb({ loading: true, results: [], err: '', nextPage: null, ms: 0 })

      searchRecipes(getToken, q)
        .then((out) => setMeelo({ loading: false, results: out?.results || [], err: '' }))
        .catch((e) => setMeelo({ loading: false, results: [], err: e.message }))

      const t0 = performance.now()
      searchWeb(getToken, q, 0)
        .then((out) =>
          setWeb({
            loading: false,
            results: out?.results || [],
            err: '',
            nextPage: out?.next_page ?? null,
            ms: Math.round(performance.now() - t0),
          })
        )
        .catch((e) => setWeb({ loading: false, results: [], err: e.message, nextPage: null, ms: 0 }))
    },
    [getToken]
  )

  async function moreWeb() {
    if (web.nextPage == null) return
    setWeb((w) => ({ ...w, loading: true }))
    try {
      const out = await searchWeb(getToken, query, web.nextPage)
      setWeb((w) => ({
        ...w,
        loading: false,
        results: [...w.results, ...(out?.results || [])],
        nextPage: out?.next_page ?? null,
      }))
    } catch (e) {
      setWeb((w) => ({ ...w, loading: false, err: e.message }))
    }
  }

  async function clearRecents() {
    try {
      await clearRecentSearches(getToken)
      setSuggestions((s) => s.filter((x) => x.kind !== 'recent'))
    } catch {
      /* ignore */
    }
  }

  async function openImport(result) {
    setPreview({ result, loading: true, draft: null, err: '' })
    try {
      const out = await importRecipeURL(getToken, result.url)
      setPreview({ result, loading: false, draft: out?.draft, err: '' })
    } catch (e) {
      setPreview({ result, loading: false, draft: null, err: e.message })
    }
  }

  function onKeyDown(e) {
    if (!showSuggest || suggestions.length === 0) {
      if (e.key === 'Enter') run(input)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      run(highlight >= 0 ? suggestions[highlight].text : input)
    } else if (e.key === 'Escape') {
      setShowSuggest(false)
    }
  }

  const hasRecents = suggestions.some((s) => s.kind === 'recent')

  return (
    <div className="search">
      <div className="search-bar" ref={boxRef}>
        <input
          className="search-input"
          placeholder="Search recipes — try “daal chawal”"
          value={input}
          onChange={(e) => {
            setInput(e.target.value)
            setShowSuggest(true)
          }}
          onFocus={() => setShowSuggest(true)}
          onKeyDown={onKeyDown}
        />
        <button className="search-go" onClick={() => run(input)} disabled={input.trim().length < 2}>
          Search
        </button>

        {showSuggest && suggestions.length > 0 && (
          <div className="suggest">
            {suggestions.map((s, i) => (
              <button
                key={s.kind + s.text + i}
                className={`suggest-row ${i === highlight ? 'hl' : ''}`}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => run(s.text)}
              >
                <span className={`kind kind-${s.kind}`}>{KIND_LABEL[s.kind] || s.kind}</span>
                <span className="suggest-text">{s.text}</span>
                {s.relation && <span className="muted small">{s.relation}</span>}
              </button>
            ))}
            {hasRecents && (
              <button className="suggest-clear" onClick={clearRecents}>
                Clear recent searches
              </button>
            )}
          </div>
        )}
      </div>

      {!query && (
        <div className="center muted">
          Search Meelo and the web. Suggestions show recents, Meelo recipes and
          web dish names (web needs BRAVE_SUGGEST_API_KEY).
        </div>
      )}

      {query && (
        <div className="search-results">
          <section className="section">
            <h3 className="section-title">
              On Meelo <span className="muted small">({meelo.results.length})</span>
            </h3>
            {meelo.loading && <div className="muted small pad">Searching Meelo…</div>}
            {meelo.err && <div className="error">{meelo.err}</div>}
            {!meelo.loading && !meelo.err && meelo.results.length === 0 && (
              <div className="muted small pad">No Meelo recipes match “{query}”.</div>
            )}
            <div className="meelo-grid">
              {meelo.results.map((r) => (
                <div key={`${r.id}-${r.recipe_id}`} className="meelo-card" style={r.color ? { borderLeftColor: r.color } : {}}>
                  {r.image_url ? (
                    <img className="meelo-img" src={r.image_url} alt="" loading="lazy" />
                  ) : (
                    <div className="meelo-img placeholder" />
                  )}
                  <div className="meelo-body">
                    <div className="recipe-title">{r.title}</div>
                    <div className="muted small">
                      {[r.author_display_name || r.author || r.subtitle, r.relation, r.total_time_minutes && `${r.total_time_minutes} min`]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="section">
            <h3 className="section-title">
              From the web <span className="muted small">({web.results.length}{web.ms ? ` · ${web.ms} ms` : ''})</span>
            </h3>
            {web.err && <div className="error">{web.err}</div>}
            {!web.loading && !web.err && web.results.length === 0 && (
              <div className="muted small pad">No recipe pages found.</div>
            )}
            <div className="web-grid">
              {web.results.map((r) => (
                <WebCard key={r.url} r={r} onImport={() => openImport(r)} />
              ))}
            </div>
            {web.loading && <div className="muted small pad">Searching the web… (checks each page can be imported)</div>}
            {!web.loading && web.nextPage != null && (
              <button className="refresh small more" onClick={moreWeb}>
                More from the web
              </button>
            )}
          </section>
        </div>
      )}

      {preview && <ImportPreview preview={preview} onClose={() => setPreview(null)} />}
    </div>
  )
}

function WebCard({ r, onImport }) {
  const status = STATUS[r.import_status] || { label: r.import_status || 'unknown', tone: 'neutral' }
  const facts = [
    r.total_minutes && `${r.total_minutes} min`,
    r.servings && `serves ${r.servings}`,
    r.calories && `${r.calories} kcal`,
    r.rating && `★ ${r.rating.toFixed(1)}${r.rating_count ? ` (${r.rating_count})` : ''}`,
  ].filter(Boolean)
  return (
    <div className="web-card">
      {r.image_url ? (
        <img className="web-img" src={r.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" />
      ) : (
        <div className="web-img placeholder" />
      )}
      <div className="web-body">
        <div className="web-site">
          {r.site_name || r.site}
          {r.site_name && r.site_name !== r.site && <span className="muted"> · {r.site}</span>}
        </div>
        <div className="recipe-title">{r.title}</div>
        {facts.length > 0 && <div className="web-facts">{facts.join(' · ')}</div>}
        <div className="web-tags">
          {r.cuisine && <span className="macro">{r.cuisine}</span>}
          {r.category && <span className="macro">{r.category}</span>}
          <span className={`status status-${status.tone}`}>
            {status.label}
            {r.import_status === 'ready' && r.ingredient_count ? ` · ${r.ingredient_count} ingredients` : ''}
          </span>
        </div>
        <div className="web-actions">
          <a className="web-open" href={r.url} target="_blank" rel="noreferrer">
            Open on site ↗
          </a>
          {r.importable && (
            <button className="recipe-save-btn" onClick={onImport}>
              Import
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ImportPreview({ preview, onClose }) {
  const { result, loading, draft, err } = preview
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="ip-backdrop" onClick={onClose}>
      <div className="ip-modal" onClick={(e) => e.stopPropagation()}>
        <header className="ip-head">
          <div className="ip-title">Import preview · {result.site}</div>
          <button className="ip-x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="ip-body">
          {loading && <div className="muted">Importing… (fetch + Model 2, a few seconds)</div>}
          {err && <div className="error">{err}</div>}
          {draft && (
            <>
              <h2 className="import-title">{draft.dish_name}</h2>
              <div className="muted small">
                {[
                  draft.cuisine_type,
                  draft.servings && `serves ${draft.servings}`,
                  draft.total_time_minutes && `${draft.total_time_minutes} min`,
                  draft.macros?.calories && `${draft.macros.calories} kcal`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
              {draft.description && <p>{draft.description}</p>}
              <div className="detail-label">Ingredients ({draft.ingredients?.length || 0})</div>
              <ul className="ingredients">
                {(draft.ingredients || []).map((ing, i) => (
                  <li key={i}>
                    {[ing.quantity, ing.unit, ing.name].filter(Boolean).join(' ')}
                    {ing.optional ? <span className="muted"> (optional)</span> : null}
                  </li>
                ))}
              </ul>
              <div className="detail-label">Steps ({draft.steps?.length || 0})</div>
              <ol className="steps">
                {(draft.steps || []).map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
              <div className="muted small import-note">Preview only — not saved.</div>
            </>
          )}
        </div>
        <div className="ip-foot">
          <a className="web-open" href={result.url} target="_blank" rel="noreferrer">
            Original ↗
          </a>
          <button className="refresh small" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
