import React from 'react'
import OverviewTab from './tabs/OverviewTab'
import ChatTab from './tabs/ChatTab'
import MemoryTab from './tabs/MemoryTab'
import NewsTab from './tabs/NewsTab'
import FavoritesTab from './tabs/FavoritesTab'

const MainContent = ({
  mobileMenuOpen,
  setMobileMenuOpen,
  activeTab,
  notification,
  botInfo,
  status,
  activities,
  showToast,
  getTabTitle
}) => {
  return (
    <main className="flex-1 flex flex-col min-w-0 bg-wa-panel relative h-full">
      {/* Mobile Header */}
      <header className="md:hidden bg-wa-teal text-white p-4 flex items-center justify-between shadow-md">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="focus:outline-none"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="font-bold">{getTabTitle()}</span>
        </div>
        <div className={`w-2 h-2 rounded-full ${status?.agent ? 'bg-white' : 'bg-red-400'}`}></div>
      </header>

      {/* Toast Notification */}
      {notification.show && (
        <div className="absolute top-4 right-4 z-50 transform transition-all duration-300 translate-y-0 opacity-100">
          <div className={`text-white px-6 py-3 rounded-lg shadow-lg flex items-center space-x-3 ${
            notification.type === 'error' ? 'bg-red-500' : 'bg-gray-800'
          }`}>
            <span>{notification.type === 'success' ? '✅' : '⚠️'}</span>
            <span className="font-medium text-sm">{notification.message}</span>
          </div>
        </div>
      )}

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <OverviewTab status={status} activities={activities} showToast={showToast} />
      )}

      {activeTab === 'chat' && (
        <ChatTab botInfo={botInfo} showToast={showToast} />
      )}

      {activeTab === 'memory' && (
        <MemoryTab showToast={showToast} />
      )}

      {activeTab === 'news' && (
        <NewsTab showToast={showToast} />
      )}

      {activeTab === 'favorites' && (
        <FavoritesTab showToast={showToast} />
      )}
    </main>
  )
}

export default MainContent