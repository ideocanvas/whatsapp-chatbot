import React, { useState, useEffect } from 'react'
import { useApi } from '../../hooks/useApi'

const KnowledgePopup = ({ item, onClose, isLoading = false }) => {
  if (!item) return null

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-8 flex flex-col items-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wa-teal mb-4"></div>
          <p className="text-gray-600">Loading full content...</p>
        </div>
      </div>
    )
  }

  // Function to detect URLs and make them clickable
  const renderContentWithLinks = (content) => {
    if (!content) return ''

    // Regex to match URLs
    const urlRegex = /(https?:\/\/[^\s]+)/g

    // Split content by URLs and create clickable links
    const parts = content.split(urlRegex)

    return parts.map((part, index) => {
      if (urlRegex.test(part)) {
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 underline break-all"
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        )
      }
      return part
    })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-800">{item.title}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl font-bold"
          >
            ×
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto">
          <div className="mb-4">
            <div className="flex flex-wrap gap-2 mb-4">
              {item.source && (
                <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                  Source: {item.source.startsWith('http') ? (
                    <a
                      href={item.source}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-blue-600"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {item.source}
                    </a>
                  ) : (
                    item.source
                  )}
                </span>
              )}
              {item.category && (
                <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">
                  Category: {item.category}
                </span>
              )}
              {item.timestamp && (
                <span className="bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded">
                  Added: {new Date(item.timestamp).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
            <div className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed font-mono">
              {renderContentWithLinks(item.content)}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

const MemoryTab = ({ showToast }) => {
  const [memoryType, setMemoryType] = useState('context')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedItem, setSelectedItem] = useState(null)
  const [searchResults, setSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [isLoadingFullContent, setIsLoadingFullContent] = useState(false)
  const [favorites, setFavorites] = useState([])

  // Load favorites on component mount
  useEffect(() => {
    const loadFavorites = async () => {
      try {
        const response = await fetch('/api/favorites', {
          credentials: 'include'
        })
        if (response.ok) {
          const data = await response.json()
          setFavorites(data)
        }
      } catch (error) {
        console.error('Error loading favorites:', error)
      }
    }
    loadFavorites()
  }, [])

  const toggleFavorite = async (item) => {
    try {
      const isFavorited = favorites.some(fav => fav.url === (item.source || item.url || item.id))

      if (isFavorited) {
        // Remove from favorites
        const response = await fetch('/api/favorites', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ url: item.source || item.url || item.id })
        })

        if (response.ok) {
          setFavorites(favorites.filter(fav => fav.url !== (item.source || item.url || item.id)))
          showToast('Removed from favorites', 'success')
        } else {
          showToast('Failed to remove favorite', 'error')
        }
      } else {
        // Add to favorites
        const response = await fetch('/api/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            url: item.source || item.url || item.id,
            title: item.title,
            category: item.category || 'knowledge',
            source: 'memory'
          })
        })

        if (response.ok) {
          const data = await response.json()
          setFavorites([...favorites, data.favorite])
          showToast('Added to favorites', 'success')
        } else {
          const data = await response.json()
          showToast(data.error || 'Failed to add favorite', 'error')
        }
      }
    } catch (error) {
      showToast('Error toggling favorite', 'error')
    }
  }

  const isFavorited = (item) => {
    return favorites.some(fav => fav.url === (item.source || item.url || item.id))
  }

  const { data: memoryData, loading: memoryLoading, error: memoryError } = useApi(
    memoryType === 'knowledge' ? `/api/memory/search` : `/api/memory/${memoryType}`
  )

  const searchKnowledge = async () => {
    if (!searchQuery.trim()) {
      showToast('Please enter a search query', 'warning')
      return
    }

    setIsSearching(true)
    try {
      const response = await fetch(`/api/memory/search?q=${encodeURIComponent(searchQuery)}`, {
        credentials: 'include'
      })

      if (response.ok) {
        const data = await response.json()
        setSearchResults(data)
        showToast(`Found ${data.length || 0} results for "${searchQuery}"`, 'success')
      } else {
        showToast('Search failed', 'error')
        setSearchResults([])
      }
    } catch (error) {
      showToast('Error performing search', 'error')
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }

  const clearSearch = () => {
    setSearchQuery('')
    setSearchResults([])
  }

  const handleItemClick = async (item) => {
    // For search results and knowledge items, fetch full content if needed
    if (item.content && item.content.endsWith('...')) {
      // Content is truncated, fetch full content
      setIsLoadingFullContent(true)
      setSelectedItem(item) // Show truncated item immediately while loading

      try {
        const response = await fetch(`/api/memory/knowledge/${item.id}`, {
          credentials: 'include'
        })

        if (response.ok) {
          const fullItem = await response.json()
          setSelectedItem(fullItem)
        } else {
          // If fetch fails, keep the truncated item
          showToast('Failed to load full content', 'error')
        }
      } catch (error) {
        // If error, keep the truncated item
        showToast('Error loading full content', 'error')
      } finally {
        setIsLoadingFullContent(false)
      }
    } else {
      // Content is already full, show directly
      setSelectedItem(item)
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

  // Clear search results when switching memory types
  useEffect(() => {
    if (memoryType !== 'knowledge') {
      setSearchResults([])
      setSearchQuery('')
    }
  }, [memoryType])

  return (
    <>
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
              disabled={isSearching}
              className="bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isSearching ? 'Searching...' : 'Search'}
            </button>
            {searchResults.length > 0 && (
              <button
                onClick={clearSearch}
                className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300"
              >
                Clear
              </button>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto bg-white rounded-xl shadow-sm border border-gray-100 p-0">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source/ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Content</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {isSearching ? (
                <tr>
                  <td colSpan="4" className="px-6 py-10 text-center text-gray-500">
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-wa-teal mr-3"></div>
                      Searching knowledge base...
                    </div>
                  </td>
                </tr>
              ) : searchResults.length > 0 ? (
                searchResults.map((item, index) => (
                  <tr
                    key={index}
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => handleItemClick(item)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {truncate(item.title || item.source || item.id, 20)}
                      </div>
                      <div className="text-xs text-wa-teal">
                        {item.category || 'General'}
                      </div>
                      {item.relevance && (
                        <div className={`text-xs mt-1 px-1 py-0.5 rounded ${
                          item.relevance === 'High' ? 'bg-green-100 text-green-800' :
                          item.relevance === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {item.relevance} relevance
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-500 max-h-20 overflow-y-auto">
                        {item.content || item.message}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                      <div>{timeAgo(item.timestamp)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleFavorite(item)
                        }}
                        className={`p-2 rounded-full transition-colors ${
                          isFavorited(item)
                            ? 'bg-yellow-100 text-yellow-600 hover:bg-yellow-200'
                            : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                        }`}
                        title={isFavorited(item) ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        {isFavorited(item) ? '⭐' : '☆'}
                      </button>
                    </td>
                  </tr>
                ))
              ) : memoryLoading ? (
                <tr>
                  <td colSpan="3" className="px-6 py-10 text-center text-gray-500">
                    Loading memory data...
                  </td>
                </tr>
              ) : memoryData && memoryData.length > 0 ? (
                memoryData.map((item, index) => (
                  <tr
                    key={index}
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => memoryType === 'knowledge' && handleItemClick(item)}
                  >
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
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleFavorite(item)
                        }}
                        className={`p-2 rounded-full transition-colors ${
                          isFavorited(item)
                            ? 'bg-yellow-100 text-yellow-600 hover:bg-yellow-200'
                            : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                        }`}
                        title={isFavorited(item) ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        {isFavorited(item) ? '⭐' : '☆'}
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4" className="px-6 py-10 text-center text-gray-500 italic">
                    No memory items found. Try a search or trigger browsing.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Knowledge Popup */}
      {selectedItem && (
        <KnowledgePopup
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          isLoading={isLoadingFullContent}
        />
      )}
    </>
  )
}

export default MemoryTab