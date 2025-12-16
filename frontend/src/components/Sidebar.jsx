import React from 'react'

const Sidebar = ({ mobileMenuOpen, activeTab, setActiveTab, setMobileMenuOpen, status, showToast }) => {
  const navItems = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'chat', label: 'Live Chat', icon: '💬' },
    { id: 'memory', label: 'Memory', icon: '🧠' },
  ]

  const triggerBrowsing = async () => {
    try {
      const response = await fetch('/api/trigger-browse', {
        method: 'POST',
        credentials: 'include',
      })

      if (response.ok) {
        showToast('Browsing triggered successfully', 'success')
      } else {
        showToast('Failed to trigger browsing', 'error')
      }
    } catch (error) {
      showToast('Error triggering browsing', 'error')
    }
  }

  const logout = () => {
    fetch('/api/logout', {
      method: 'POST',
      credentials: 'include',
    }).then(() => {
      window.location.href = '/login.html'
    })
  }

  return (
    <aside
      className={`w-64 bg-white border-r border-gray-200 flex flex-col shadow-sm z-10 transition-all duration-300 ${
        mobileMenuOpen ? 'translate-x-0 absolute h-full' : '-translate-x-full md:translate-x-0 md:relative'
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
          onClick={triggerBrowsing}
          className="w-full flex items-center justify-center space-x-2 bg-white border border-gray-200 hover:border-wa-teal hover:text-wa-teal text-gray-600 py-2 rounded-md text-sm font-medium transition-colors shadow-sm"
        >
          <span>🌐</span> <span>Trigger Browse</span>
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