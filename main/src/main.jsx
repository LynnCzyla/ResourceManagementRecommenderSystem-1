import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import logo from './assets/WEA_logo_bgremoved.png'

const link = document.querySelector("link[rel~='icon']") || document.createElement('link')
link.type = 'image/png'
link.rel = 'icon'
link.href = logo
document.getElementsByTagName('head')[0].appendChild(link)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
