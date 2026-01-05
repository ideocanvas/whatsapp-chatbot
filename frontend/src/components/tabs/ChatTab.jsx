import React, { useState, useEffect, useRef } from 'react'
import { useApiMutation } from '../../hooks/useApi'

const ChatTab = ({ botInfo, showToast }) => {
  const [chatInput, setChatInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [activeAttachment, setActiveAttachment] = useState(null)
  const [chatMessages, setChatMessages] = useState([
    { id: 1, sender: 'bot', text: 'Hello! I am online. Ask me to research something, or upload an image/audio!', time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) }
  ])

  const fileInputRef = useRef(null)
  const chatContainerRef = useRef(null)

  const { mutate: sendChatMessage } = useApiMutation('/api/chat')

  useEffect(() => {
    scrollToBottom()
  }, [chatMessages])

  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }

  const handleFileSelect = (event) => {
    const file = event.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const type = file.type.startsWith('image/') ? 'image' : 'audio'
      setActiveAttachment({
        type: type,
        data: e.target.result,
        name: file.name
      })
      showToast(`${type === 'image' ? 'Image' : 'Audio'} attached`, 'success')
    }
    reader.readAsDataURL(file)

    // Reset input so same file can be selected again if needed
    event.target.value = ''
  }

  const clearAttachment = () => {
    setActiveAttachment(null)
  }

  const sendMessage = async () => {
    if (!chatInput.trim() && !activeAttachment) return

    const text = chatInput
    const attachment = activeAttachment

    // Clear inputs immediately
    setChatInput('')
    setActiveAttachment(null)

    // Optimistic update
    const newMessage = {
      id: Date.now(),
      sender: 'user',
      text: text,
      attachment: attachment,
      time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
    }
    setChatMessages(prev => [...prev, newMessage])

    setIsTyping(true)

    try {
      const payload = { message: text }
      if (attachment) {
        if (attachment.type === 'image') payload.image = attachment.data
        if (attachment.type === 'audio') payload.audio = attachment.data
      }

      const response = await sendChatMessage(payload)

      if (response) {
        const botMessage = {
          id: Date.now() + 1,
          sender: 'bot',
          text: response.response || 'I received your message.',
          time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
        }
        setChatMessages(prev => [...prev, botMessage])
      }
    } catch (error) {
      showToast('Failed to send message', 'error')
    } finally {
      setIsTyping(false)
    }
  }

  const handleKeyPress = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="flex flex-col h-full bg-[#efeae2]">
      {/* Chat Area (WhatsApp Style) */}
      <div
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 chat-bg"
        id="chat-container"
      >
        <div className="text-center text-xs text-gray-500 my-4">
          <span className="bg-white/60 px-2 py-1 rounded shadow-sm">🔒 Messages are end-to-end encrypted (simulated)</span>
        </div>

        {chatMessages.map((msg) => (
          <div key={msg.id} className={`flex w-full ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] relative p-2 shadow-sm flex flex-col ${
              msg.sender === 'user' ? 'message-out' : 'message-in'
            }`}>

              {/* Sender Name (for bot) */}
              {msg.sender === 'bot' && (
                <span className="text-xs font-bold text-orange-500 mb-1">{botInfo?.name || 'Bot'}</span>
              )}

              {/* Attachments Preview */}
              {msg.attachment && (
                <div className="mb-2 rounded overflow-hidden">
                  {/* Image Preview */}
                  {msg.attachment.type === 'image' && (
                    <img src={msg.attachment.data} className="max-w-full h-auto rounded" style={{maxHeight: '200px'}} alt="Attachment" />
                  )}
                  {/* Audio Preview */}
                  {msg.attachment.type === 'audio' && (
                    <div className="bg-gray-100 p-2 rounded flex items-center space-x-2">
                      <span className="text-xl">🎤</span>
                      <span className="text-xs text-gray-500">Audio Message</span>
                    </div>
                  )}
                </div>
              )}

              {/* Audio Response (Bot) */}
              {msg.audio && (
                <div className="mb-2">
                  <audio controls autoPlay src={msg.audio} className="w-full h-8 max-w-[200px]" />
                </div>
              )}

              <span className="text-gray-800 text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</span>

              <div className="flex justify-end items-center mt-1 space-x-1">
                <span className="text-[10px] text-gray-500">{msg.time}</span>
                {msg.sender === 'user' && (
                  <svg className="w-3 h-3 text-blue-500" viewBox="0 0 16 15" width="16" height="15" xmlns="http://www.w3.org/2000/svg">
                    <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.283a.32.32 0 0 0 .484-.033l6.272-8.048a.366.366 0 0 0-.064-.512zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z" fill="currentColor"/>
                  </svg>
                )}
              </div>
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex justify-start">
            <div className="message-in p-3 flex items-center space-x-1">
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.4s'}}></div>
            </div>
          </div>
        )}
      </div>

      {/* Attachment Preview Bar */}
      {activeAttachment && (
        <div className="bg-gray-100 px-4 py-2 flex items-center justify-between border-t border-gray-200">
          <div className="flex items-center space-x-3">
            {activeAttachment.type === 'image' && (
              <div className="h-10 w-10 bg-gray-300 rounded overflow-hidden">
                <img src={activeAttachment.data} className="h-full w-full object-cover" alt="Preview" />
              </div>
            )}
            {activeAttachment.type === 'audio' && (
              <div className="h-10 w-10 bg-blue-100 rounded flex items-center justify-center text-blue-600">
                🎤
              </div>
            )}
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-gray-700">
                {activeAttachment.type === 'image' ? 'Image Attached' : 'Audio Attached'}
              </span>
              <span className="text-[10px] text-gray-500">{activeAttachment.name}</span>
            </div>
          </div>
          <button onClick={clearAttachment} className="text-gray-500 hover:text-red-500">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Input Area */}
      <div className="bg-wa-panel p-3 px-4 flex items-center space-x-2 border-t border-gray-200">
        {/* File Input (Hidden) */}
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="image/*,audio/*"
          onChange={handleFileSelect}
        />

        <button
          onClick={() => fileInputRef.current?.click()}
          className="text-gray-500 hover:text-gray-700 p-1"
          title="Attach Image or Audio"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
        </button>

        <input
          type="text"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={handleKeyPress}
          className="flex-1 bg-white border-none rounded-lg py-2 px-4 focus:ring-0 focus:outline-none placeholder-gray-500"
          placeholder="Type a message (press Enter to send)"
          data-1p-ignore
          autoComplete="off"
        />
        <button
          onClick={sendMessage}
          className="p-2 bg-wa-teal text-white rounded-full hover:bg-wa-accent transition-colors shadow-sm"
        >
          <svg className="w-5 h-5 transform rotate-90" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export default ChatTab