import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  SignedIn,
  SignedOut,
  SignIn,
  UserButton,
  useAuth,
} from '@clerk/clerk-react'
import {
  getMe,
  getThreads,
  getPrimaryMessages,
  sendPrompt,
  saveRecipeFromMessage,
  getRecipes,
  getCollections,
  pick,
} from './api.js'

// fmtTime renders a message's ISO timestamp as a short local time (e.g. "3:04 PM"),
// with the date prepended when it's not today. Returns '' for missing/bad input.
function fmtTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ''
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const today = new Date()
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  if (sameDay) return time
  const date = d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  return `${date}, ${time}`
}

export default function App() {
  return (
    <>
      <SignedOut>
        <div className="center">
          <div>
            <h1>Meelo Chat Test</h1>
            <p className="muted">Sign in with the Clerk account you use in the app.</p>
            <SignIn />
          </div>
        </div>
      </SignedOut>
      <SignedIn>
        <Workspace />
      </SignedIn>
    </>
  )
}

function Workspace() {
  const { getToken } = useAuth()
  const [me, setMe] = useState(null)
  const [threads, setThreads] = useState([])
  const [active, setActive] = useState(null) // the selected thread object
  const [loadErr, setLoadErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('chat') // 'chat' | 'recipes'

  const loadAll = useCallback(async () => {
    setLoading(true)
    setLoadErr('')
    try {
      const meResp = await getMe(getToken)
      setMe(meResp)
      const t = await getThreads(getToken)
      const list = pick(t, 'threads', 'Threads') || []
      setThreads(list)
    } catch (e) {
      setLoadErr(e.message)
    } finally {
      setLoading(false)
    }
  }, [getToken])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const userId = pick(me, 'ID', 'id')

  return (
    <div className="app">
      <aside className="sidebar">
        <header className="sidebar-head">
          <div>
            <div className="brand">Meelo</div>
            <div className="muted small">
              {me ? `user_id ${userId}` : '…'}
            </div>
          </div>
          <UserButton afterSignOutUrl="/" />
        </header>

        <button className="refresh" onClick={loadAll} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh threads'}
        </button>

        {loadErr && <div className="error">{loadErr}</div>}

        <div className="thread-list">
          {threads.map((t) => {
            const id = pick(t, 'ThreadID', 'thread_id')
            const title = pick(t, 'Title', 'title') || '(untitled)'
            const primary = pick(t, 'Primary', 'primary')
            const preview = pick(t, 'LastMessagePreview', 'last_message_preview')
            const activeId = active && pick(active, 'ThreadID', 'thread_id')
            return (
              <button
                key={id}
                className={`thread ${activeId === id ? 'sel' : ''}`}
                onClick={() => setActive(t)}
              >
                <div className="thread-title">
                  {title} {primary ? <span className="tag">primary</span> : null}
                </div>
                {preview ? <div className="muted small ellipsis">{preview}</div> : null}
              </button>
            )
          })}
          {!loading && threads.length === 0 && !loadErr && (
            <div className="muted small pad">No threads.</div>
          )}
        </div>
      </aside>

      <main className="main">
        <div className="tabs">
          <button
            className={`tab ${tab === 'chat' ? 'active' : ''}`}
            onClick={() => setTab('chat')}
          >
            Chat
          </button>
          <button
            className={`tab ${tab === 'recipes' ? 'active' : ''}`}
            onClick={() => setTab('recipes')}
          >
            Recipes
          </button>
        </div>

        {tab === 'chat' ? (
          active && userId ? (
            <Chat
              key={pick(active, 'ThreadID', 'thread_id')}
              getToken={getToken}
              userId={userId}
              thread={active}
            />
          ) : (
            <div className="center muted">Pick a thread to start chatting.</div>
          )
        ) : (
          <Recipes getToken={getToken} />
        )}
      </main>
    </div>
  )
}

function Chat({ getToken, userId, thread }) {
  const threadId = pick(thread, 'ThreadID', 'thread_id')
  const isPrimary = !!pick(thread, 'Primary', 'primary')
  const [messages, setMessages] = useState([]) // {sender, body}
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState('')
  const scroller = useRef(null)

  // Seed history for the primary thread (get-messages loads the primary only).
  useEffect(() => {
    let cancelled = false
    setMessages([])
    setErr('')
    if (!isPrimary) return
    getPrimaryMessages(getToken)
      .then((resp) => {
        if (cancelled) return
        const raw = pick(resp, 'messages', 'Messages') || []
        setMessages(
          raw.map((m) => ({
            sender: pick(m, 'Sender', 'sender'),
            body: pick(m, 'Body', 'body'),
            messageId: pick(m, 'MessageID', 'message_id'),
            messageType: pick(m, 'MessageType', 'message_type'),
            createdAt: pick(m, 'CreatedAt', 'created_at'),
          }))
        )
      })
      .catch((e) => !cancelled && setErr(e.message))
    return () => {
      cancelled = true
    }
  }, [threadId, isPrimary, getToken])

  useEffect(() => {
    scroller.current?.scrollTo(0, scroller.current.scrollHeight)
  }, [messages, sending])

  async function send() {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    setErr('')
    setMessages((m) => [
      ...m,
      { sender: 'user', body: text, createdAt: new Date().toISOString() },
    ])
    setSending(true)
    try {
      const resp = await sendPrompt(getToken, {
        user_id: userId,
        thread_id: threadId,
        message: text,
      })
      const replies = pick(resp, 'message', 'Messages', 'messages') || []
      const mapped = (Array.isArray(replies) ? replies : [replies]).map((m) => ({
        sender: pick(m, 'Sender', 'sender') || 'meelo',
        body: pick(m, 'Body', 'body'),
        messageId: pick(m, 'MessageID', 'message_id'),
        messageType: pick(m, 'MessageType', 'message_type'),
        createdAt: pick(m, 'CreatedAt', 'created_at'),
      }))
      // The /prompt response echoes the user's own message back at the head of
      // its Messages array (it's persisted as sender "user") alongside Meelo's
      // reply. We already added the user's bubble optimistically above, so drop
      // any user-sender messages here to avoid rendering it twice.
      setMessages((m) => [
        ...m,
        ...mapped.filter(
          (x) => x.body && String(x.sender).toLowerCase() !== 'user'
        ),
      ])
    } catch (e) {
      setErr(e.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="chat">
      <header className="chat-head">
        <div className="thread-title">{pick(thread, 'Title', 'title') || '(untitled)'}</div>
        <div className="muted small">thread_id {threadId}</div>
        {!isPrimary && (
          <div className="muted small">
            (history isn’t loaded for non-primary threads — chat live)
          </div>
        )}
      </header>

      <div className="messages" ref={scroller}>
        {messages.map((m, i) => {
          const isRecipe =
            String(m.messageType).toLowerCase() === 'recipe' && !!m.messageId
          return (
            <div key={i} className={`msg ${m.sender === 'user' ? 'me' : 'meelo'}`}>
              <div className="bubble">
                {m.body}
                {isRecipe && (
                  <RecipeSaveButton
                    getToken={getToken}
                    threadId={threadId}
                    messageId={m.messageId}
                  />
                )}
              </div>
              {m.createdAt && (
                <div className="msg-time muted small">{fmtTime(m.createdAt)}</div>
              )}
            </div>
          )
        })}
        {sending && (
          <div className="msg meelo">
            <div className="bubble thinking">Meelo is thinking…</div>
          </div>
        )}
      </div>

      {err && <div className="error">{err}</div>}

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message Meelo…"
          disabled={sending}
          autoFocus
        />
        <button type="submit" disabled={sending || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  )
}

// RecipeSaveButton converts a recipe chat message into a stored recipe via
// POST /recipes/from-message. It's shown only on messages whose message_type is
// "recipe". The save is idempotent server-side (keyed by message_id), so
// re-tapping just refreshes the same row.
function RecipeSaveButton({ getToken, threadId, messageId }) {
  const [state, setState] = useState('idle') // idle | saving | saved | error
  const [err, setErr] = useState('')

  async function save() {
    if (state === 'saving') return
    setState('saving')
    setErr('')
    try {
      await saveRecipeFromMessage(getToken, { threadId, messageId })
      setState('saved')
    } catch (e) {
      setState('error')
      setErr(e.message)
    }
  }

  return (
    <div className="recipe-save">
      <button
        className="recipe-save-btn"
        onClick={save}
        disabled={state === 'saving' || state === 'saved'}
        title="Save this recipe to your collection"
      >
        {state === 'saving'
          ? 'Saving…'
          : state === 'saved'
            ? '✓ Saved to recipes'
            : '🍳 Save recipe'}
      </button>
      {state === 'error' && <span className="recipe-save-err">{err}</span>}
    </div>
  )
}

// Recipes tab: all of the user's recipes, plus their collections with the
// recipes inside each. Collections come back with lightweight membership rows
// (recipe_id + entity_title); we hydrate them against the full recipe list so
// each collection shows real recipe cards.
function Recipes({ getToken }) {
  const [collections, setCollections] = useState([])
  const [recipes, setRecipes] = useState([])
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState(null) // expanded recipe id

  const load = useCallback(async () => {
    setLoading(true)
    setErr('')
    try {
      const [c, r] = await Promise.all([
        getCollections(getToken),
        getRecipes(getToken),
      ])
      setCollections(pick(c, 'collections', 'Collections') || [])
      setRecipes(pick(r, 'recipes', 'Recipes') || [])
    } catch (e) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }, [getToken])

  useEffect(() => {
    load()
  }, [load])

  // Index recipes by id so collection membership rows can be hydrated.
  const byId = {}
  recipes.forEach((r) => {
    const id = pick(r, 'id', 'ID')
    if (id !== undefined) byId[id] = r
  })

  const toggle = (id) => setOpenId((cur) => (cur === id ? null : id))

  if (loading) return <div className="center muted">Loading recipes…</div>
  if (err) return <div className="error">{err}</div>

  return (
    <div className="recipes">
      <div className="recipes-head">
        <h2>Recipes</h2>
        <button className="refresh small" onClick={load}>
          Refresh
        </button>
      </div>

      {/* Collections */}
      <section className="section">
        <h3 className="section-title">
          Collections <span className="muted small">({collections.length})</span>
        </h3>
        {collections.length === 0 && (
          <div className="muted small pad">No collections yet.</div>
        )}
        {collections.map((col) => {
          const cid = pick(col, 'id', 'ID')
          const name = pick(col, 'name', 'Name') || '(untitled)'
          const count = pick(col, 'item_count', 'ItemCount') ?? 0
          const items = pick(col, 'items', 'Items') || []
          const color = pick(col, 'color', 'Color')
          return (
            <div key={cid} className="collection">
              <div className="collection-head">
                <span className="dot" style={color ? { background: color } : {}} />
                <span className="collection-name">{name}</span>
                <span className="muted small">{count} items</span>
              </div>
              <div className="recipe-grid">
                {items.map((it) => {
                  const rid = pick(it, 'recipe_id', 'RecipeID')
                  const r = rid !== undefined ? byId[rid] : undefined
                  if (r) {
                    return (
                      <RecipeCard
                        key={pick(it, 'id', 'ID')}
                        recipe={r}
                        open={openId === pick(r, 'id', 'ID')}
                        onToggle={() => toggle(pick(r, 'id', 'ID'))}
                      />
                    )
                  }
                  // Fallback: item without a hydrated recipe (e.g. not owned/loaded).
                  const title = pick(it, 'entity_title', 'EntityTitle') || 'Recipe'
                  return (
                    <div key={pick(it, 'id', 'ID')} className="recipe-card muted">
                      <div className="recipe-title">{title}</div>
                    </div>
                  )
                })}
                {items.length === 0 && (
                  <div className="muted small pad">Empty collection.</div>
                )}
              </div>
            </div>
          )
        })}
      </section>

      {/* All recipes */}
      <section className="section">
        <h3 className="section-title">
          All recipes <span className="muted small">({recipes.length})</span>
        </h3>
        {recipes.length === 0 && (
          <div className="muted small pad">
            No recipes yet — save one from a recipe message in the Chat tab.
          </div>
        )}
        <div className="recipe-grid">
          {recipes.map((r) => {
            const id = pick(r, 'id', 'ID')
            return (
              <RecipeCard
                key={id}
                recipe={r}
                open={openId === id}
                onToggle={() => toggle(id)}
              />
            )
          })}
        </div>
      </section>
    </div>
  )
}

// RecipeCard renders one recipe: a summary line always, and (when expanded) its
// ingredients, steps, and macros.
function RecipeCard({ recipe, open, onToggle }) {
  const name = pick(recipe, 'dish_name', 'DishName') || 'Untitled recipe'
  const servings = pick(recipe, 'servings', 'Servings')
  const total = pick(recipe, 'total_time_minutes', 'TotalTimeMinutes')
  const prep = pick(recipe, 'prep_time_minutes', 'PrepTimeMinutes')
  const cook = pick(recipe, 'cook_time_minutes', 'CookTimeMinutes')
  const isPublic = pick(recipe, 'public', 'Public')
  const ingredients = pick(recipe, 'ingredients', 'Ingredients') || []
  const steps = pick(recipe, 'steps', 'Steps') || []
  const macros = pick(recipe, 'macros', 'Macros')

  const meta = []
  if (servings) meta.push(`${servings} servings`)
  if (total) meta.push(`${total} min`)
  else if (prep || cook) meta.push(`${(prep || 0) + (cook || 0)} min`)

  return (
    <div className={`recipe-card ${open ? 'open' : ''}`}>
      <button className="recipe-card-head" onClick={onToggle}>
        <div className="recipe-title">
          {name} {isPublic ? <span className="tag">public</span> : null}
        </div>
        {meta.length > 0 && <div className="muted small">{meta.join(' • ')}</div>}
      </button>

      {open && (
        <div className="recipe-detail">
          {ingredients.length > 0 && (
            <>
              <div className="detail-label">Ingredients</div>
              <ul className="ingredients">
                {ingredients.map((ing, i) => {
                  const qty = pick(ing, 'quantity', 'Quantity')
                  const unit = pick(ing, 'unit', 'Unit')
                  const iname = pick(ing, 'name', 'Name')
                  const optional = pick(ing, 'optional', 'Optional')
                  return (
                    <li key={i}>
                      {[qty, unit, iname].filter(Boolean).join(' ')}
                      {optional ? <span className="muted small"> (optional)</span> : null}
                    </li>
                  )
                })}
              </ul>
            </>
          )}
          {steps.length > 0 && (
            <>
              <div className="detail-label">Steps</div>
              <ol className="steps">
                {steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </>
          )}
          {macros && (
            <div className="macros">
              {['calories', 'protein_g', 'fat_g', 'carbs_g'].map((k) => {
                const v = pick(macros, k)
                if (!v) return null
                const label = k === 'calories' ? 'cal' : k.replace('_g', '')
                return (
                  <span key={k} className="macro">
                    {v} {label}
                  </span>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
