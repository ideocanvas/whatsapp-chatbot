import React, { useState, useEffect } from 'react'
import { useApi } from '../../hooks/useApi'

const MemoryTab = ({ showToast }) => {
  const [memoryType, setMemoryType] = useState('context')
  const [searchQuery, setSearchQuery] = useState('')

  const { data: memoryData, loading: memoryLoading, error: memoryError } = useApi(`/api/memory/${memoryType}`)

  const searchKnowledge = async () => {
    if (!searchQuery.trim()) return

    try {
      const response = await fetch(`/api/memory/search?q=${encodeURIComponent(searchQuery)}`, {
        credentials: 'include'
      })

      if (response.ok) {
        const data = await response.json()
        // Handle search results - for now we'll just show a toast
        showToast(`Found ${data.length || 0} results for "${searchQuery}"`, 'success')
      } else {
        showToast('Search failed', 'error')
      }
    } catch (error) {
      showToast('Error performing search', 'error')
    }
  }

  const truncate = (text, length) => {
    if (!text) return ''
    return text.length > length ? text.substring(0, length) + '...' : text
  }

  const timeAgo = (timestamp) => {
    if (!timestamp) return ''

    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  useEffect(() => {
    if (memoryError) {
      showToast('Failed to load memory data', 'error')
    }
  }, [memoryError, showToast])

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Memory Banks</h2>
        <div className="bg-white rounded-lg border p-1 flex">
          <button
            onClick={() => setMemoryType('context')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              memoryType === 'context' ? 'bg-wa-teal text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            Context
          </button>
          <button
            onClick={() => setMemoryType('knowledge')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              memoryType === 'knowledge' ? 'bg-wa-teal text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            Knowledge
          </button>
        </div>
      </div>

      {memoryType === 'knowledge' && (
        <div className="mb-4 flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && searchKnowledge()}
            placeholder="Search stored knowledge..."
            className="flex-1 border-gray-300 rounded-lg shadow-sm focus:border-wa-teal focus:ring-wa-teal px-4 py-2"
          />
          <button
            onClick={searchKnowledge}
            className="bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-700"
          >
            Search
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto bg-white rounded-xl shadow-sm border border-gray-100 p-0">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source/ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Content</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {memoryLoading ? (
              <tr>
                <td colSpan="3" className="px-6 py-10 text-center text-gray-500">
                  Loading memory data...
                </td>
              </tr>
            ) : memoryData && memoryData.length > 0 ? (
              memoryData.map((item, index) => (
                <tr key={index} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {truncate(item.title || item.source || item.id, 20)}
                    </div>
                    <div className="text-xs text-wa-teal">
                      {item.category || 'General'}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-500 max-h-20 overflow-y-auto">
                      {item.content || item.message}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                    <div>{timeAgo(item.timestamp)}</div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="3" className="px-6 py-10 text-center text-gray-500 italic">
                  No memory items found. Try a search or trigger browsing.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default MemoryTab