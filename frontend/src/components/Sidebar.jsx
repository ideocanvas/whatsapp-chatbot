import React from 'react'
import { useApiMutation } from '../hooks/useApi'

const Sidebar = ({ mobileMenuOpen, activeTab, setActiveTab, setMobileMenuOpen, status, showToast, onLogout }) => {
  const navItems = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'chat', label: 'Live Chat', icon: '💬' },
    { id: 'memory', label: 'Memory', icon: '🧠' },
    { id: 'news', label: 'News System', icon: '📰' },
    { id: 'favorites', label: 'Favorites', icon: '⭐' },
  ]

  const { mutate: triggerNewsBrowsing, loading: newsLoading } = useApiMutation('/api/browse/news')
  const { mutate: triggerFavoritesBrowsing, loading: favoritesLoading } = useApiMutation('/api/browse/favorites')

  const handleTriggerNewsBrowsing = async () => {
    try {
      await triggerNewsBrowsing({ intent: 'general', bypassLimit: true })
      showToast('News browsing triggered successfully', 'success')
    } catch (error) {
      showToast('Failed to trigger news browsing', 'error')
    }
  }

  const handleTriggerFavoritesBrowsing = async () => {
    try {
      await triggerFavoritesBrowsing({ intent: 'general', bypassLimit: true })
      showToast('Favorite websites browsing triggered successfully', 'success')
    } catch (error) {
      showToast('Failed to trigger favorite websites browsing', 'error')
    }
  }


  const logout = () => {
    if (onLogout) {
      onLogout()
    } else {
      // Fallback for backward compatibility
      fetch('/api/logout', {
        method: 'POST',
        credentials: 'include',
      }).then(() => {
        window.location.reload()
      })
    }
  }

  return (
    <aside
      className={`w-64 bg-white border-r border-gray-200 flex flex-col shadow-sm z-10 transition-all duration-300 h-full ${
        mobileMenuOpen ? 'translate-x-0 absolute' : '-translate-x-full md:translate-x-0 md:relative'
      }`}
    >
      {/* Bot Header */}
      <div className="p-5 border-b border-gray-100 flex items-center space-x-3 bg-wa-panel">
        <div className="w-10 h-10 rounded-full bg-wa-teal flex items-center justify-center text-white font-bold text-lg shadow-sm">
          🤖
        </div>
        <div>
          <h1 className="font-bold text-gray-800 tracking-tight">Auto Agent</h1>
          <div className="flex items-center space-x-1.5">
            <span className={`w-2 h-2 rounded-full ${
              status?.agent ? 'bg-green-500 animate-pulse' : 'bg-red-500'
            }`}></span>
            <span className="text-xs text-gray-500 font-medium">
              {status?.agent ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              setActiveTab(item.id)
              setMobileMenuOpen(false)
            }}
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

      {/* Bottom Actions */}
      <div className="p-4 border-t border-gray-100 bg-gray-50 space-y-2">
        <button
          onClick={handleTriggerNewsBrowsing}
          disabled={newsLoading}
          className="w-full flex items-center justify-center space-x-2 bg-white border border-gray-200 hover:border-wa-teal hover:text-wa-teal text-gray-600 py-2 rounded-md text-sm font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span>📰</span> <span>{newsLoading ? 'Browsing...' : 'Browse News'}</span>
        </button>
        <button
          onClick={handleTriggerFavoritesBrowsing}
          disabled={favoritesLoading}
          className="w-full flex items-center justify-center space-x-2 bg-white border border-gray-200 hover:border-wa-teal hover:text-wa-teal text-gray-600 py-2 rounded-md text-sm font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span>⭐</span> <span>{favoritesLoading ? 'Browsing...' : 'Browse Favorites'}</span>
        </button>
        <button
          onClick={logout}
          className="w-full flex items-center justify-center space-x-2 text-red-500 hover:bg-red-50 py-2 rounded-md text-sm font-medium transition-colors"
        >
          <span>🚪</span> <span>Logout</span>
        </button>
      </div>
    </aside>
  )
}

export default Sidebar