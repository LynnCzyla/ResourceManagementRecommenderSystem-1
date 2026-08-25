// src/main.jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import ClientFeedbackPage from './frontend/Feedback/ClientFeedbackPage.jsx'
import logo from './assets/WEA_logo_bgremoved.png'

const link = document.querySelector("link[rel~='icon']") || document.createElement('link')
link.type = 'image/png'
link.rel = 'icon'
link.href = logo
document.getElementsByTagName('head')[0].appendChild(link)

createRoot(document.getElementById('root')).render(
  //<StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/feedback/:token" element={<ClientFeedbackPage />} />
        <Route path="/*" element={<App />} />
      </Routes>
    </BrowserRouter>
  //</StrictMode>,
)