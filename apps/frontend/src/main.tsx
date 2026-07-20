import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App as CapacitorApp } from '@capacitor/app'
import './index.css'
import App from './App.tsx'

void CapacitorApp.addListener('appUrlOpen', ({ url }) => {
  try {
    const target = new URL(url)
    window.history.pushState({}, '', `${target.pathname}${target.search}${target.hash}`)
    window.dispatchEvent(new PopStateEvent('popstate'))
  } catch {
    // Ignore malformed external URLs.
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
