import React, { useState, useEffect } from 'react'
import { useApi } from '../../hooks/useApi'
import Select from '../Select'
import ConfirmDialog from '../ConfirmDialog'

const FavoritesTab = ({ showToast }) => {
  const { data: favorites, loading: favoritesLoading, error: favoritesError, refetch: refetchFavorites } = useApi('/api/favorites')
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [favoriteToDelete, setFavoriteToDelete] = useState(null)
  const [newFavorite, setNewFavorite] = useState({
    url: '',
    title: '',
    category: 'general',
    source: 'manual'
  })

  const categoryOptions = [
    { value: 'general', label: 'General' },
    { value: 'tech', label: 'Technology' },
    { value: 'world', label: 'World News' },
    { value: 'business', label: 'Business' },
    { value: 'science', label: 'Science' },
    { value: 'entertainment', label: 'Entertainment' },
    { value: 'sports', label: 'Sports' },
    { value: 'health', label: 'Health' }
  ]

  const requestRemoveFavorite = (url) => {
    setFavoriteToDelete(url)
    setShowConfirmDialog(true)
  }

  const removeFavorite = async () => {
    if (!favoriteToDelete) return

    try {
      const response = await fetch('/api/favorites', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ url: favoriteToDelete })
      })

      if (response.ok) {
        showToast('Removed from favorites', 'success')
        refetchFavorites()
      } else {
        const data = await response.json()
        showToast(data.error || 'Failed to remove favorite', 'error')
      }
    } catch (error) {
      showToast('Error removing favorite', 'error')
    } finally {
      setShowConfirmDialog(false)
      setFavoriteToDelete(null)
    }
  }

  const addFavorite = async () => {
    if (!newFavorite.url.trim()) {
      showToast('URL is required', 'error')
      return
    }

    try {
      const response = await fetch('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(newFavorite)
      })

      if (response.ok) {
        showToast('Added to favorites', 'success')
        setShowAddModal(false)
        setNewFavorite({
          url: '',
          title: '',
          category: 'general',
          source: 'manual'
        })
        refetchFavorites()
      } else {
        const data = await response.json()
        showToast(data.error || 'Failed to add favorite', 'error')
      }
    } catch (error) {
      showToast('Error adding favorite', 'error')
    }
  }

  const visitFavorite = async (favorite) => {
    try {
      // Update visit count
      await fetch('/api/favorites/visit', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ url: favorite.url })
      })

      // Open the URL in a new tab
      window.open(favorite.url, '_blank')
      refetchFavorites()
    } catch (error) {
      showToast('Error visiting favorite', 'error')
    }
  }

  const filteredFavorites = favorites?.filter(favorite => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      favorite.url.toLowerCase().includes(query) ||
      (favorite.title && favorite.title.toLowerCase().includes(query)) ||
      (favorite.category && favorite.category.toLowerCase().includes(query)) ||
      (favorite.source && favorite.source.toLowerCase().includes(query))
    )
  }) || []

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

  const getCategoryColor = (category) => {
    const colors = {
      tech: 'bg-blue-100 text-blue-800',
      world: 'bg-green-100 text-green-800',
      business: 'bg-purple-100 text-purple-800',
      science: 'bg-orange-100 text-orange-800',
      entertainment: 'bg-pink-100 text-pink-800',
      sports: 'bg-red-100 text-red-800',
      health: 'bg-teal-100 text-teal-800',
      general: 'bg-gray-100 text-gray-800'
    }
    return colors[category] || colors.general
  }

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Favorites</h2>
        <div className="flex items-center space-x-4">
          <div className="text-sm text-gray-500">
            {favorites?.length || 0} saved items
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-wa-teal text-white px-4 py-2 rounded-md hover:bg-green-600 transition-colors"
          >
            Add Favorite
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-6">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search favorites..."
          className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:border-wa-teal focus:ring-wa-teal"
          data-1p-ignore
          autoComplete="off"
        />
      </div>

      {/* Favorites Grid */}
      {favoritesLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wa-teal mx-auto mb-4"></div>
            <p className="text-gray-600">Loading favorites...</p>
          </div>
        </div>
      ) : favoritesError ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-red-500">
            <p>Error loading favorites</p>
            <button
              onClick={refetchFavorites}
              className="mt-2 bg-red-100 text-red-600 px-4 py-2 rounded-md hover:bg-red-200"
            >
              Retry
            </button>
          </div>
        </div>
      ) : filteredFavorites.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-500">
            <div className="text-6xl mb-4">⭐</div>
            <p className="text-lg mb-2">No favorites yet</p>
            <p className="text-sm">Add items from the Memory or News tabs to see them here</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto">
          {filteredFavorites.map((favorite, index) => (
            <div key={index} className="bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow overflow-hidden">
              <div className="p-4">
                <h3 className="font-semibold text-gray-800 line-clamp-2 mb-3">{favorite.title}</h3>

                <div className="mb-3">
                  <a
                    href={favorite.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 text-sm break-all line-clamp-1"
                    onClick={(e) => {
                      e.preventDefault()
                      visitFavorite(favorite)
                    }}
                  >
                    {favorite.url}
                  </a>
                </div>

                <div className="flex flex-wrap gap-2 mb-3">
                  <span className={`px-2 py-1 rounded-full text-xs ${getCategoryColor(favorite.category)}`}>
                    {favorite.category}
                  </span>
                  <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded-full text-xs">
                    {favorite.source}
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs text-gray-500">
                  <div>
                    <span>Visits: {favorite.visitCount || 1}</span>
                    <span className="mx-2">•</span>
                    <span>Last: {timeAgo(favorite.lastVisited)}</span>
                  </div>
                  <span>Added: {timeAgo(favorite.addedAt)}</span>
                </div>

                <div className="mt-3 flex space-x-2">
                  <button
                    onClick={() => visitFavorite(favorite)}
                    className="flex-1 bg-blue-50 text-blue-600 py-1 rounded text-sm hover:bg-blue-100 transition-colors"
                  >
                    Visit
                  </button>
                  <button
                    onClick={() => requestRemoveFavorite(favorite.url)}
                    className="flex-1 bg-red-50 text-red-600 py-1 rounded text-sm hover:bg-red-100 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Favorite Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl font-semibold">Add New Favorite</h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL *</label>
                <input
                  type="url"
                  value={newFavorite.url}
                  onChange={(e) => setNewFavorite({ ...newFavorite, url: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-wa-teal"
                  placeholder="https://example.com"
                  data-1p-ignore
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  value={newFavorite.title}
                  onChange={(e) => setNewFavorite({ ...newFavorite, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-wa-teal"
                  placeholder="Favorite Title (optional)"
                  data-1p-ignore
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <Select
                  value={newFavorite.category}
                  onChange={(value) => setNewFavorite({ ...newFavorite, category: value })}
                  options={categoryOptions}
                  placeholder="Select category"
                />
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end space-x-3">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={addFavorite}
                className="bg-wa-teal text-white px-4 py-2 rounded-md hover:bg-green-600 transition-colors"
              >
                Add Favorite
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog for Delete */}
      <ConfirmDialog
        isOpen={showConfirmDialog}
        onClose={() => {
          setShowConfirmDialog(false)
          setFavoriteToDelete(null)
        }}
        onConfirm={removeFavorite}
        title="Remove Favorite"
        message="Are you sure you want to remove this favorite? This action cannot be undone."
        confirmText="Remove"
        cancelText="Cancel"
        type="danger"
      />
    </div>
  )
}

export default FavoritesTab