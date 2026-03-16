import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import UserApp from './UserApp.jsx'
import './index.css'

// Simple routing based on URL path
// /admin/* -> Admin Dashboard (App.jsx)
// /user/* or / -> User App (UserApp.jsx)
const getAppComponent = () => {
  const path = window.location.pathname
  
  // Admin dashboard routes
  if (path.startsWith('/admin')) {
    return App
  }
  
  // User app routes (default)
  return UserApp
}

const AppComponent = getAppComponent()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppComponent />
  </React.StrictMode>,
)