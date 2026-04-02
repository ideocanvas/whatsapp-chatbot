import React, { useState, useEffect } from 'react'
import { useApi } from '../../hooks/useApi'
import { useApiMutation } from '../../hooks/useApi'

const ReminderTab = ({ showToast }) => {
  const [reminders, setReminders] = useState([])
  const [filter, setFilter] = useState('all') // all, upcoming, active, paused
  const [showModal, setShowModal] = useState(false)
  const [editingReminder, setEditingReminder] = useState(null)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    scheduledAt: '',
    recurrence: 'none'
  })

  const { data: remindersData, loading, error, refetch } = useApi('/api/reminders')
  const { mutate: createReminder, loading: creating } = useApiMutation('/api/reminders')
  const { mutate: updateReminder, loading: updating } = useApiMutation('/api/reminders')
  const { mutate: deleteReminder } = useApiMutation('/api/reminders')

  useEffect(() => {
    if (remindersData?.reminders) {
      setReminders(remindersData.reminders)
    }
  }, [remindersData])

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!formData.title || !formData.scheduledAt) {
      showToast('Please fill in all required fields', 'error')
      return
    }

    try {
      if (editingReminder) {
        await updateReminder(formData, `/api/reminders/${editingReminder.id}`, 'PUT')
        showToast('Reminder updated', 'success')
      } else {
        await createReminder(formData, '/api/reminders', 'POST')
        showToast('Reminder created', 'success')
      }
      setShowModal(false)
      setEditingReminder(null)
      setFormData({ title: '', description: '', scheduledAt: '', recurrence: 'none' })
      refetch()
    } catch (err) {
      showToast(err.message || 'Failed to save reminder', 'error')
    }
  }

  const handleEdit = (reminder) => {
    setEditingReminder(reminder)
    setFormData({
      title: reminder.title,
      description: reminder.description || '',
      scheduledAt: new Date(reminder.scheduledAt).toISOString().slice(0, 16),
      recurrence: reminder.recurrence
    })
    setShowModal(true)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this reminder?')) return
    
    try {
      await deleteReminder({}, `/api/reminders/${id}`, 'DELETE')
      showToast('Reminder deleted', 'success')
      refetch()
    } catch (err) {
      showToast('Failed to delete reminder', 'error')
    }
  }

  const handlePause = async (id) => {
    try {
      await updateReminder({}, `/api/reminders/${id}/pause`, 'POST')
      showToast('Reminder paused', 'success')
      refetch()
    } catch (err) {
      showToast('Failed to pause reminder', 'error')
    }
  }

  const handleResume = async (id) => {
    try {
      await updateReminder({}, `/api/reminders/${id}/resume`, 'POST')
      showToast('Reminder resumed', 'success')
      refetch()
    } catch (err) {
      showToast('Failed to resume reminder', 'error')
    }
  }

  const filteredReminders = reminders.filter(reminder => {
    if (filter === 'all') return true
    if (filter === 'upcoming') return reminder.status === 'pending'
    if (filter === 'active') return reminder.status === 'active'
    if (filter === 'paused') return reminder.status === 'paused'
    return true
  })

  const getStatusBadge = (status) => {
    const badges = {
      pending: { color: 'bg-yellow-100 text-yellow-800', text: 'Pending' },
      sent: { color: 'bg-green-100 text-green-800', text: 'Sent' },
      active: { color: 'bg-blue-100 text-blue-800', text: 'Active' },
      paused: { color: 'bg-gray-100 text-gray-800', text: 'Paused' },
      cancelled: { color: 'bg-red-100 text-red-800', text: 'Cancelled' }
    }
    const badge = badges[status] || badges.pending
    return <span className={`px-2 py-1 rounded-full text-xs ${badge.color}`}>{badge.text}</span>
  }

  const getRecurrenceBadge = (recurrence) => {
    if (recurrence === 'none') return null
    const labels = {
      daily: 'Daily',
      weekly: 'Weekly',
      monthly: 'Monthly',
      custom: 'Custom'
    }
    return <span className="px-2 py-1 rounded-full text-xs bg-purple-100 text-purple-800">{labels[recurrence]}</span>
  }

  const formatDateTime = (dateStr) => {
    return new Date(dateStr).toLocaleString()
  }

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
        <h2 className="text-2xl font-bold text-gray-800">Reminders</h2>
        <button
          onClick={() => {
            setEditingReminder(null)
            setFormData({ title: '', description: '', scheduledAt: '', recurrence: 'none' })
            setShowModal(true)
          }}
          className="bg-wa-teal text-white px-4 py-2 rounded-lg hover:bg-opacity-90 transition-colors"
        >
          + New Reminder
        </button>
      </div>

      {/* Filters */}
      <div className="flex space-x-2">
        {['all', 'upcoming', 'active', 'paused'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg capitalize ${
              filter === f
                ? 'bg-wa-teal text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Reminders List */}
      {filteredReminders.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <span className="text-4xl">⏰</span>
          <p className="text-gray-500 mt-2">No reminders found</p>
          <button
            onClick={() => setShowModal(true)}
            className="text-wa-teal hover:underline mt-2"
          >
            Create your first reminder
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredReminders.map((reminder) => (
            <div
              key={reminder.id}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <h3 className="font-semibold text-gray-800">{reminder.title}</h3>
                    {getStatusBadge(reminder.status)}
                    {getRecurrenceBadge(reminder.recurrence)}
                  </div>
                  {reminder.description && (
                    <p className="text-gray-600 text-sm mb-2">{reminder.description}</p>
                  )}
                  <div className="flex items-center text-sm text-gray-500 space-x-4">
                    <span>⏰ {formatDateTime(reminder.scheduledAt)}</span>
                    {reminder.recurrence !== 'none' && reminder.nextSendAt && (
                      <span>Next: {formatDateTime(reminder.nextSendAt)}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {reminder.status === 'active' && (
                    <button
                      onClick={() => handlePause(reminder.id)}
                      className="text-gray-500 hover:text-gray-700 px-2 py-1"
                      title="Pause"
                    >
                      ⏸️
                    </button>
                  )}
                  {reminder.status === 'paused' && (
                    <button
                      onClick={() => handleResume(reminder.id)}
                      className="text-gray-500 hover:text-gray-700 px-2 py-1"
                      title="Resume"
                    >
                      ▶️
                    </button>
                  )}
                  <button
                    onClick={() => handleEdit(reminder)}
                    className="text-gray-500 hover:text-gray-700 px-2 py-1"
                    title="Edit"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDelete(reminder.id)}
                    className="text-gray-500 hover:text-red-600 px-2 py-1"
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
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">
              {editingReminder ? 'Edit Reminder' : 'New Reminder'}
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
                  placeholder="Enter reminder title"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-wa-teal focus:border-transparent"
                  placeholder="Optional description"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date & Time *
                </label>
                <input
                  type="datetime-local"
                  value={formData.scheduledAt}
                  onChange={(e) => setFormData({ ...formData, scheduledAt: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-wa-teal focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Recurrence
                </label>
                <select
                  value={formData.recurrence}
                  onChange={(e) => setFormData({ ...formData, recurrence: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-wa-teal focus:border-transparent"
                >
                  <option value="none">One-time</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false)
                    setEditingReminder(null)
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

export default ReminderTab