'use client';

import { useState, useEffect, useRef } from 'react';
import { Send, MessageCircle, Users, Trash2, Shield, Loader2, ChevronUp } from 'lucide-react';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';
import { moderateMessage, moderateUsername, checkRateLimit, CHAT_RULES } from '@/lib/chatModeration';

interface ChatMessage {
  id: string;
  spot_slug: string;
  username: string;
  content: string;
  created_at: string;
}

interface SpotChatProps {
  spotSlug: string;
  spotName: string;
  locale: string;
}

// Mock messages for demo when Supabase is not configured
const mockMessages: Record<string, ChatMessage[]> = {
  guincho: [
    { id: '1', spot_slug: 'guincho', username: 'RiderLocal', content: 'Ondas estão a bater!', created_at: new Date(Date.now() - 1000 * 60 * 5).toISOString() },
    { id: '2', spot_slug: 'guincho', username: 'KiteGirl', content: 'Vento de N a 25kt, perfeito!', created_at: new Date(Date.now() - 1000 * 60 * 3).toISOString() },
    { id: '3', spot_slug: 'guincho', username: 'SurfNovo', content: 'Alguém me dá boleia desde Lisboa?', created_at: new Date(Date.now() - 1000 * 60).toISOString() },
  ],
  nazare: [
    { id: '1', spot_slug: 'nazare', username: 'BigWaveHunter', content: 'Hoje não é dia, flat...', created_at: new Date(Date.now() - 1000 * 60 * 10).toISOString() },
    { id: '2', spot_slug: 'nazare', username: 'JetSkiMario', content: 'Amanhã promete! Swell de NW a subir.', created_at: new Date(Date.now() - 1000 * 60 * 5).toISOString() },
  ],
};

export default function SpotChat({ spotSlug, spotName, locale }: SpotChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [username, setUsername] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [hasSetup, setHasSetup] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [moderationWarning, setModerationWarning] = useState<string | null>(null);
  const [rateLimitWarning, setRateLimitWarning] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const MESSAGES_PER_PAGE = 50;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isPT = locale === 'pt';

  // Generate random username if not set
  useEffect(() => {
    const stored = localStorage.getItem('windspot_username');
    if (stored) {
      // Validate stored username for bad words
      const moderation = moderateUsername(stored, locale);
      if (moderation.allowed) {
        setUsername(stored);
      } else {
        // Stored username is offensive — generate new one
        generateNewUsername();
      }
    } else {
      generateNewUsername();
    }
  }, [locale]);

  function generateNewUsername() {
    const randomNames = [
      'WaveRider', 'SurfLoco', 'KiteMaster', 'WindHunter',
      'BoarderPT', 'RiderSempre', 'OndaRapida', 'MarAlto',
      'SaltyHair', 'BeachBum', 'DawnPatrol', 'SwellSeeker',
    ];
    const random = randomNames[Math.floor(Math.random() * randomNames.length)] + Math.floor(Math.random() * 100);
    setUsername(random);
    localStorage.setItem('windspot_username', random);
  }

  // Load messages
  useEffect(() => {
    if (!isSupabaseConfigured()) {
      // Use mock data for demo
      setMessages(mockMessages[spotSlug] || []);
      return;
    }

    setHasSetup(true);

    // Fetch initial messages (last 50)
    const fetchMessages = async () => {
      const client = getSupabaseClient();
      if (!client) return;
      const { data, count } = await client
        .from('messages')
        .select('*', { count: 'exact' })
        .eq('spot_slug', spotSlug)
        .order('created_at', { ascending: true })
        .limit(MESSAGES_PER_PAGE);
      
      if (data) {
        setMessages(data);
        setHasMore((count || 0) > MESSAGES_PER_PAGE);
      }
    };

    fetchMessages();

    // Subscribe to new messages
    const channel = getSupabaseClient()?.channel(`spot-chat-${spotSlug}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `spot_slug=eq.${spotSlug}`,
      }, (payload) => {
        setMessages((prev) => [...prev, payload.new as ChatMessage]);
      })
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => {
      if (channel) getSupabaseClient()?.removeChannel(channel);
    };
  }, [spotSlug]);

  // Load more (older) messages
  const loadMoreMessages = async () => {
    if (isLoadingMore || messages.length === 0) return;
    
    setIsLoadingMore(true);
    const oldestMessage = messages[0];
    
    const client = getSupabaseClient();
    if (!client) {
      setIsLoadingMore(false);
      return;
    }
    
    const { data, count } = await client
      .from('messages')
      .select('*', { count: 'exact' })
      .eq('spot_slug', spotSlug)
      .lt('created_at', oldestMessage.created_at)
      .order('created_at', { ascending: true })
      .limit(MESSAGES_PER_PAGE);
    
    if (data && data.length > 0) {
      setMessages((prev) => [...data, ...prev]);
      setHasMore((count || 0) > data.length);
    } else {
      setHasMore(false);
    }
    
    setIsLoadingMore(false);
  };

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !username) return;

    // Clear previous warnings
    setModerationWarning(null);
    setRateLimitWarning(null);

    // Validate username
    const usernameModeration = moderateUsername(username, locale);
    if (!usernameModeration.allowed) {
      setModerationWarning(
        isPT 
          ? 'Nome de utilizador inapropriado. Geração de novo nome...' 
          : 'Inappropriate username. Generating new one...'
      );
      generateNewUsername();
      return;
    }

    // Check rate limit
    const rateCheck = checkRateLimit(username);
    if (!rateCheck.allowed) {
      setRateLimitWarning(
        isPT 
          ? `Muito rápido! Espera ${rateCheck.retryAfter}s` 
          : `Too fast! Wait ${rateCheck.retryAfter}s`
      );
      return;
    }

    // Moderate content
    const moderation = moderateMessage(newMessage.trim(), locale);
    if (!moderation.allowed) {
      setModerationWarning(moderation.reason || (isPT ? 'Mensagem bloqueada' : 'Message blocked'));
      return;
    }

    const contentToSend = moderation.sanitized || newMessage.trim();

    if (!isSupabaseConfigured()) {
      // Mock send - just add locally
      const mockMsg: ChatMessage = {
        id: Date.now().toString(),
        spot_slug: spotSlug,
        username,
        content: contentToSend,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, mockMsg]);
      setNewMessage('');
      return;
    }

    const client = getSupabaseClient();
    if (!client) return;
    const { error } = await client.from('messages').insert([
      {
        spot_slug: spotSlug,
        username,
        content: contentToSend,
      }
    ] as any);

    if (error) {
      console.error('Error sending message:', error);
      return;
    }

    setNewMessage('');
  };

  const clearChat = () => {
    if (window.confirm(isPT ? 'Limpar todas as mensagens?' : 'Clear all messages?')) {
      setMessages([]);
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString(isPT ? 'pt-PT' : 'en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Generate avatar color from username
  const getAvatarColor = (name: string) => {
    const colors = [
      'bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-green-500',
      'bg-cyan-500', 'bg-blue-500', 'bg-purple-500', 'bg-pink-500',
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <div className="bg-slate-800/60 backdrop-blur-sm rounded-xl border border-cyan-500/20 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-cyan-400" />
          <h3 className="text-lg font-bold text-white">
            {isPT ? `Chat ${spotName}` : `${spotName} Chat`}
          </h3>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Users className="w-3.5 h-3.5" />
            {messages.length > 0 ? `${new Set(messages.map(m => m.username)).size} online` : '0 online'}
          </div>
          {isSupabaseConfigured() && (
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
          )}
          <button
            onClick={() => setShowRules(!showRules)}
            className="text-slate-500 hover:text-cyan-400 transition-colors"
            title={isPT ? 'Regras do chat' : 'Chat rules'}
          >
            <Shield className="w-4 h-4" />
          </button>
          <button
            onClick={clearChat}
            className="text-slate-500 hover:text-red-400 transition-colors"
            title={isPT ? 'Limpar chat' : 'Clear chat'}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Rules Panel */}
      {showRules && (
        <div className="bg-slate-700/50 border-b border-white/10 p-3">
          <h4 className="text-xs font-semibold text-cyan-400 mb-2 flex items-center gap-1">
            <Shield className="w-3 h-3" />
            {isPT ? 'Regras do Chat' : 'Chat Rules'}
          </h4>
          <ul className="space-y-1">
            {CHAT_RULES[isPT ? 'pt' : 'en'].map((rule, i) => (
              <li key={i} className="text-xs text-slate-400 flex items-center gap-1.5">
                <div className="w-1 h-1 rounded-full bg-cyan-400" />
                {rule}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Moderation Warning */}
      {moderationWarning && (
        <div className="bg-red-500/10 border border-red-500/20 p-2 mx-4 mt-2 rounded-lg">
          <p className="text-xs text-red-300 flex items-center gap-1">
            <Shield className="w-3 h-3" />
            {moderationWarning}
          </p>
        </div>
      )}

      {/* Rate Limit Warning */}
      {rateLimitWarning && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 p-2 mx-4 mt-2 rounded-lg">
          <p className="text-xs text-yellow-300 flex items-center gap-1">
            <Shield className="w-3 h-3" />
            {rateLimitWarning}
          </p>
          <p className="text-xs text-yellow-300/60 mt-0.5">
            {isPT ? 'Limite do cliente — o servidor impõe max 1 msg/10s por utilizador' : 'Client limit — server enforces max 1 msg/10s per user'}
          </p>
        </div>
      )}

      {/* Messages */}
      <div className="h-64 overflow-y-auto p-4 space-y-3">
        {/* Load More Button */}
        {hasMore && (
          <div className="text-center pb-2">
            <button
              onClick={loadMoreMessages}
              disabled={isLoadingMore}
              className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors disabled:opacity-50 flex items-center gap-1 mx-auto"
            >
              {isLoadingMore ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {isPT ? 'A carregar...' : 'Loading...'}
                </>
              ) : (
                <>
                  <ChevronUp className="w-3 h-3" />
                  {isPT ? 'Carregar mais mensagens' : 'Load more messages'}
                </>
              )}
            </button>
          </div>
        )}
        
        {messages.length === 0 ? (
          <div className="text-center text-slate-500 py-8">
            <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">
              {isPT 
                ? `Ninguém disse nada ainda no ${spotName}. Sê o primeiro!`
                : `No one has said anything at ${spotName} yet. Be the first!`
              }
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="flex gap-2">
              <div className={`w-8 h-8 rounded-full ${getAvatarColor(msg.username)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                {msg.username.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold text-cyan-300">{msg.username}</span>
                  <span className="text-xs text-slate-500">{formatTime(msg.created_at)}</span>
                </div>
                <p className="text-sm text-slate-200 break-words">{msg.content}</p>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={sendMessage} className="p-4 border-t border-white/10">
        <div className="flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={isPT ? 'Escreve algo...' : 'Type something...'}
            className="flex-1 bg-slate-700/50 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
            maxLength={280}
          />
          <button
            type="submit"
            disabled={!newMessage.trim()}
            className="bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-lg px-4 py-2.5 hover:bg-cyan-500/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <div className="flex justify-between mt-2">
          <span className="text-xs text-slate-500">
            {isPT ? `A falar como ` : `Chatting as `}
            <span className="text-cyan-400 font-medium">{username}</span>
          </span>
          <span className="text-xs text-slate-500">{newMessage.length}/280</span>
        </div>
      </form>

      {/* Demo mode notice */}
      {!isSupabaseConfigured() && (
        <div className="px-4 pb-3">
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2.5">
            <p className="text-xs text-yellow-300 font-medium">
              {isPT ? 'Modo demo — Chat local (mensagens não persistem)' : 'Demo mode — Local chat (messages do not persist)'}
            </p>
            <p className="text-xs text-yellow-300/60 mt-1">
              {isPT 
                ? 'Conecta Supabase para chat real com rate-limiting e moderação automática.'
                : 'Connect Supabase for real chat with rate-limiting and auto-moderation.'
              }
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
