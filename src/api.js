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

// ── Search (core) ────────────────────────────────────────────────────────────

const qs = (params) =>
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&')

// Autocomplete rows: { text, kind: recent | recipe | web, recipe_id?, relation? }.
export const getSuggestions = (getToken, q) =>
  request(getToken, '/api/core', `/search/suggest?${qs({ q })}`)

// Meelo recipes the caller can open (own, saved, public).
// source: meelo (default) | web | all. all adds the web's first page as
// `web` ({results, next_page}); web answers exactly like /search/web.
export const searchRecipes = (getToken, q, cursor, source) =>
  request(getToken, '/api/core', `/search/recipes?${qs({ q, cursor, source })}`)

// Recipe pages from the web (Brave), with import_status per result.
export const searchWeb = (getToken, q, page = 0) =>
  request(getToken, '/api/core', `/search/web?${qs({ q, page })}`)

export const clearRecentSearches = (getToken) =>
  request(getToken, '/api/core', '/search/recent', { method: 'DELETE' })

// A URL → a recipe draft (not saved).
export const importRecipeURL = (getToken, url) =>
  request(getToken, '/api/core', '/recipes/import', {
    method: 'POST',
    body: JSON.stringify({ url }),
  })

// ── Preferences (core /context) ──────────────────────────────────────────────

// The user's assembled context: dietary, health, nutrition, grocery, … facets.
export const getContext = (getToken) => request(getToken, '/api/core', '/context')

// Create/update fields. List keys (allergy, dietary_restriction, …) append;
// scalar keys (daily_protein_goal, …) overwrite. Returns the new context.
export const patchContextFields = (getToken, fields) =>
  request(getToken, '/api/core', '/context/fields', {
    method: 'PATCH',
    body: JSON.stringify({ fields }),
  })

// Remove one value from a list key (or a scalar key). Returns the new context.
export const deleteContextField = (getToken, key, value) =>
  request(getToken, '/api/core', '/context/fields', {
    method: 'DELETE',
    body: JSON.stringify({ key, value }),
  })

// ── Groceries (core /grocery) ────────────────────────────────────────────────

export const getGroceries = (getToken) => request(getToken, '/api/core', '/grocery/items')

export const addGroceries = (getToken, names) =>
  request(getToken, '/api/core', '/grocery/items', {
    method: 'POST',
    body: JSON.stringify({ items: names.map((name) => ({ name })) }),
  })

export const removeGrocery = (getToken, id) =>
  request(getToken, '/api/core', `/grocery/items/${id}`, { method: 'DELETE' })

// Put a catalog product on an item ("in the cart"). 422 allergen_conflict when
// it conflicts with a household allergy.
export const pickGroceryProduct = (getToken, id, ref) =>
  request(getToken, '/api/core', `/grocery/items/${id}/product`, {
    method: 'PUT',
    body: JSON.stringify({ ref }),
  })

export const clearGroceryProduct = (getToken, id) =>
  request(getToken, '/api/core', `/grocery/items/${id}/product`, { method: 'DELETE' })

// More catalog products for q (US, household allergies, ranked).
export const searchGroceryProducts = (getToken, q, limit = 10) =>
  request(getToken, '/api/core', `/grocery/products/search?q=${encodeURIComponent(q)}&limit=${limit}`)

// ── Adapt (core) ─────────────────────────────────────────────────────────────

// Open a Recipe Edit thread (nothing saved). From a saved recipe id, or from a
// recipe object (an import / generate draft). adapt=false edits without the
// household's allergies, diets and goals.
export const startRecipeEdit = (getToken, { recipeId, recipe, adapt = true }) =>
  request(getToken, '/api/core', recipeId ? `/threads/recipe-edit/${recipeId}` : '/threads/recipe-edit', {
    method: 'POST',
    body: JSON.stringify(recipeId ? { adapt } : { recipe, adapt }),
  })

// Save a Meelo recipe reply in a Recipe Edit thread (a version, or a new
// recipe for a thread opened from an object).
export const saveEditVersion = (getToken, threadId, messageId, makeCurrent = true) =>
  request(getToken, '/api/core', `/threads/${threadId}/messages/${messageId}/save-version`, {
    method: 'POST',
    body: JSON.stringify({ make_current: makeCurrent }),
  })

// Drop a Recipe Edit thread (scratch; hard-deleted).
export const deleteThread = (getToken, threadId) =>
  request(getToken, '/api/core', `/threads/${threadId}`, { method: 'DELETE' })

// One-shot adapt: makes the household version now (or answers adapt_notice).
export const adaptRecipeNow = (getToken, recipeId) =>
  request(getToken, '/api/core', `/recipes/${recipeId}/adapt`, { method: 'POST', body: '{}' })
