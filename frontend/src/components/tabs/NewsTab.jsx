import React, { useState, useEffect } from 'react'
import { useApi } from '../../hooks/useApi'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const NewsTab = ({ showToast }) => {
  const [activeSubTab, setActiveSubTab] = useState('blog-posts')
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [selectedPost, setSelectedPost] = useState(null)
  const [isViewerOpen, setIsViewerOpen] = useState(false)
  const [isSourceModalOpen, setIsSourceModalOpen] = useState(false)
  const [newSource, setNewSource] = useState({ url: '', name: '', region: '', language: '', priority: 5 })

  // API hooks for news data
  const { data: blogPosts, loading: postsLoading, error: postsError, refetch: refetchPosts } = useApi('/api/news/blog-posts')
  const { data: dailyDigests, loading: digestsLoading, error: digestsError, refetch: refetchDigests } = useApi('/api/news/daily-digests')
  const { data: weeklyDigests, loading: weeklyLoading, error: weeklyError, refetch: refetchWeekly } = useApi('/api/news/weekly-digests')
  const { data: newsSources, loading: sourcesLoading, error: sourcesError, refetch: refetchSources } = useApi('/api/news/sources')
  const { data: newsKeywords, loading: keywordsLoading, error: keywordsError, refetch: refetchKeywords } = useApi('/api/news/keywords')

  // Sub-tabs for news system
  const subTabs = [
    { id: 'blog-posts', label: 'Blog Posts', icon: '📝' },
    { id: 'daily-digests', label: 'Daily Digests', icon: '📅' },
    { id: 'weekly-digests', label: 'Weekly Digests', icon: '📊' },
    { id: 'news-sources', label: 'News Sources', icon: '🌐' },
    { id: 'keywords', label: 'Keywords', icon: '🔑' },
    { id: 'configuration', label: 'Configuration', icon: '⚙️' }
  ]

  // Handle blog post selection
  const handleViewPost = (post) => {
    setSelectedPost(post)
    setIsViewerOpen(true)
  }

  // Download digest as markdown
  const downloadDigest = async (type, date) => {
    try {
      const url = type === 'daily'
        ? `/api/news/daily-digest/${date}/download`
        : `/api/news/weekly-digest/${date}/download`

      const response = await fetch(url, { credentials: 'include' })
      if (response.ok) {
        const blob = await response.blob()
        const downloadUrl = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = downloadUrl
        a.download = `${type}-digest-${date}.md`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(downloadUrl)
        document.body.removeChild(a)
        showToast(`${type} digest downloaded successfully`, 'success')
      } else {
        showToast('Failed to download digest', 'error')
      }
    } catch (error) {
      showToast('Error downloading digest', 'error')
    }
  }

  // Add new news source
  const addNewsSource = async () => {
    try {
      const response = await fetch('/api/news/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(newSource)
      })

      if (response.ok) {
        showToast('News source added successfully', 'success')
        setIsSourceModalOpen(false)
        setNewSource({ url: '', name: '', region: '', language: '', priority: 5 })
        refetchSources()
      } else {
        showToast('Failed to add news source', 'error')
      }
    } catch (error) {
      showToast('Error adding news source', 'error')
    }
  }

  // Trigger manual blog generation
  const triggerBlogGeneration = async () => {
    try {
      const response = await fetch('/api/news/generate-blogs', {
        method: 'POST',
        credentials: 'include'
      })

      if (response.ok) {
        showToast('Blog generation started', 'success')
      } else {
        showToast('Failed to start blog generation', 'error')
      }
    } catch (error) {
      showToast('Error starting blog generation', 'error')
    }
  }

  // Render blog post cards
  const renderBlogPosts = () => {
    if (postsLoading) return <div className="text-center py-8">Loading blog posts...</div>
    if (postsError) return <div className="text-center py-8 text-red-500">Error loading blog posts</div>

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">Generated Blog Posts</h3>
          <button
            onClick={triggerBlogGeneration}
            className="bg-wa-teal text-white px-4 py-2 rounded-md hover:bg-green-600 transition-colors"
          >
            Generate New Posts
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {blogPosts?.posts?.map(post => (
            <div key={post.id} className="bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow overflow-hidden">
              {post.featuredImage && (
                <div className="h-40 bg-gray-200 overflow-hidden">
                  <img
                    src={post.featuredImage}
                    alt={post.imageAlt || post.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="p-4">
                <h4 className="font-semibold text-gray-800 mb-2 line-clamp-2">{post.title}</h4>
                <p className="text-sm text-gray-600 mb-3 line-clamp-3">{post.excerpt}</p>
                <div className="flex justify-between items-center text-xs text-gray-500 mb-2">
                  <span className={`px-2 py-1 rounded-full ${
                    post.status === 'published' ? 'bg-green-100 text-green-800' :
                    post.status === 'draft' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {post.status}
                  </span>
                  <span>{post.category}</span>
                </div>
                <div className="flex justify-between items-center text-xs text-gray-500">
                  <span>{new Date(post.publishedAt).toLocaleDateString()}</span>
                  <span>{post.author}</span>
                </div>
                <div className="mt-3 flex space-x-2">
                  <button
                    onClick={() => handleViewPost(post)}
                    className="flex-1 bg-blue-50 text-blue-600 py-1 rounded text-sm hover:bg-blue-100 transition-colors"
                  >
                    View
                  </button>
                  <button className="flex-1 bg-gray-50 text-gray-600 py-1 rounded text-sm hover:bg-gray-100 transition-colors">
                    Download
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {(!blogPosts?.posts || blogPosts.posts.length === 0) && (
          <div className="text-center py-8 text-gray-500">
            No blog posts generated yet. Click "Generate New Posts" to start.
          </div>
        )}
      </div>
    )
  }

  // Render daily digests
  const renderDailyDigests = () => {
    if (digestsLoading) return <div className="text-center py-8">Loading daily digests...</div>
    if (digestsError) return <div className="text-center py-8 text-red-500">Error loading daily digests</div>

    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Daily Digests</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {dailyDigests?.digests?.map(digest => (
            <div key={digest.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex justify-between items-start mb-3">
                <h4 className="font-semibold">{digest.title}</h4>
                <span className="text-sm text-gray-500">{digest.blogPosts?.length || 0} posts</span>
              </div>
              <p className="text-sm text-gray-600 mb-3 line-clamp-3">
                {digest.content.substring(0, 150)}...
              </p>
              <button
                onClick={() => downloadDigest('daily', digest.date.split('T')[0])}
                className="w-full bg-green-50 text-green-600 py-2 rounded text-sm hover:bg-green-100 transition-colors"
              >
                Download Markdown
              </button>
            </div>
          ))}
        </div>

        {(!dailyDigests?.digests || dailyDigests.digests.length === 0) && (
          <div className="text-center py-8 text-gray-500">
            No daily digests available yet.
          </div>
        )}
      </div>
    )
  }

  // Render news sources
  const renderNewsSources = () => {
    if (sourcesLoading) return <div className="text-center py-8">Loading news sources...</div>
    if (sourcesError) return <div className="text-center py-8 text-red-500">Error loading news sources</div>

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">News Sources</h3>
          <button
            onClick={() => setIsSourceModalOpen(true)}
            className="bg-wa-teal text-white px-4 py-2 rounded-md hover:bg-green-600 transition-colors"
          >
            Add Source
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-600">Name</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-600">URL</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-600">Region</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-600">Priority</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody>
              {newsSources?.map(source => (
                <tr key={source.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm">{source.name}</td>
                  <td className="px-4 py-3 text-sm text-blue-600 truncate max-w-xs">{source.url}</td>
                  <td className="px-4 py-3 text-sm">{source.region || '-'}</td>
                  <td className="px-4 py-3 text-sm">{source.priority}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      source.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {source.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {(!newsSources || newsSources.length === 0) && (
          <div className="text-center py-8 text-gray-500">
            No news sources configured. Add your first source to get started.
          </div>
        )}
      </div>
    )
  }

  // Blog post viewer modal
  const BlogPostViewer = () => {
    if (!selectedPost) return null

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <div className="p-4 sm:p-6 border-b border-gray-200 flex justify-between items-center">
            <h3 className="text-lg sm:text-xl font-semibold truncate pr-4">{selectedPost.title}</h3>
            <button
              onClick={() => setIsViewerOpen(false)}
              className="text-gray-500 hover:text-gray-700 text-2xl flex-shrink-0"
            >
              ×
            </button>
          </div>
          <div className="p-4 sm:p-6 overflow-y-auto flex-1">
            <div className="prose max-w-none text-sm sm:text-base">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedPost.content}</ReactMarkdown>
            </div>
          </div>
          <div className="p-4 sm:p-6 border-t border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="text-sm text-gray-600 text-center sm:text-left">
              Source: {selectedPost.sourceTitle} | Category: {selectedPost.category}
            </div>
            <button className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors w-full sm:w-auto">
              Download Post
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Add source modal
  const AddSourceModal = () => {
    if (!isSourceModalOpen) return null

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-xl font-semibold">Add News Source</h3>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
              <input
                type="url"
                value={newSource.url}
                onChange={(e) => setNewSource({ ...newSource, url: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-wa-teal"
                placeholder="https://news.google.com/..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name (Optional)</label>
              <input
                type="text"
                value={newSource.name}
                onChange={(e) => setNewSource({ ...newSource, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-wa-teal"
                placeholder="Google News HK"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Region</label>
                <input
                  type="text"
                  value={newSource.region}
                  onChange={(e) => setNewSource({ ...newSource, region: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-wa-teal"
                  placeholder="HK"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Language</label>
                <input
                  type="text"
                  value={newSource.language}
                  onChange={(e) => setNewSource({ ...newSource, language: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-wa-teal"
                  placeholder="en"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority (1-10)</label>
              <input
                type="number"
                min="1"
                max="10"
                value={newSource.priority}
                onChange={(e) => setNewSource({ ...newSource, priority: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-wa-teal"
              />
            </div>
          </div>
          <div className="p-6 border-t border-gray-200 flex justify-end space-x-3">
            <button
              onClick={() => setIsSourceModalOpen(false)}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={addNewsSource}
              className="bg-wa-teal text-white px-4 py-2 rounded-md hover:bg-green-600 transition-colors"
            >
              Add Source
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 overflow-y-auto h-full">
      {/* Sub-tab Navigation */}
      <div className="flex flex-wrap gap-1 mb-6 bg-gray-100 rounded-lg p-1">
        {subTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={`flex items-center space-x-2 px-3 py-2 rounded-md transition-colors text-sm ${
              activeSubTab === tab.id
                ? 'bg-white text-wa-teal shadow-sm'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            <span className="hidden sm:inline">{tab.icon}</span>
            <span className="font-medium whitespace-nowrap">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        {activeSubTab === 'blog-posts' && renderBlogPosts()}
        {activeSubTab === 'daily-digests' && renderDailyDigests()}
        {activeSubTab === 'weekly-digests' && renderDailyDigests()} {/* Similar to daily for now */}
        {activeSubTab === 'news-sources' && renderNewsSources()}
        {activeSubTab === 'keywords' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Tracked Keywords</h3>
            {keywordsLoading && <div className="text-center py-8">Loading keywords...</div>}
            {keywordsError && <div className="text-center py-8 text-red-500">Error loading keywords</div>}
            {newsKeywords && newsKeywords.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {newsKeywords.map(keyword => (
                  <div key={keyword.id} className="bg-gray-50 rounded-lg p-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-semibold">{keyword.keyword}</span>
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        keyword.relevance > 0.7 ? 'bg-green-100 text-green-800' :
                        keyword.relevance > 0.4 ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {Math.round(keyword.relevance * 100)}%
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">
                      Category: {keyword.category || 'General'}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Last used: {keyword.lastUsed ? new Date(keyword.lastUsed).toLocaleDateString() : 'Never'}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                No keywords tracked yet. Keywords will be automatically discovered during news browsing.
              </div>
            )}
          </div>
        )}
        {activeSubTab === 'configuration' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Browsing Schedule Configuration</h3>
              <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Deep Browsing Time
                    </label>
                    <input
                      type="time"
                      defaultValue="06:00"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-wa-teal"
                    />
                    <p className="text-xs text-gray-500 mt-1">Daily comprehensive news gathering</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Quick Check Interval (minutes)
                    </label>
                    <input
                      type="number"
                      min="60"
                      max="480"
                      defaultValue="180"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-wa-teal"
                    />
                    <p className="text-xs text-gray-500 mt-1">Frequency of focused news updates</p>
                  </div>
                </div>
                <button className="bg-wa-teal text-white px-4 py-2 rounded-md hover:bg-green-600 transition-colors">
                  Save Schedule
                </button>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4">Discovery System</h3>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-4">
                  Automatically discover new news sources from articles during deep browsing sessions.
                </p>
                <button
                  onClick={async () => {
                    try {
                      const response = await fetch('/api/news/discover-sources', {
                        method: 'POST',
                        credentials: 'include'
                      })
                      if (response.ok) {
                        showToast('Source discovery initiated', 'success')
                      } else {
                        showToast('Failed to start discovery', 'error')
                      }
                    } catch (error) {
                      showToast('Error starting discovery', 'error')
                    }
                  }}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
                >
                  Discover New Sources Now
                </button>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4">Blog Generation Settings</h3>
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Image Generation</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" defaultChecked className="sr-only peer" />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Posts Per Day
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    defaultValue="5"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-wa-teal"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {isViewerOpen && <BlogPostViewer />}
      <AddSourceModal />
    </div>
  )
}

export default NewsTab