import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { bootstrapCmsApiProbe } from './cmsApiProbe.js'

bootstrapCmsApiProbe()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
