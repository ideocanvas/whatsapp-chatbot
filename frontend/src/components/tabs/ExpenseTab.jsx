import React, { useState, useEffect } from 'react'
import { useApi } from '../../hooks/useApi'
import { useApiMutation } from '../../hooks/useApi'

const ExpenseTab = ({ showToast }) => {
  const [expenses, setExpenses] = useState([])
  const [summary, setSummary] = useState({ totalIncome: 0, totalExpenses: 0, balance: 0 })
  const [categories, setCategories] = useState([])
  const [filter, setFilter] = useState('all') // all, income, expense
  const [selectedCategory, setSelectedCategory] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingExpense, setEditingExpense] = useState(null)
  const [formData, setFormData] = useState({
    type: 'expense',
    amount: '',
    description: '',
    category: '',
    date: new Date().toISOString().slice(0, 10)
  })

  const { data: expensesData, loading, refetch } = useApi('/api/expenses')
  const { data: summaryData } = useApi('/api/expenses/summary')
  const { data: categoriesData } = useApi('/api/expenses/categories')
  const { mutate: createExpense, loading: creating } = useApiMutation('/api/expenses')
  const { mutate: updateExpense, loading: updating } = useApiMutation('/api/expenses')
  const { mutate: deleteExpense } = useApiMutation('/api/expenses')

  useEffect(() => {
    if (expensesData?.expenses) {
      setExpenses(expensesData.expenses)
    }
  }, [expensesData])

  useEffect(() => {
    if (summaryData?.summary) {
      setSummary(summaryData.summary)
    }
  }, [summaryData])

  useEffect(() => {
    if (categoriesData?.categories) {
      setCategories(categoriesData.categories)
    }
  }, [categoriesData])

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      showToast('Please enter a valid amount', 'error')
      return
    }

    const expenseData = {
      type: formData.type,
      amount: parseFloat(formData.amount),
      description: formData.description || null,
      category: formData.category || null,
      date: new Date(formData.date).toISOString()
    }

    try {
      if (editingExpense) {
        await updateExpense(expenseData, `/api/expenses/${editingExpense.id}`, 'PUT')
        showToast('Transaction updated', 'success')
      } else {
        await createExpense(expenseData, '/api/expenses', 'POST')
        showToast('Transaction recorded', 'success')
      }
      setShowModal(false)
      setEditingExpense(null)
      setFormData({
        type: 'expense',
        amount: '',
        description: '',
        category: '',
        date: new Date().toISOString().slice(0, 10)
      })
      refetch()
    } catch (err) {
      showToast(err.message || 'Failed to save transaction', 'error')
    }
  }

  const handleEdit = (expense) => {
    setEditingExpense(expense)
    setFormData({
      type: expense.type,
      amount: expense.amount.toString(),
      description: expense.description || '',
      category: expense.category || '',
      date: new Date(expense.date).toISOString().slice(0, 10)
    })
    setShowModal(true)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this transaction?')) return
    
    try {
      await deleteExpense({}, `/api/expenses/${id}`, 'DELETE')
      showToast('Transaction deleted', 'success')
      refetch()
    } catch (err) {
      showToast('Failed to delete transaction', 'error')
    }
  }

  const filteredExpenses = expenses.filter(expense => {
    const matchesType = filter === 'all' || expense.type === filter
    const matchesCategory = !selectedCategory || expense.category === selectedCategory
    return matchesType && matchesCategory
  })

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount)
  }

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString()
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
        <h2 className="text-2xl font-bold text-gray-800">Expenses & Income</h2>
        <button
          onClick={() => {
            setEditingExpense(null)
            setFormData({
              type: 'expense',
              amount: '',
              description: '',
              category: '',
              date: new Date().toISOString().slice(0, 10)
            })
            setShowModal(true)
          }}
          className="bg-wa-teal text-white px-4 py-2 rounded-lg hover:bg-opacity-90 transition-colors"
        >
          + New Entry
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="text-sm text-green-600 font-medium">Total Income</div>
          <div className="text-2xl font-bold text-green-700">{formatCurrency(summary.totalIncome)}</div>
          <div className="text-xs text-green-500 mt-1">{summary.incomeCount || 0} transactions</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="text-sm text-red-600 font-medium">Total Expenses</div>
          <div className="text-2xl font-bold text-red-700">{formatCurrency(summary.totalExpenses)}</div>
          <div className="text-xs text-red-500 mt-1">{summary.expenseCount || 0} transactions</div>
        </div>
        <div className={`border rounded-lg p-4 ${summary.balance >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
          <div className={`text-sm font-medium ${summary.balance >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>Balance</div>
          <div className={`text-2xl font-bold ${summary.balance >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
            {formatCurrency(summary.balance)}
          </div>
          <div className="text-xs text-gray-500 mt-1">{summary.transactionCount || 0} total</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex space-x-2">
          {['all', 'income', 'expense'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg capitalize ${
                filter === f
                  ? f === 'income' ? 'bg-green-500 text-white' 
                    : f === 'expense' ? 'bg-red-500 text-white'
                    : 'bg-wa-teal text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f}
            </button>
          ))}
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

      {/* Transactions List */}
      {filteredExpenses.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <span className="text-4xl">💰</span>
          <p className="text-gray-500 mt-2">No transactions found</p>
          <button
            onClick={() => setShowModal(true)}
            className="text-wa-teal hover:underline mt-2"
          >
            Record your first transaction
          </button>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredExpenses.map((expense) => (
                <tr key={expense.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(expense.date)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {expense.description || '-'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {expense.category && (
                      <span className="px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-800">
                        {expense.category}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <span className={`text-sm font-medium ${
                      expense.type === 'income' ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {expense.type === 'income' ? '+' : '-'}{formatCurrency(expense.amount)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                    <button
                      onClick={() => handleEdit(expense)}
                      className="text-gray-500 hover:text-gray-700 mr-2"
                      title="Edit"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handleDelete(expense.id)}
                      className="text-gray-500 hover:text-red-600"
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">
              {editingExpense ? 'Edit Transaction' : 'New Transaction'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Type Toggle */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Type
                </label>
                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, type: 'income' })}
                    className={`flex-1 py-2 rounded-lg font-medium ${
                      formData.type === 'income'
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    💰 Income
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, type: 'expense' })}
                    className={`flex-1 py-2 rounded-lg font-medium ${
                      formData.type === 'expense'
                        ? 'bg-red-500 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    💸 Expense
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-wa-teal focus:border-transparent"
                  placeholder="0.00"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-wa-teal focus:border-transparent"
                  placeholder="What was this for?"
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
                  placeholder="e.g., Food, Transport, Salary"
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
                  Date *
                </label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-wa-teal focus:border-transparent"
                  required
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false)
                    setEditingExpense(null)
                  }}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || updating}
                  className={`px-4 py-2 rounded-lg text-white font-medium ${
                    formData.type === 'income'
                      ? 'bg-green-500 hover:bg-green-600'
                      : 'bg-red-500 hover:bg-red-600'
                  } disabled:opacity-50`}
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

export default ExpenseTab