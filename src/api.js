// Thin fetch helpers. Each takes Clerk's getToken() so it can attach
// `Authorization: Bearer <clerk session token>` — what the backend's
// RequireClerkAuth middleware expects.

async function request(getToken, base, path, opts = {}) {
  const token = await getToken()
  const res = await fetch(base + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  })
  const raw = await res.text()
  let data = null
  try {
    data = raw ? JSON.parse(raw) : null
  } catch {
    data = raw
  }
  if (!res.ok) {
    const msg =
      (data && (data.error || data.message)) ||
      (typeof data === 'string' && data) ||
      `HTTP ${res.status}`
    throw new Error(msg)
  }
  return data
}

// Read a field regardless of JSON casing (Go structs here have no json tags, so
// they serialize as capitalized Go field names, e.g. "ThreadID" / "Sender").
export function pick(obj, ...keys) {
  if (!obj) return undefined
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null) return obj[k]
  return undefined
}

// Auth routes are mounted under /auth in core (app.Group("/auth")).
export const getMe = (getToken) => request(getToken, '/api/core', '/auth/get-user')

export const getThreads = (getToken) => request(getToken, '/api/core', '/threads')

export const getPrimaryMessages = (getToken) =>
  request(getToken, '/api/core', '/threads/get-messages')

export const sendPrompt = (getToken, body) =>
  request(getToken, '/api/prompt', '/prompt', {
    method: 'POST',
    body: JSON.stringify(body),
  })

// ── Recipes & collections (core) ─────────────────────────────────────────────

// Convert a recipe-type chat message into a stored recipe. The backend verifies
// the message belongs to the thread AND is a recipe (message_type == "recipe").
export const saveRecipeFromMessage = (getToken, { threadId, messageId }) =>
  request(getToken, '/api/core', '/recipes/from-message', {
    method: 'POST',
    body: JSON.stringify({ thread_id: threadId, message_id: messageId }),
  })

// All the user's recipes (newest-first). Pass a collectionId to scope to one.
export const getRecipes = (getToken, collectionId) =>
  request(
    getToken,
    '/api/core',
    '/recipes' + (collectionId ? `?collection_id=${collectionId}` : '')
  )

// Every collection the user owns, each with its lightweight membership rows
// (recipe_id + cached entity_title) and an item_count.
export const getCollections = (getToken) =>
  request(getToken, '/api/core', '/collections')
