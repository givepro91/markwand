import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/themes.css'
import './styles/globals.css'
import './i18n' // i18next 초기화 (ko/en). prefs override 는 App 내 useEffect 에서 로드.
import App from './App'

const container = document.getElementById('root')
if (!container) throw new Error('Root element not found')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)
