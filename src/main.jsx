import React from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import App from './App.jsx'
import './styles.css'

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

const root = createRoot(document.getElementById('root'))
if (!publishableKey) {
  root.render(
    <div className="notice">
      Missing <code>VITE_CLERK_PUBLISHABLE_KEY</code>. Add it to{' '}
      <code>.env.local</code> and restart <code>npm run dev</code>.
    </div>
  )
} else {
  root.render(
    <ClerkProvider publishableKey={publishableKey}>
      <App />
    </ClerkProvider>
  )
}
