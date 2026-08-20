import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// The browser calls same-origin /api/core/* and /api/prompt/*; Vite's dev server
// proxies them server-side to the real backends. This sidesteps CORS (the
// prompt_engine has no CORS middleware) and lets you point at local or staging.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const core = env.CORE_API_URL || 'http://localhost:8080'
  const prompt = env.PROMPT_ENGINE_URL || 'http://localhost:8081'
  // The API authenticates via the Authorization: Bearer header — cookies are not
  // used. But same-origin fetches attach ALL localhost cookies, and Clerk's dev
  // instance sets several large ones; forwarding that fat Cookie header trips the
  // backend's header-size limit (fasthttp ~4KB) → HTTP 431 "Request Header Fields
  // Too Large". Strip the Cookie header on every proxied request.
  const stripCookies = (proxy) => {
    proxy.on('proxyReq', (proxyReq) => proxyReq.removeHeader('cookie'))
  }

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api/core': {
          target: core,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/core/, ''),
          configure: stripCookies,
        },
        '/api/prompt': {
          target: prompt,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/prompt/, ''),
          configure: stripCookies,
        },
      },
    },
  }
})
