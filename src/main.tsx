import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { loadSigningRequest } from './lib/tab-session'
import './index.css'

// Once, before the first render: this also removes the link from the address bar.
const request = loadSigningRequest()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App request={request} />
  </React.StrictMode>,
)
