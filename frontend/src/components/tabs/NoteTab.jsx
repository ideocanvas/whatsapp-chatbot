import React, { useState, useEffect } from 'react'
import { useApi } from '../hooks/useApi'
import { useApiMutation } from '../hooks/useApi'

const NoteTab = ({ showToast }) => {
  const [notes, setNotes] = useState([])
  const [categories, setCategories] = useState([])
  const [tags, setTags] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingNote, setEditingNote] = useState(null)
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    category: '',
    tags: ''
  })

  const { data: notesData, loading, error, refetch } = useApi('/api/notes')
  const { data: categoriesData } = useApi('/api/notes/categories')
  const { data: tagsData } = useApi('/api/notes/tags')
  const { mutate: createNote, loading: creating } = useApiMutation('/api/notes')
  const { mutate: updateNote, loading: updating } = useApiMutation('/api/notes')
  const { mutate: deleteNote } = useApiMutation('/api/notes')

  useEffect(() => {
    if (notesData?.notes) {
      setNotes(notesData.notes)
    }
  }, [notesData])

  useEffect(() => {
    if (categoriesData?.categories) {
      setCategories(categoriesData.categories)
    }
  }, [categoriesData])

  useEffect(() => {
    if (tagsData?.tags) {
      setTags(tagsData.tags)
    }
  }, [tagsData])

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!formData.title || !formData.content) {
      showToast('Please fill in title and content', 'error')
      return
    }

    const noteData = {
      title: formData.title,
      content: formData.content,
      category: formData.category || null,
      tags: formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(Boolean) : []
    }

    try {
      if (editingNote) {
        await updateNote(noteData, `/api/notes/${editingNote.id}`, 'PUT')
        showToast('Note updated', 'success')
      } else {
        await createNote(noteData, '/api/notes', 'POST')
        showToast('Note created', 'success')
      }
      setShowModal(false)
      setEditingNote(null)
      setFormData({ title: '', content: '', category: '', tags: '' })
      refetch()
    } catch (err) {
      showToast(err.message || 'Failed to save note', 'error')
    }
  }

  const handleEdit = (note) => {
    setEditingNote(note)
    setFormData({
      title: note.title,
      content: note.content,
      category: note.category || '',
      tags: note.tags ? note.tags.join(', ') : ''
    })
    setShowModal(true)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this note?')) return
    
    try {
      await deleteNote({}, `/api/notes/${id}`, 'DELETE')
      showToast('Note deleted', 'success')
      refetch()
    } catch (err) {
      showToast('Failed to delete note', 'error')
    }
  }

  const handleTogglePin = async (id) => {
    try {
      await updateNote({}, `/api/notes/${id}/pin`, 'POST')
      refetch()
    } catch (err) {
      showToast('Failed to toggle pin', 'error')
    }
  }

  const filteredNotes = notes.filter(note => {
    const matchesSearch = !searchQuery || 
      note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.content.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = !selectedCategory || note.category === selectedCategory
    return matchesSearch && matchesCategory
  })

  // Sort: pinned first, then by date
  const sortedNotes = [...filteredNotes].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return b.isPinned ? 1 : -1
    return new Date(b.updatedAt) - new Date(a.updatedAt)
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wa-teal"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">Notes</h2>
        <button
          onClick={() => {
            setEditingNote(null)
            setFormData({ title: '', content: '', category: '', tags: '' })
            setShowModal(true)
          }}
          className="bg-wa-teal text-white px-4 py-2 rounded-lg hover:bg-opacity-90 transition-colors"
        >
          + New Note
        </button>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search notes..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-wa-teal focus:border-transparent"
          />
        </div>
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-wa-teal focus:border-transparent"
        >
          <option value="">All Categories</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>

      {/* Notes Grid */}
      {sortedNotes.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <span className="text-4xl">📝</span>
          <p className="text-gray-500 mt-2">No notes found</p>
          <button
            onClick={() => setShowModal(true)}
            className="text-wa-teal hover:underline mt-2"
          >
            Create your first note
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedNotes.map((note) => (
            <div
              key={note.id}
              className={`bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow ${
                note.isPinned ? 'ring-2 ring-yellow-400' : ''
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-gray-800 line-clamp-1">{note.title}</h3>
                <button
                  onClick={() => handleTogglePin(note.id)}
                  className={`text-lg ${note.isPinned ? 'text-yellow-500' : 'text-gray-400 hover:text-yellow-500'}`}
                  title={note.isPinned ? 'Unpin' : 'Pin'}
                >
                  📌
                </button>
              </div>
              
              {note.category && (
                <span className="inline-block px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800 mb-2">
                  {note.category}
                </span>
              )}
              
              <p className="text-gray-600 text-sm line-clamp-3 mb-3">{note.content}</p>
              
              {note.tags && note.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {note.tags.slice(0, 3).map(tag => (
                    <span key={tag} className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600">
                      #{tag}
                    </span>
                  ))}
                  {note.tags.length > 3 && (
                    <span className="text-xs text-gray-400">+{note.tags.length - 3}</span>
                  )}
                </div>
              )}
              
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>{new Date(note.updatedAt).toLocaleDateString()}</span>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleEdit(note)}
                    className="text-gray-500 hover:text-gray-700"
                    title="Edit"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDelete(note.id)}
                    className="text-gray-500 hover:text-red-600"
                    title="Delete"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">
              {editingNote ? 'Edit Note' : 'New Note'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-wa-teal focus:border-transparent"
                  placeholder="Enter note title"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Content *
                </label>
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-wa-teal focus:border-transparent"
                  placeholder="Write your note..."
                  rows={6}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category
                </label>
                <input
                  type="text"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-wa-teal focus:border-transparent"
                  placeholder="e.g., Work, Personal, Ideas"
                  list="categories-list"
                />
                <datalist id="categories-list">
                  {categories.map(cat => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tags
                </label>
                <input
                  type="text"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-wa-teal focus:border-transparent"
                  placeholder="Separate tags with commas (e.g., important, todo)"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false)
                    setEditingNote(null)
                  }}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || updating}
                  className="bg-wa-teal text-white px-4 py-2 rounded-lg hover:bg-opacity-90 disabled:opacity-50"
                >
                  {creating || updating ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default NoteTab