import React from 'react'

const OverviewTab = ({ status, activities, showToast }) => {
  const refreshAll = async () => {
    try {
      // This will trigger re-fetching of data via the useApi hooks
      showToast('Refreshing data...', 'success')
      // Force a window reload to refresh all data
      window.location.reload()
    } catch (error) {
      showToast('Error refreshing data', 'error')
    }
  }

  const getLogIcon = (type) => {
    switch (type) {
      case 'ai_response': return '🤖'
      case 'tool_call': return '🛠️'
      case 'search': return '🔍'
      case 'error': return '❌'
      default: return '📝'
    }
  }

  return (
    <div className="p-6 overflow-y-auto h-full space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">System Overview</h2>
        <button
          onClick={refreshAll}
          className="p-2 hover:bg-white rounded-full transition-colors"
          title="Refresh"
        >
          🔄
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Active Users</p>
              <h3 className="text-3xl font-bold text-gray-800 mt-1">
                {status?.memory?.context?.activeUsers || 0}
              </h3>
            </div>
            <div className="p-2 bg-blue-50 text-blue-500 rounded-lg">👥</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Learned Facts</p>
              <h3 className="text-3xl font-bold text-gray-800 mt-1">
                {status?.memory?.knowledge?.totalDocuments || 0}
              </h3>
            </div>
            <div className="p-2 bg-purple-50 text-purple-500 rounded-lg">🧠</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Bot Cycles</p>
              <h3 className="text-3xl font-bold text-gray-800 mt-1">
                {status?.scheduler?.tickCount || 0}
              </h3>
            </div>
            <div className="p-2 bg-orange-50 text-orange-500 rounded-lg">⚡</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Pages Surfed</p>
              <h3 className="text-3xl font-bold text-gray-800 mt-1">
                {status?.browser?.totalPagesVisited || 0}
              </h3>
            </div>
            <div className="p-2 bg-green-50 text-green-500 rounded-lg">🌍</div>
          </div>
        </div>
      </div>

      {/* Recent Activity Feed */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <h3 className="font-semibold text-gray-700">Live Activity Feed</h3>
          <div className="flex items-center space-x-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
            </span>
            <span className="text-xs text-gray-500">Live</span>
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto font-mono text-sm bg-gray-900 text-gray-300 p-4 space-y-2">
          {activities && activities.length > 0 ? (
            [...activities].slice(-20).reverse().map((log, index) => (
              <div key={index} className="flex space-x-3 hover:bg-gray-800 p-1 rounded">
                <span className="text-gray-500 whitespace-nowrap">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className={
                  log.type === 'ai_response' ? 'text-blue-400' :
                  log.type === 'tool_call' ? 'text-yellow-400' :
                  log.type === 'search' ? 'text-green-400' :
                  log.type === 'error' ? 'text-red-400' : 'text-gray-400'
                }>
                  <span>{getLogIcon(log.type)} </span>
                  <span>{log.message}</span>
                </span>
              </div>
            ))
          ) : (
            <div className="text-gray-600 italic">Waiting for system activity...</div>
          )}
        </div>
      </div>
    </div>
  )
}

export default OverviewTab