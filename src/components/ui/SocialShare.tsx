'use client';

import { useState, useEffect } from 'react';
import { Share2, Check, Copy, Facebook, Twitter, Linkedin, Mail, X } from 'lucide-react';

interface ToastState {
  show: boolean;
  message: string;
  type: 'success' | 'error';
}

interface SocialShareProps {
  title: string;
  text?: string;
  url?: string;
  locale?: string;
}

export default function SocialShare({ title, text, url, locale = 'pt' }: SocialShareProps) {
  const [copied, setCopied] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [toast, setToast] = useState<ToastState>({ show: false, message: '', type: 'success' });
  const isPt = locale === 'pt';

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 2500);
  };

  const shareUrl = url || (typeof window !== 'undefined' ? window.location.href : '');
  const shareText = text || title;

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: shareText,
          text: `${shareText} - ${shareUrl}`,
          url: shareUrl,
        });
      } catch (err) {
        // User cancelled or error
      }
    } else {
      setShowOptions(!showOptions);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      showToast(isPt ? 'Link copiado!' : 'Link copied!');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
      const input = document.createElement('input');
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      showToast(isPt ? 'Link copiado!' : 'Link copied!');
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const socialLinks = [
    {
      name: 'Facebook',
      icon: Facebook,
      url: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
      color: 'hover:bg-surface-2/[0.12]',
    },
    {
      name: 'X (Twitter)',
      icon: Twitter,
      url: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`,
      color: 'hover:bg-surface-2/[0.12]',
    },
    {
      name: 'LinkedIn',
      icon: Linkedin,
      url: `https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(shareText)}`,
      color: 'hover:bg-blue-700',
    },
    {
      name: 'Email',
      icon: Mail,
      url: `mailto:?subject=${encodeURIComponent(shareText)}&body=${encodeURIComponent(`${shareText}\n\n${shareUrl}`)}`,
      color: 'hover:bg-surface-2/[0.12]',
    },
  ];

  return (
    <div className="relative flex items-center gap-2">
      {/* FIX U2: Toast notification */}
      {toast.show && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 animate-fade-up">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium shadow-lg ${
            toast.type === 'success' 
              ? 'bg-score-good/20 text-score-good border border-score-good/30' 
              : 'bg-score-poor/20 text-score-poor border border-score-poor/30'
          }`}>
            {toast.type === 'success' ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
            {toast.message}
          </div>
        </div>
      )}

      {/* Main Share Button */}
      <button
        onClick={handleNativeShare}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-fg-muted hover:text-fg hover:bg-surface-2/[0.08] transition-colors border border-divider"
        aria-label={isPt ? 'Partilhar' : 'Share'}
      >
        {copied ? <Check className="w-4 h-4 text-score-good" /> : <Share2 className="w-4 h-4" />}
        <span className="hidden sm:inline">{copied ? (isPt ? 'Copiado!' : 'Copied!') : (isPt ? 'Partilhar' : 'Share')}</span>
      </button>

      {/* Copy Link Alternative */}
      <button
        onClick={handleCopy}
        className="p-2 rounded-lg text-fg-muted hover:text-fg hover:bg-surface-2/[0.08] transition-colors"
        aria-label={isPt ? 'Copiar link' : 'Copy link'}
        title={isPt ? 'Copiar link' : 'Copy link'}
      >
        {copied ? <Check className="w-4 h-4 text-score-good" /> : <Copy className="w-4 h-4" />}
      </button>

      {/* Social Options Dropdown */}
      {showOptions && (
        <div className="absolute right-0 top-full mt-1 bg-surface-1/[0.04] border border-divider rounded-lg shadow-lg p-2 z-50 min-w-[140px]">
          <div className="text-xs text-fg-subtle px-2 py-1 mb-1">
            {isPt ? 'Partilhar em:' : 'Share on:'}
          </div>
          {socialLinks.map((social) => (
            <a
              key={social.name}
              href={social.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-2 px-3 py-2 rounded text-sm text-fg-muted hover:text-fg ${social.color} hover:bg-surface-2/[0.08] transition-colors`}
              onClick={() => setShowOptions(false)}
            >
              <social.icon className="w-4 h-4" />
              <span>{social.name}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}