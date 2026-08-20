# Meelo Chat Test (local)

A tiny local React app to smoke-test the Meelo backend: Clerk sign-in → your
threads → click one → chat with the prompt engine. Not a repo, not for prod.

## Setup

1. **Fill in `.env.local`** (already scaffolded):
   - `VITE_CLERK_PUBLISHABLE_KEY` — the Clerk **publishable** key (`pk_test_…`)
     for the **same** Clerk instance the backend validates against (the one
     whose `sk_…` is in `core/.env` / prompt_engine's env). Clerk dashboard →
     API Keys.
   - `CORE_API_URL` — base URL of the **core** service (default
     `http://localhost:8080`). Threads + `get-user` come from here.
   - `PROMPT_ENGINE_URL` — base URL of the **prompt_engine** service (default
     `http://localhost:8081`). Chat (`/prompt`) goes here.

   > ⚠️ Both services default to `PORT=8080`. If you run them locally, start
   > prompt_engine on a different port, e.g. `PORT=8081 go run ./cmd/server`.
   > Or point these at your **staging** URLs instead.

2. **Install + run:**
   ```bash
   cd meelo-chat-test
   npm install
   npm run dev
   ```
   Open http://localhost:5173.

## How it works

- The Vite dev server **proxies** `/api/core/*` → `CORE_API_URL` and
  `/api/prompt/*` → `PROMPT_ENGINE_URL`, so there are no CORS issues (the
  prompt_engine has no CORS middleware) and the Clerk `Authorization: Bearer`
  header is forwarded to the backends.
- On sign-in it calls `GET /get-user` to resolve your internal `user_id`, then
  `GET /threads` for the list.
- Sending a message POSTs `{ user_id, thread_id, message }` to `/prompt` and
  renders the reply.

## Notes / limitations

- **Message history** is loaded only for your **primary** thread (the backend's
  `get-messages` returns the primary thread). Co-pilot threads start empty and
  chat live.
- You must already have a Meelo account (onboarded) for the Clerk user you sign
  in with — otherwise `GET /get-user` returns 404.
- The chat is text-only (no image upload / location).
