import { ShareNetworkIcon } from '@phosphor-icons/react'
import { useState } from 'preact/hooks'
import { SocialIcon } from 'react-social-icons'
import { Modal } from './Modal.tsx'

interface ShareModalProps {
  isOpen: boolean
  onClose: () => void
  trackUrl: string
  trackTitle: string
  userName: string | null | undefined
}

export function ShareModal({ isOpen, onClose, trackUrl, trackTitle, userName }: ShareModalProps) {
  const [showCopied, setShowCopied] = useState(false)

  const shareText = `Listen to ${trackTitle} by ${userName || 'Unknown'} on loopmaster`

  const getSocialShareUrl = (platform: string) => {
    switch (platform) {
      case 'twitter':
        return `https://twitter.com/intent/tweet?text=${
          encodeURIComponent(
            shareText,
          )
        }&url=${encodeURIComponent(trackUrl)}`
      case 'facebook':
        return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(trackUrl)}`
      case 'reddit':
        return `https://reddit.com/submit?url=${
          encodeURIComponent(
            trackUrl,
          )
        }&title=${encodeURIComponent(shareText)}`
      case 'whatsapp':
        return `https://api.whatsapp.com/send?text=${
          encodeURIComponent(
            shareText + ' ' + trackUrl,
          )
        }`
      case 'telegram':
        return `https://t.me/share/url?url=${
          encodeURIComponent(
            trackUrl,
          )
        }&text=${encodeURIComponent(shareText)}`
      default:
        return ''
    }
  }

  const handleClose = () => {
    setShowCopied(false)
    onClose()
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(trackUrl)
    setShowCopied(true)
    setTimeout(() => setShowCopied(false), 2000)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={
        <div className="flex items-center gap-4 font-[Turret_Road] font-extrabold text-2xl">
          <ShareNetworkIcon weight="light" size={24} className="relative -top-[1.5px]" />
          <span className="bg-gradient-to-br from-orange-400 to-red-600 bg-clip-text text-transparent">Share Loop</span>
        </div>
      }
      width="max-w-md w-full"
      maxWidth="max-w-md"
      className="mx-4"
      contentClassName="!p-6"
    >
      <div className="space-y-3">
        <a
          href={getSocialShareUrl('twitter')}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-4 py-3 bg-[#0a0a0a] hover:bg-[#2a2a2a] border border-[#333] rounded"
        >
          <SocialIcon network="x" style={{ width: 24, height: 24 }} />
          <span>Share on X</span>
        </a>
        <a
          href={getSocialShareUrl('facebook')}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-4 py-3 bg-[#0a0a0a] hover:bg-[#2a2a2a] border border-[#333] rounded"
        >
          <SocialIcon network="facebook" style={{ width: 24, height: 24 }} />
          <span>Share on Facebook</span>
        </a>
        <a
          href={getSocialShareUrl('reddit')}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-4 py-3 bg-[#0a0a0a] hover:bg-[#2a2a2a] border border-[#333] rounded"
        >
          <SocialIcon network="reddit" style={{ width: 24, height: 24 }} />
          <span>Share on Reddit</span>
        </a>
        <a
          href={getSocialShareUrl('whatsapp')}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-4 py-3 bg-[#0a0a0a] hover:bg-[#2a2a2a] border border-[#333] rounded"
        >
          <SocialIcon network="whatsapp" style={{ width: 24, height: 24 }} />
          <span>Share on WhatsApp</span>
        </a>
        <a
          href={getSocialShareUrl('telegram')}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-4 py-3 bg-[#0a0a0a] hover:bg-[#2a2a2a] border border-[#333] rounded"
        >
          <SocialIcon network="telegram" style={{ width: 24, height: 24 }} />
          <span>Share on Telegram</span>
        </a>
      </div>
      <div className="mt-4 pt-4 border-t border-[#333]">
        <div className="text-xs text-[#888] mb-2">Or copy link:</div>
        <div className="flex gap-2 items-center">
          <input
            type="text"
            readOnly
            value={trackUrl}
            className="flex-1 px-3 py-2 bg-[#0a0a0a] border border-[#333] rounded text-sm text-white"
            onClick={e => (e.target as HTMLInputElement).select()}
          />
          {!showCopied && (
            <button
              onClick={handleCopy}
              className="px-4 py-2 bg-gradient-to-br from-orange-400 to-red-600 text-white rounded hover:opacity-90 text-sm font-medium"
            >
              Copy
            </button>
          )}
          {showCopied && (
            <span className="text-sm text-green-500 font-medium whitespace-nowrap">
              Copied!
            </span>
          )}
        </div>
      </div>
    </Modal>
  )
}
