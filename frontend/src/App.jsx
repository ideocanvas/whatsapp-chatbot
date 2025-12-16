import React, { useState, useEffect, useRef } from 'react'
import Sidebar from './components/Sidebar'
import MainContent from './components/MainContent'
import LoginScreen from './components/LoginScreen'
import { useApi } from './hooks/useApi'

function App() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const [notification, setNotification] = useState({ show: false, message: '', type: 'success' })
  const [isAuthenticated, setIsAuthenticated] = useState(null) // null = checking, true = authenticated, false = not authenticated

  const { data: botInfo, loading: botInfoLoading, error: botInfoError, refetch: refetchBotInfo } = useApi('/api/bot-info')
  const { data: status, loading: statusLoading, error: statusError, refetch: refetchStatus } = useApi('/api/status')
  const { data: activities, loading: activitiesLoading, error: activitiesError, refetch: refetchActivities } = useApi('/api/activity')
  const { data: authStatus, loading: authLoading, error: authError, refetch: refetchAuth } = useApi('/api/auth/status')

  // Show notification
  const showToast = (message, type = 'success') => {
    setNotification({ show: true, message, type })
    setTimeout(() => setNotification({ show: false, message: '', type: 'success' }), 3000)
  }

  // Check authentication status
  useEffect(() => {
    if (authStatus) {
      setIsAuthenticated(authStatus.authenticated)
    }
  }, [authStatus])

  // Handle authentication errors
  useEffect(() => {
    if (botInfoError && botInfoError.status === 401) {
      setIsAuthenticated(false)
    }
  }, [botInfoError])

  // Auto-refresh stats every 5s when on overview tab and authenticated
  useEffect(() => {
    if (activeTab === 'overview' && isAuthenticated) {
      const interval = setInterval(() => {
        refetchStatus()
        refetchActivities()
      }, 5000)
      return () => clearInterval(interval)
    }
  }, [activeTab, isAuthenticated])

  const getTabTitle = () => {
    const navItems = [
      { id: 'overview', label: 'Overview' },
      { id: 'chat', label: 'Live Chat' },
      { id: 'memory', label: 'Memory' }
    ]
    return navItems.find(item => item.id === activeTab)?.label || 'Dashboard'
  }

  // Handle login
  const handleLogin = async (password) => {
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
        credentials: 'include'
      })

      if (response.ok) {
        setIsAuthenticated(true)
        // Refetch all data after successful login
        refetchBotInfo()
        refetchStatus()
        refetchActivities()
        refetchAuth()
        showToast('Login successful', 'success')
      } else {
        const data = await response.json()
        showToast(data.error || 'Login failed', 'error')
      }
    } catch (error) {
      showToast('Connection error', 'error')
    }
  }

  // Handle logout
  const handleLogout = async () => {
    try {
      await fetch('/api/logout', {
        method: 'POST',
        credentials: 'include'
      })
      setIsAuthenticated(false)
      showToast('Logged out successfully', 'success')
    } catch (error) {
      showToast('Logout error', 'error')
    }
  }

  // Show loading while checking authentication
  if (isAuthenticated === null) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-wa-teal mx-auto"></div>
          <p className="mt-4 text-gray-600">Checking authentication...</p>
        </div>
      </div>
    )
  }

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return <LoginScreen onLogin={handleLogin} showToast={showToast} />
  }

  return (
    <div className="flex h-full">
      <Sidebar
        mobileMenuOpen={mobileMenuOpen}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        setMobileMenuOpen={setMobileMenuOpen}
        status={status}
        showToast={showToast}
        onLogout={handleLogout}
      />

      <MainContent
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        activeTab={activeTab}
        notification={notification}
        botInfo={botInfo}
        status={status}
        activities={activities}
        showToast={showToast}
        getTabTitle={getTabTitle}
      />
    </div>
  )
}

export default App