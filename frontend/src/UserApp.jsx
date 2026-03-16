import React, { useState, useEffect } from 'react'
import OTPLoginScreen from './components/OTPLoginScreen'
import ReminderTab from './components/tabs/ReminderTab'
import NoteTab from './components/tabs/NoteTab'
import ExpenseTab from './components/tabs/ExpenseTab'

const UserApp = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(null) // null = checking, true = authenticated, false = not authenticated
  const [user, setUser] = useState(null)
  const [activeTab, setActiveTab] = useState('reminders')
  const [notification, setNotification] = useState({ show: false, message: '', type: 'success' })

  // Show notification
  const showToast = (message, type = 'success') => {
    setNotification({ show: true, message, type })
    setTimeout(() => setNotification({ show: false, message: '', type: 'success' }), 3000)
  }

  // Check authentication status on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/user/auth/status', {
          credentials: 'include'
        })
        const data = await response.json()
        
        if (data.authenticated) {
          setIsAuthenticated(true)
          setUser({ phoneNumber: data.phoneNumber })
        } else {
          setIsAuthenticated(false)
        }
      } catch (error) {
        setIsAuthenticated(false)
      }
    }
    
    checkAuth()
  }, [])

  // Handle login
  const handleLogin = (userData) => {
    setIsAuthenticated(true)
    setUser(userData)
    showToast('Login successful', 'success')
  }

  // Handle logout
  const handleLogout = async () => {
    try {
      await fetch('/api/user/logout', {
        method: 'POST',
        credentials: 'include'
      })
      setIsAuthenticated(false)
      setUser(null)
      showToast('Logged out successfully', 'success')
    } catch (error) {
      showToast('Logout error', 'error')
    }
  }

  // Show loading while checking authentication
  if (isAuthenticated === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-wa-teal mx-auto"></div>
          <p className="mt-4 text-gray-600">Checking authentication...</p>
        </div>
      </div>
    )
  }

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return <OTPLoginScreen onLogin={handleLogin} showToast={showToast} />
  }

  const navItems = [
    { id: 'reminders', label: 'Reminders', icon: '⏰' },
    { id: 'notes', label: 'Notes', icon: '📝' },
    { id: 'expenses', label: 'Expenses', icon: '💰' }
  ]

  const renderContent = () => {
    switch (activeTab) {
      case 'reminders':
        return <ReminderTab showToast={showToast} />
      case 'notes':
        return <NoteTab showToast={showToast} />
      case 'expenses':
        return <ExpenseTab showToast={showToast} />
      default:
        return <ReminderTab showToast={showToast} />
    }
  }

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col shadow-sm">
        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex items-center space-x-3 bg-wa-panel">
          <div className="w-10 h-10 rounded-full bg-wa-teal flex items-center justify-center text-white font-bold text-lg shadow-sm">
            📱
          </div>
          <div>
            <h1 className="font-bold text-gray-800 tracking-tight">My Apps</h1>
            <div className="flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              <span className="text-xs text-gray-500 font-medium">
                {user?.phoneNumber}
              </span>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 group ${
                activeTab === item.id
                  ? 'bg-green-50 text-wa-teal font-semibold'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span className="text-xl group-hover:scale-110 transition-transform">
                {item.icon}
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-gray-100 bg-gray-50">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center space-x-2 text-red-500 hover:bg-red-50 py-2 rounded-md text-sm font-medium transition-colors"
          >
            <span>🚪</span>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6">
          {/* Notification */}
          {notification.show && (
            <div
              className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg ${
                notification.type === 'success' ? 'bg-green-500' : 'bg-red-500'
              } text-white`}
            >
              {notification.message}
            </div>
          )}

          {/* Tab Title */}
          <h1 className="text-2xl font-bold text-gray-800 mb-6">
            {navItems.find(item => item.id === activeTab)?.label}
          </h1>

          {/* Tab Content */}
          {renderContent()}
        </div>
      </main>
    </div>
  )
}

export default UserApp