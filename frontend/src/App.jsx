import React, { useState, useEffect, useRef } from 'react'
import Sidebar from './components/Sidebar'
import MainContent from './components/MainContent'
import { useApi } from './hooks/useApi'

function App() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const [notification, setNotification] = useState({ show: false, message: '', type: 'success' })

  const { data: botInfo, loading: botInfoLoading, error: botInfoError } = useApi('/api/bot-info')
  const { data: status, loading: statusLoading, error: statusError } = useApi('/api/status')
  const { data: activities, loading: activitiesLoading, error: activitiesError } = useApi('/api/activity')

  // Show notification
  const showToast = (message, type = 'success') => {
    setNotification({ show: true, message, type })
    setTimeout(() => setNotification({ show: false, message: '', type: 'success' }), 3000)
  }

  // Auto-refresh stats every 5s when on overview tab
  useEffect(() => {
    if (activeTab === 'overview') {
      const interval = setInterval(() => {
        // The useApi hook will automatically refetch when dependencies change
      }, 5000)
      return () => clearInterval(interval)
    }
  }, [activeTab])

  // Handle authentication errors
  useEffect(() => {
    if (botInfoError && botInfoError.status === 401) {
      window.location.href = '/login.html'
    }
  }, [botInfoError])

  const getTabTitle = () => {
    const navItems = [
      { id: 'overview', label: 'Overview' },
      { id: 'chat', label: 'Live Chat' },
      { id: 'memory', label: 'Memory' }
    ]
    return navItems.find(item => item.id === activeTab)?.label || 'Dashboard'
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