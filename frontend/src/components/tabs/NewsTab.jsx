import React, { useState, useEffect } from 'react'
import { useApi } from '../../hooks/useApi'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const NewsTab = ({ showToast }) => {
  const [activeSubTab, setActiveSubTab] = useState('articles')
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [selectedPost, setSelectedPost] = useState(null)
  const [selectedArticle, setSelectedArticle] = useState(null)
  const [isViewerOpen, setIsViewerOpen] = useState(false)
  const [isArticleViewerOpen, setIsArticleViewerOpen] = useState(false)
  const [isSourceModalOpen, setIsSourceModalOpen] = useState(false)
  const [newSource, setNewSource] = useState({ url: '', name: '', region: '', language: '', priority: 5 })
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

  const toggleFavorite = async (post) => {
    try {
      const isFavorited = favorites.some(fav => fav.url === (post.sourceUrl || post.url || post.id))

      if (isFavorited) {
        // Remove from favorites
        const response = await fetch('/api/favorites', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ url: post.sourceUrl || post.url || post.id })
        })

        if (response.ok) {
          setFavorites(favorites.filter(fav => fav.url !== (post.sourceUrl || post.url || post.id)))
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
            url: post.sourceUrl || post.url || post.id,
            title: post.title,
            category: post.category || 'news',
            source: 'news'
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

  const isFavorited = (post) => {
    return favorites.some(fav => fav.url === (post.sourceUrl || post.url || post.id))
  }

  // API hooks for news data
  const { data: blogPosts, loading: postsLoading, error: postsError, refetch: refetchPosts } = useApi('/api/news/blog-posts')
  const { data: dailyDigests, loading: digestsLoading, error: digestsError, refetch: refetchDigests } = useApi('/api/news/daily-digests')
  const { data: weeklyDigests, loading: weeklyLoading, error: weeklyError, refetch: refetchWeekly } = useApi('/api/news/weekly-digests')
  const { data: newsSources, loading: sourcesLoading, error: sourcesError, refetch: refetchSources } = useApi('/api/news/sources')
  const { data: newsKeywords, loading: keywordsLoading, error: keywordsError, refetch: refetchKeywords } = useApi('/api/news/keywords')
  const { data: articles, loading: articlesLoading, error: articlesError, refetch: refetchArticles } = useApi('/api/news/articles')

  // Sub-tabs for news system
  const subTabs = [
    { id: 'articles', label: 'Downloaded Articles', icon: '📰' },
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

  // Handle article selection
  const handleViewArticle = async (article) => {
    try {
      const response = await fetch(`/api/news/articles/${article.id}/content`, { credentials: 'include' })
      if (response.ok) {
        const data = await response.json()
        setSelectedArticle(data)
        setIsArticleViewerOpen(true)
      } else {
        showToast('Failed to load article content', 'error')
      }
    } catch (error) {
      showToast('Error loading article content', 'error')
    }
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

  // Download individual blog post as markdown
  const downloadBlogPost = async (postId, postTitle) => {
    try {
      const response = await fetch(`/api/news/blog-post/${postId}/download`, { credentials: 'include' })
      if (response.ok) {
        const blob = await response.blob()
        const downloadUrl = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = downloadUrl
        a.download = `blog-post-${postTitle.replace(/[^a-zA-Z0-9]/g, '-')}.md`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(downloadUrl)
        document.body.removeChild(a)
        showToast('Blog post downloaded successfully', 'success')
      } else {
        showToast('Failed to download blog post', 'error')
      }
    } catch (error) {
      showToast('Error downloading blog post', 'error')
    }
  }

  // Add new news source
  const addNewsSource = async (sourceData) => {
    try {
      const response = await fetch('/api/news/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(sourceData)
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

  // Render downloaded articles
  const renderDownloadedArticles = () => {
    if (articlesLoading) return <div className="text-center py-8">Loading downloaded articles...</div>
    if (articlesError) return <div className="text-center py-8 text-red-500">Error loading articles</div>

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-semibold">Downloaded Articles</h3>
            <p className="text-sm text-gray-500 mt-1">
              {articles?.total || 0} articles downloaded and processed
            </p>
          </div>
          <button
            onClick={refetchArticles}
            className="bg-wa-teal text-white px-4 py-2 rounded-md hover:bg-green-600 transition-colors"
          >
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {articles?.articles?.map(article => (
            <div key={article.id} className="bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow overflow-hidden">
              {article.imagePaths && article.imagePaths.length > 0 && (
                <div className="h-40 bg-gray-200 overflow-hidden relative">
                  <img
                    src={`/api/news/articles/images/${article.imagePaths[0]}`}
                    alt={article.title}
                    className="w-full h-full object-cover"
                    onError={(e) => { e.target.style.display = 'none' }}
                  />
                </div>
              )}
              <div className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-semibold text-gray-800 line-clamp-2 flex-1 mr-2">{article.title}</h4>
                  <button
                    onClick={() => toggleFavorite(article)}
                    className={`p-1 rounded-full transition-colors flex-shrink-0 ${
                      isFavorited(article)
                        ? 'bg-yellow-100 text-yellow-600 hover:bg-yellow-200'
                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                    }`}
                    title={isFavorited(article) ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    {isFavorited(article) ? '⭐' : '☆'}
                  </button>
                </div>
                
                <div className="flex flex-wrap gap-1 mb-3">
                  {article.tags && article.tags.slice(0, 3).map((tag, idx) => (
                    <span key={idx} className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded">
                      {tag}
                    </span>
                  ))}
                </div>

                <div className="flex justify-between items-center text-xs text-gray-500 mb-2">
                  <span className={`px-2 py-1 rounded-full ${
                    article.processingStatus === 'completed' ? 'bg-green-100 text-green-800' :
                    article.processingStatus === 'processing' ? 'bg-yellow-100 text-yellow-800' :
                    article.processingStatus === 'failed' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {article.processingStatus}
                  </span>
                  {article.category && <span className="text-gray-600">{article.category}</span>}
                </div>

                <div className="flex justify-between items-center text-xs text-gray-500 mb-3">
                  <span>{new Date(article.publishedAt).toLocaleDateString()}</span>
                  <span className="truncate max-w-[150px]" title={article.source}>{article.source}</span>
                </div>

                {article.keywords && article.keywords.length > 0 && (
                  <div className="text-xs text-gray-600 mb-3">
                    <span className="font-medium">Keywords: </span>
                    <span>{article.keywords.slice(0, 3).join(', ')}</span>
                  </div>
                )}

                <div className="flex space-x-2">
                  <button
                    onClick={() => handleViewArticle(article)}
                    className="flex-1 bg-blue-50 text-blue-600 py-1 rounded text-sm hover:bg-blue-100 transition-colors"
                  >
                    View Content
                  </button>
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 bg-gray-50 text-gray-600 py-1 rounded text-sm hover:bg-gray-100 transition-colors text-center"
                  >
                    Original
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>

        {(!articles?.articles || articles.articles.length === 0) && (
          <div className="text-center py-8 text-gray-500">
            No downloaded articles yet. Articles will appear here after running the news:cli sync.
          </div>
        )}

        {articles?.pagination && articles.pagination.pages > 1 && (
          <div className="flex justify-center items-center space-x-2 mt-6">
            <button
              disabled={articles.pagination.page === 1}
              className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-gray-600">
              Page {articles.pagination.page} of {articles.pagination.pages}
            </span>
            <button
              disabled={articles.pagination.page === articles.pagination.pages}
              className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>
    )
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
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-semibold text-gray-800 line-clamp-2 flex-1 mr-2">{post.title}</h4>
                  <button
                    onClick={() => toggleFavorite(post)}
                    className={`p-1 rounded-full transition-colors flex-shrink-0 ${
                      isFavorited(post)
                        ? 'bg-yellow-100 text-yellow-600 hover:bg-yellow-200'
                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                    }`}
                    title={isFavorited(post) ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    {isFavorited(post) ? '⭐' : '☆'}
                  </button>
                </div>
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
                  <button
                    onClick={() => downloadBlogPost(post.id, post.title)}
                    className="flex-1 bg-gray-50 text-gray-600 py-1 rounded text-sm hover:bg-gray-100 transition-colors"
                  >
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
            <button
              onClick={() => downloadBlogPost(selectedPost.id, selectedPost.title)}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors w-full sm:w-auto"
            >
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

    // Use local state to avoid re-renders on every keystroke
    const [localSource, setLocalSource] = useState(newSource)

    // Update parent state only when modal is closed or submitted
    useEffect(() => {
      if (isSourceModalOpen) {
        setLocalSource(newSource)
      }
    }, [isSourceModalOpen, newSource])

    // Handle modal submission
    const handleAddSource = () => {
      setNewSource(localSource)
      addNewsSource(localSource)
    }

    // Handle Enter key to prevent blur
    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
      }
    }

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-xl font-semibold">Add News Source</h3>
          </div>
          <div className="p-6 space-y-4" onKeyDown={handleKeyDown}>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
              <input
                type="url"
                value={localSource.url}
                onChange={(e) => setLocalSource({ ...localSource, url: e.target.value })}
                onKeyDown={handleKeyDown}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-wa-teal"
                placeholder="https://news.google.com/..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name (Optional)</label>
              <input
                type="text"
                value={localSource.name}
                onChange={(e) => setLocalSource({ ...localSource, name: e.target.value })}
                onKeyDown={handleKeyDown}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-wa-teal"
                placeholder="Google News HK"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Region</label>
                <input
                  type="text"
                  value={localSource.region}
                  onChange={(e) => setLocalSource({ ...localSource, region: e.target.value })}
                  onKeyDown={handleKeyDown}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-wa-teal"
                  placeholder="HK"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Language</label>
                <input
                  type="text"
                  value={localSource.language}
                  onChange={(e) => setLocalSource({ ...localSource, language: e.target.value })}
                  onKeyDown={handleKeyDown}
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
                value={localSource.priority}
                onChange={(e) => setLocalSource({ ...localSource, priority: parseInt(e.target.value) })}
                onKeyDown={handleKeyDown}
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
              onClick={handleAddSource}
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
        {activeSubTab === 'articles' && renderDownloadedArticles()}
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
      {isArticleViewerOpen && selectedArticle && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-4 sm:p-6 border-b border-gray-200 flex justify-between items-center">
              <div className="flex-1 pr-4">
                <h3 className="text-lg sm:text-xl font-semibold mb-1">{selectedArticle.title}</h3>
                <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                  <span>{new Date(selectedArticle.publishedAt).toLocaleDateString()}</span>
                  <span>•</span>
                  <span>{selectedArticle.source}</span>
                  {selectedArticle.category && (
                    <>
                      <span>•</span>
                      <span className="text-blue-600">{selectedArticle.category}</span>
                    </>
                  )}
                </div>
              </div>
              <button
                onClick={() => {
                  setIsArticleViewerOpen(false)
                  setSelectedArticle(null)
                }}
                className="text-gray-500 hover:text-gray-700 text-2xl flex-shrink-0"
              >
                ×
              </button>
            </div>
            <div className="p-4 sm:p-6 overflow-y-auto flex-1">
              <div className="prose prose-sm sm:prose-base lg:prose-lg max-w-none prose-headings:font-bold prose-a:text-blue-600 prose-img:rounded-lg prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-pre:bg-gray-800 prose-pre:text-white">
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm]}
                  components={{
                    img: ({node, ...props}) => (
                      <img {...props} className="rounded-lg shadow-sm my-4" loading="lazy" />
                    ),
                    a: ({node, ...props}) => (
                      <a {...props} className="text-blue-600 hover:text-blue-800 underline" target="_blank" rel="noopener noreferrer" />
                    ),
                    h1: ({node, ...props}) => <h1 {...props} className="text-2xl font-bold mt-6 mb-4" />,
                    h2: ({node, ...props}) => <h2 {...props} className="text-xl font-bold mt-5 mb-3" />,
                    h3: ({node, ...props}) => <h3 {...props} className="text-lg font-bold mt-4 mb-2" />,
                    p: ({node, ...props}) => <p {...props} className="mb-4 leading-relaxed" />,
                    ul: ({node, ...props}) => <ul {...props} className="list-disc list-inside mb-4 space-y-2" />,
                    ol: ({node, ...props}) => <ol {...props} className="list-decimal list-inside mb-4 space-y-2" />,
                    blockquote: ({node, ...props}) => <blockquote {...props} className="border-l-4 border-gray-300 pl-4 italic my-4" />,
                    code: ({node, inline, ...props}) => 
                      inline 
                        ? <code {...props} className="bg-gray-100 px-1 py-0.5 rounded text-sm" />
                        : <code {...props} className="block bg-gray-800 text-white p-4 rounded-lg overflow-x-auto" />
                  }}
                >
                  {selectedArticle.markdownContent || 'No content available'}
                </ReactMarkdown>
              </div>
              
              {selectedArticle.tags && selectedArticle.tags.length > 0 && (
                <div className="mt-6 pt-4 border-t border-gray-200">
                  <div className="flex flex-wrap gap-2">
                    {selectedArticle.tags.map((tag, idx) => (
                      <span key={idx} className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              
              {selectedArticle.keywords && selectedArticle.keywords.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <p className="text-xs text-gray-600">
                    <span className="font-medium">Keywords: </span>
                    {selectedArticle.keywords.join(', ')}
                  </p>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-between items-center">
              <a
                href={selectedArticle.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700 text-sm"
              >
                View Original Article →
              </a>
              <button
                onClick={() => {
                  setIsArticleViewerOpen(false)
                  setSelectedArticle(null)
                }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      <AddSourceModal />
    </div>
  )
}

export default NewsTab