'use client';

import { useState, useEffect, useRef } from 'react';
import { Send, MessageCircle, Users, Trash2 } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

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
    { id: '1', spot_slug: 'guincho', username: 'RiderLocal', content: 'Ondas estão a bater! 🏄‍♂️', created_at: new Date(Date.now() - 1000 * 60 * 5).toISOString() },
    { id: '2', spot_slug: 'guincho', username: 'KiteGirl', content: 'Vento de N a 25kt, perfeito!', created_at: new Date(Date.now() - 1000 * 60 * 3).toISOString() },
    { id: '3', spot_slug: 'guincho', username: 'SurfNovo', content: 'Alguém me dá boleia desde Lisboa?', created_at: new Date(Date.now() - 1000 * 60).toISOString() },
  ],
  nazare: [
    { id: '1', spot_slug: 'nazare', username: 'BigWaveHunter', content: 'Hoje não é dia, flat... 😴', created_at: new Date(Date.now() - 1000 * 60 * 10).toISOString() },
    { id: '2', spot_slug: 'nazare', username: 'JetSkiMario', content: 'Amanhã promete! Swell de NW a subir.', created_at: new Date(Date.now() - 1000 * 60 * 5).toISOString() },
  ],
};

export default function SpotChat({ spotSlug, spotName, locale }: SpotChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [username, setUsername] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [hasSetup, setHasSetup] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isPT = locale === 'pt';

  // Generate random username if not set
  useEffect(() => {
    const stored = localStorage.getItem('windspot_username');
    if (stored) {
      setUsername(stored);
    } else {
      const randomNames = [
        'WaveRider', 'SurfLoco', 'KiteMaster', 'WindHunter',
        'BoarderPT', 'RiderSempre', 'OndaRapida', 'MarAlto',
        'SaltyHair', 'BeachBum', 'DawnPatrol', 'SwellSeeker',
      ];
      const random = randomNames[Math.floor(Math.random() * randomNames.length)] + Math.floor(Math.random() * 100);
      setUsername(random);
      localStorage.setItem('windspot_username', random);
    }
  }, []);

  // Load messages
  useEffect(() => {
    if (!isSupabaseConfigured()) {
      // Use mock data for demo
      setMessages(mockMessages[spotSlug] || []);
      return;
    }

    setHasSetup(true);

    // Fetch existing messages
    const fetchMessages = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('spot_slug', spotSlug)
        .order('created_at', { ascending: true })
        .limit(50);
      
      if (data) setMessages(data);
    };

    fetchMessages();

    // Subscribe to new messages
    const channel = supabase
      .channel(`spot-chat-${spotSlug}`)
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
      supabase.removeChannel(channel);
    };
  }, [spotSlug]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !username) return;

    if (!isSupabaseConfigured()) {
      // Mock send - just add locally
      const mockMsg: ChatMessage = {
        id: Date.now().toString(),
        spot_slug: spotSlug,
        username,
        content: newMessage.trim(),
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, mockMsg]);
      setNewMessage('');
      return;
    }

    const { error } = await supabase.from('messages').insert({
      spot_slug: spotSlug,
      username,
      content: newMessage.trim(),
    });

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
            {isPT ? `💬 Chat ${spotName}` : `💬 ${spotName} Chat`}
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
            onClick={clearChat}
            className="text-slate-500 hover:text-red-400 transition-colors"
            title={isPT ? 'Limpar chat' : 'Clear chat'}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="h-64 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center text-slate-500 py-8">
            <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">
              {isPT 
                ? `Ninguém disse nada ainda no ${spotName}. Sê o primeiro! 🤙`
                : `No one has said anything at ${spotName} yet. Be the first! 🤙`
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
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2.5 text-xs text-yellow-300">
            {isPT 
              ? '⚠️ Modo demo — Conecta Supabase para chat real. Ver SOCIAL-REPORT.md'
              : '⚠️ Demo mode — Connect Supabase for real chat. See SOCIAL-REPORT.md'
            }
          </div>
        </div>
      )}
    </div>
  );
}
