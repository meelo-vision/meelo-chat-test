import React, { useEffect, useRef, useState } from 'react'
import {
  getMe,
  sendPrompt,
  startRecipeEdit,
  saveEditVersion,
  deleteThread,
  adaptRecipeNow,
  pick,
} from './api.js'
import './prefs.css'

// Adapt panel: the app's adapt flows, end to end.
//
//   chat  — a Recipe Edit thread (onboarding / Find & Cook): open it from a
//           saved recipe id or a draft object (nothing saved), send a message,
//           show Meelo's preview (diff, Changes, adapt notice), refine, then
//           Save (a version, or a new recipe for a draft) or Discard.
//   now   — POST /recipes/:id/adapt: the household version is made at once.
//
// source: { title, recipeId } for a saved recipe, or { title, recipe } for a
// draft (an import preview). mode: 'chat' | 'now'.

const DEFAULT_ASK = 'Adapt this recipe for my household.'

export default function AdaptLab({ getToken, source, mode = 'chat', onClose }) {
  const [adapt, setAdapt] = useState(true)
  const [threadId, setThreadId] = useState(null)
  const [turns, setTurns] = useState([]) // {sender, body, messageId, followOn}
  const [ask, setAsk] = useState(DEFAULT_ASK)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [saved, setSaved] = useState(null)
  const [nowResult, setNowResult] = useState(null)
  const userId = useRef(null)
  const scroller = useRef(null)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
  }, [turns, busy])

  async function me() {
    if (!userId.current) userId.current = pick(await getMe(getToken), 'ID', 'id')
    return userId.current
  }

  async function step(label, fn) {
    setBusy(label)
    setErr('')
    try {
      await fn()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy('')
    }
  }

  // Open the thread (if needed) and send one message.
  const send = (text) =>
    step(turns.length ? 'Meelo is editing…' : 'Opening and adapting…', async () => {
      const uid = await me()
      let tid = threadId
      if (!tid) {
        const t = await startRecipeEdit(getToken, { recipeId: source.recipeId, recipe: source.recipe, adapt })
        tid = pick(t, 'ThreadID', 'thread_id')
        setThreadId(tid)
      }
      setTurns((x) => [...x, { sender: 'user', body: text }])
      setAsk('')
      const resp = await sendPrompt(getToken, { user_id: uid, thread_id: tid, message: text })
      const msgs = pick(resp, 'message', 'Messages', 'messages') || []
      const replies = (Array.isArray(msgs) ? msgs : [msgs])
        .map((m) => ({
          sender: String(pick(m, 'Sender', 'sender') || 'meelo').toLowerCase(),
          body: pick(m, 'Body', 'body'),
          messageId: pick(m, 'MessageID', 'message_id'),
          followOn: pick(m, 'FollowOn', 'follow_on'),
        }))
        .filter((m) => m.sender !== 'user' && m.body)
      setTurns((x) => [...x, ...replies])
    })

  const lastRecipe = [...turns].reverse().find((t) => t.followOn?.recipe)

  const save = () =>
    step('Saving…', async () => {
      const out = await saveEditVersion(getToken, threadId, lastRecipe.messageId, true)
      setSaved(out)
    })

  const runNow = () =>
    step('Adapting (creates a version)…', async () => {
      setNowResult(await adaptRecipeNow(getToken, source.recipeId))
    })

  async function close() {
    // An unsaved thread is scratch space: drop it.
    if (threadId && !saved) {
      try {
        await deleteThread(getToken, threadId)
      } catch {
        /* the scheduler deletes it after 24h anyway */
      }
    }
    onClose()
  }

  return (
    <div className="ip-backdrop" onClick={close}>
      <div className="ip-modal wide adapt" onClick={(e) => e.stopPropagation()}>
        <header className="ip-head">
          <div className="ip-title">
            {mode === 'now' ? 'Adapt now' : 'Adapt in chat'} · {source.title}
            <span className="muted small">
              {' '}
              — {source.recipeId ? `recipe ${source.recipeId}` : 'draft (not saved)'}
            </span>
          </div>
          <button className="ip-x" onClick={close} aria-label="Close">✕</button>
        </header>

        <div className="ip-body" ref={scroller}>
          {err && <div className="error">{err}</div>}

          {mode === 'now' && !nowResult && (
            <div className="adapt-intro">
              <p>
                <b>POST /recipes/{source.recipeId}/adapt</b> — Model 2 adapts it to your household and saves the
                result as a version right away (your own recipe: made current; someone else's: on your saved copy).
              </p>
              <button className="recipe-save-btn" onClick={runNow} disabled={!!busy}>Adapt now</button>
            </div>
          )}
          {nowResult && (
            <>
              {nowResult.adapt_notice && <Notice n={nowResult.adapt_notice} />}
              <RecipeView r={nowResult.recipe} />
              <div className="muted small">
                {nowResult.adapt_notice ? 'No version was made.' : `Saved as recipe ${nowResult.id}`}
                {nowResult.saved_item_id ? ` · saved item ${nowResult.saved_item_id}` : ''}
              </div>
            </>
          )}

          {mode === 'chat' && turns.length === 0 && (
            <div className="adapt-intro">
              <p>
                Opens a Recipe Edit thread {source.recipeId ? `for recipe ${source.recipeId}` : 'from this draft'} —
                nothing is saved until you press Save.
              </p>
              <label className="adapt-toggle">
                <input type="checkbox" checked={adapt} onChange={(e) => setAdapt(e.target.checked)} />
                Adapt to my household (allergies, diets, goals). Off = edit exactly as asked.
              </label>
            </div>
          )}

          {turns.map((t, i) =>
            t.sender === 'user' ? (
              <div key={i} className="adapt-ask">{t.body}</div>
            ) : (
              <div key={i} className="adapt-reply">
                {t.followOn?.adapt_notice && <Notice n={t.followOn.adapt_notice} />}
                {t.followOn?.recipe ? (
                  <RecipeView r={t.followOn.recipe} body={t.body} />
                ) : (
                  <div className="adapt-text">{t.body}</div>
                )}
              </div>
            )
          )}
          {busy && <div className="muted adapt-busy">{busy}</div>}

          {saved && (
            <div className="g-picked">
              <span className="status status-good">Saved</span>
              <span>
                {pick(saved, 'dish_name') || pick(saved?.recipe, 'dish_name') || 'Recipe'} — recipe{' '}
                {pick(saved, 'id', 'ID') || pick(saved?.recipe, 'id')}
              </span>
            </div>
          )}
        </div>

        {mode === 'chat' && !saved && (
          <form
            className="pref-add browse-bar"
            onSubmit={(e) => {
              e.preventDefault()
              if (ask.trim() && !busy) send(ask.trim())
            }}
          >
            <input
              value={ask}
              onChange={(e) => setAsk(e.target.value)}
              placeholder={turns.length ? 'Refine — e.g. make it spicier, swap the rice for quinoa' : DEFAULT_ASK}
              disabled={!!busy}
            />
            <button disabled={!!busy || !ask.trim()}>{turns.length ? 'Send' : 'Adapt'}</button>
            {lastRecipe && (
              <button type="button" className="save-btn" onClick={save} disabled={!!busy}>
                Save {source.recipeId ? 'as version' : 'to my cookbook'}
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  )
}

function Notice({ n }) {
  return (
    <div className={`adapt-notice ${n.kind === 'cant_adapt' ? 'bad' : ''}`}>
      <b>{n.kind === 'cant_adapt' ? "Can't adapt" : 'No changes needed'}</b> — {n.message}
    </div>
  )
}

function ingText(i) {
  if (!i) return ''
  return [i.quantity, i.unit, i.name].filter((x) => x !== undefined && x !== null && x !== '' && x !== 0).join(' ')
}

// The Changes line Model 2 writes into the body ("Changes: …").
function changesLine(body) {
  const m = (body || '').match(/^\**changes:?\**\s*(.+)$/im)
  return m ? m[1].trim() : ''
}

function RecipeView({ r, body }) {
  if (!r) return null
  const diff = r.diff
  const changes = r.changes || changesLine(body)
  const removed = (diff?.ingredients || []).filter((d) => d.op === 'removed' || d.op === 'remove')
  const changedTo = new Map(
    (diff?.ingredients || []).filter((d) => d.to).map((d) => [ingText(d.to).toLowerCase(), d])
  )
  return (
    <div className="adapt-recipe">
      <h3>{r.dish_name}</h3>
      <div className="muted small">
        {[r.cuisine_type, r.servings && `serves ${r.servings}`, r.total_time_minutes && `${r.total_time_minutes} min`, r.macros?.calories && `${r.macros.calories} kcal`]
          .filter(Boolean)
          .join(' · ')}
        {diff?.dish_name && <> · renamed from “{diff.dish_name.from}”</>}
        {diff?.servings && <> · servings {diff.servings.from} → {diff.servings.to}</>}
      </div>
      {changes && <div className="adapt-changes"><b>Changes:</b> {changes}</div>}
      <div className="detail-label">Ingredients ({r.ingredients?.length || 0})</div>
      <ul className="ingredients">
        {(r.ingredients || []).map((ing, i) => {
          const d = changedTo.get(ingText(ing).toLowerCase())
          const cls = d ? (d.op === 'added' || d.op === 'add' ? 'ing-added' : 'ing-changed') : ''
          return (
            <li key={i} className={cls}>
              {ingText(ing)}
              {d?.from && <span className="muted small"> (was {ingText(d.from)})</span>}
              {d && !d.from && <span className="muted small"> (new)</span>}
            </li>
          )
        })}
        {removed.map((d, i) => (
          <li key={'r' + i} className="ing-removed">{ingText(d.from)}</li>
        ))}
      </ul>
      <div className="detail-label">Steps ({r.steps?.length || 0})</div>
      <ol className="steps">
        {(r.steps || []).map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
      {diff && (
        <div className="muted small">
          Diff vs recipe {diff.compared_to_recipe_id || '(draft)'}: {(diff.ingredients || []).length} ingredient and{' '}
          {(diff.steps || []).length} step changes
        </div>
      )}
    </div>
  )
}
