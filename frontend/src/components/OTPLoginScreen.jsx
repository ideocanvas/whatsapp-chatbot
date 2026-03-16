import React, { useState } from 'react'

const OTPLoginScreen = ({ onLogin, showToast }) => {
  const [step, setStep] = useState('phone') // 'phone' or 'otp'
  const [phoneNumber, setPhoneNumber] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [countdown, setCountdown] = useState(0)

  const requestOTP = async (e) => {
    e.preventDefault()
    if (!phoneNumber.trim()) {
      showToast('Please enter your phone number', 'error')
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/user/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phoneNumber.trim() }),
      })

      const data = await response.json()

      if (response.ok) {
        setStep('otp')
        setCountdown(300) // 5 minutes countdown
        showToast('OTP sent to your WhatsApp', 'success')
        
        // Start countdown
        const timer = setInterval(() => {
          setCountdown(prev => {
            if (prev <= 1) {
              clearInterval(timer)
              return 0
            }
            return prev - 1
          })
        }, 1000)
      } else {
        showToast(data.error || 'Failed to send OTP', 'error')
      }
    } catch (error) {
      showToast('Connection error', 'error')
    } finally {
      setLoading(false)
    }
  }

  const verifyOTP = async (e) => {
    e.preventDefault()
    if (!otp.trim()) {
      showToast('Please enter the OTP', 'error')
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/user/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          phoneNumber: phoneNumber.trim(), 
          otp: otp.trim() 
        }),
      })

      const data = await response.json()

      if (response.ok) {
        showToast('Login successful', 'success')
        onLogin(data.user)
      } else {
        showToast(data.error || 'Invalid OTP', 'error')
      }
    } catch (error) {
      showToast('Connection error', 'error')
    } finally {
      setLoading(false)
    }
  }

  const formatCountdown = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white rounded-lg shadow-lg p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-wa-teal rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">📱</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-800">User Login</h1>
            <p className="text-gray-600 mt-2">
              {step === 'phone' 
                ? 'Enter your WhatsApp number to receive an OTP'
                : 'Enter the OTP sent to your WhatsApp'}
            </p>
          </div>

          {/* Phone Number Step */}
          {step === 'phone' && (
            <form onSubmit={requestOTP} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+1234567890"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-wa-teal focus:border-transparent"
                  disabled={loading}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Enter your WhatsApp number with country code (e.g., +1234567890)
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-wa-teal text-white py-3 rounded-lg font-medium hover:bg-opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Sending...' : 'Send OTP'}
              </button>
            </form>
          )}

          {/* OTP Step */}
          {step === 'otp' && (
            <form onSubmit={verifyOTP} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Verification Code
                </label>
                <input
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Enter 6-digit OTP"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-wa-teal focus:border-transparent text-center text-2xl tracking-widest"
                  maxLength={6}
                  disabled={loading}
                />
                {countdown > 0 && (
                  <p className="text-xs text-gray-500 mt-1 text-center">
                    OTP expires in {formatCountdown(countdown)}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="w-full bg-wa-teal text-white py-3 rounded-lg font-medium hover:bg-opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Verifying...' : 'Verify OTP'}
              </button>

              <button
                type="button"
                onClick={() => setStep('phone')}
                className="w-full text-gray-600 py-2 hover:text-gray-800"
              >
                ← Change phone number
              </button>
            </form>
          )}

          {/* Footer */}
          <div className="mt-6 text-center text-sm text-gray-500">
            <p>
              By logging in, you agree to our Terms of Service
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default OTPLoginScreen