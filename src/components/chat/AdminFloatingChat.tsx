import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Send, UserPlus, Minus, X, GripHorizontal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { useMinimizedChats } from '@/hooks/useMinimizedChats';
import { useAppStore, MinimizedChat } from '@/stores/appStore';

interface ServiceRequest {
  id: string;
  title: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
  order_id: string | null;
  cancellation_reason: string | null;
  media_sites: { name: string; favicon: string | null; price: number };
  profiles: { email: string; username: string | null };
  agency_payouts: { agency_name: string } | null;
}

interface ServiceMessage {
  id: string;
  sender_type: 'client' | 'agency' | 'admin';
  message: string;
  created_at: string;
}

interface AdminFloatingChatProps {
  request: ServiceRequest;
  messages: ServiceMessage[];
  onClose: () => void;
  onMessagesUpdate: (requestId: string, messages: ServiceMessage[]) => void;
  position?: { x: number; y: number };
  zIndex?: number;
}

export function AdminFloatingChat({ 
  request, 
  messages: initialMessages, 
  onClose,
  onMessagesUpdate,
  position: initialPosition = { x: 0, y: 0 },
  zIndex = 1000
}: AdminFloatingChatProps) {
  const { user } = useAuth();
  const { addMinimizedChat } = useMinimizedChats();
  const { incrementUnreadMessageCount } = useAppStore();
  
  const [messages, setMessages] = useState<ServiceMessage[]>(initialMessages);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);
  const [joiningChat, setJoiningChat] = useState(false);
  const [typingUsers, setTypingUsers] = useState<{ type: string; user_id: string }[]>([]);
  
  // Drag state
  const [localPosition, setLocalPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const isCancelled = request.status === 'cancelled';

  // Check if admin has joined
  useEffect(() => {
    if (!user) return;
    const checkJoined = async () => {
      const { data } = await supabase
        .from('admin_investigations')
        .select('id')
        .eq('service_request_id', request.id)
        .eq('admin_id', user.id)
        .eq('status', 'active')
        .maybeSingle();
      setHasJoined(!!data);
    };
    checkJoined();
  }, [request.id, user?.id]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Real-time message subscription
  useEffect(() => {
    const channel = supabase
      .channel(`admin-floating-chat-${request.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'service_messages',
          filter: `request_id=eq.${request.id}`
        },
        (payload) => {
          const newMsg = payload.new as ServiceMessage;
          setMessages(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev;
            const updated = [...prev, newMsg];
            onMessagesUpdate(request.id, updated);
            return updated;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [request.id, onMessagesUpdate]);

  // Typing indicator with presence
  useEffect(() => {
    if (!user) return;

    const channelName = `typing-${request.id}`;
    const channel = supabase.channel(channelName);

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const typing: { type: string; user_id: string }[] = [];
        Object.values(state).forEach((presences: any) => {
          presences.forEach((p: any) => {
            if (p.is_typing && p.sender_id !== user.id) {
              typing.push({ type: p.sender_type, user_id: p.sender_id });
            }
          });
        });
        setTypingUsers(typing);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && hasJoined) {
          await channel.track({
            sender_id: user.id,
            sender_type: 'admin',
            is_typing: false
          });
        }
      });

    presenceChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      presenceChannelRef.current = null;
    };
  }, [request.id, user?.id, hasJoined]);

  // Drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, input')) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: localPosition.x,
      posY: localPosition.y
    };
    e.preventDefault();
  }, [localPosition]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;
      setLocalPosition({
        x: dragStartRef.current.posX + deltaX,
        y: dragStartRef.current.posY + deltaY
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const sendTypingIndicator = (isTyping: boolean) => {
    if (!presenceChannelRef.current || !user || !hasJoined) return;
    presenceChannelRef.current.track({
      sender_id: user.id,
      sender_type: 'admin',
      is_typing: isTyping
    });
  };

  const handleInputChange = (value: string) => {
    setNewMessage(value);
    
    if (value.trim()) {
      sendTypingIndicator(true);
      
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        sendTypingIndicator(false);
      }, 2000);
    } else {
      sendTypingIndicator(false);
    }
  };

  const handleJoinChat = async () => {
    if (!user) return;
    setJoiningChat(true);
    try {
      const { error } = await supabase
        .from('admin_investigations')
        .upsert({
          admin_id: user.id,
          service_request_id: request.id,
          order_id: request.order_id || request.id,
          status: 'active'
        }, { onConflict: 'service_request_id' });

      if (error) throw error;

      setHasJoined(true);
      toast({ title: 'Joined chat', description: 'You can now participate in this engagement.' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setJoiningChat(false);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !user) return;
    setSending(true);
    sendTypingIndicator(false);
    
    try {
      const { error } = await supabase.from('service_messages').insert({
        request_id: request.id,
        sender_id: user.id,
        sender_type: 'admin',
        message: newMessage.trim()
      });

      if (error) throw error;

      const newMsg: ServiceMessage = {
        id: crypto.randomUUID(),
        sender_type: 'admin',
        message: newMessage.trim(),
        created_at: new Date().toISOString()
      };
      
      setMessages(prev => {
        const updated = [...prev, newMsg];
        onMessagesUpdate(request.id, updated);
        return updated;
      });
      setNewMessage('');
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setSending(false);
    }
  };

  const handleMinimize = () => {
    const minimizedChat: MinimizedChat = {
      id: request.id,
      title: request.title,
      favicon: request.media_sites?.favicon || undefined,
      type: 'agency-request',
      unreadCount: 0
    };
    addMinimizedChat(minimizedChat);
    onClose();
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, React.ReactNode> = {
      pending_review: <Badge variant="secondary">Pending</Badge>,
      changes_requested: <Badge variant="outline" className="border-amber-500 text-amber-600">Changes</Badge>,
      accepted: <Badge className="bg-green-600">Accepted</Badge>,
      rejected: <Badge variant="destructive">Rejected</Badge>,
      paid: <Badge className="bg-blue-600">Paid</Badge>,
      cancelled: <Badge variant="destructive">Cancelled</Badge>,
    };
    return badges[status] || <Badge>{status}</Badge>;
  };

  return (
    <div
      className="fixed bg-background border rounded-t-lg shadow-2xl shadow-black/25 flex flex-col overflow-hidden"
      style={{
        width: '550px',
        maxWidth: 'calc(100vw - 32px)',
        height: '500px',
        maxHeight: 'calc(100vh - 100px)',
        left: `calc(50% + ${localPosition.x}px)`,
        top: `calc(50% + ${localPosition.y}px)`,
        transform: 'translate(-50%, -50%)',
        zIndex
      }}
    >
      {/* Header */}
      <div 
        className={`px-4 py-2 border-b ${isCancelled ? 'bg-red-500/20' : 'bg-muted/30'} ${isDragging ? 'cursor-grabbing' : 'cursor-grab'} select-none`}
        onMouseDown={handleDragStart}
      >
        <div className="flex justify-center mb-1">
          <GripHorizontal className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {request.media_sites?.favicon && (
              <img src={request.media_sites.favicon} alt="" className="w-8 h-8 rounded" />
            )}
            <div className="flex flex-col">
              <h3 className="font-semibold text-sm">{request.title}</h3>
              <span className="text-xs text-muted-foreground">
                {request.media_sites?.name} • {request.profiles?.email}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {getStatusBadge(request.status)}
            {!hasJoined && !isCancelled && (
              <Button size="sm" variant="outline" onClick={handleJoinChat} disabled={joiningChat} className="h-7 text-xs ml-2">
                {joiningChat ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <UserPlus className="h-3 w-3 mr-1" />}
                Join
              </Button>
            )}
            {hasJoined && <Badge variant="outline" className="bg-green-50 text-green-700 ml-2">Joined</Badge>}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black ml-1"
              onClick={handleMinimize}
              title="Minimize"
            >
              <Minus className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
              onClick={onClose}
              title="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Cancellation notice */}
      {isCancelled && (
        <div className="px-4 py-2 bg-destructive/5 border-b">
          <p className="text-sm text-destructive font-medium">This engagement has been cancelled.</p>
          {request.cancellation_reason && (
            <p className="text-sm text-muted-foreground">{request.cancellation_reason}</p>
          )}
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4">
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.sender_type === 'client' ? 'justify-start' : m.sender_type === 'admin' ? 'justify-center' : 'justify-end'}`}>
              <div className={`max-w-[80%] p-3 rounded-lg ${
                m.sender_type === 'client' 
                  ? 'bg-muted' 
                  : m.sender_type === 'agency' 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-amber-100 dark:bg-amber-900/30 border border-amber-300'
              }`}>
                <p className="text-xs opacity-70 mb-1 capitalize">{m.sender_type}</p>
                <p className="text-sm whitespace-pre-wrap">{m.message}</p>
                <p className="text-xs opacity-50 mt-1">{format(new Date(m.created_at), 'MMM d, h:mm a')}</p>
              </div>
            </div>
          ))}
          
          {/* Typing indicators */}
          {typingUsers.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span>
                {typingUsers.map(u => 
                  u.type === 'admin' ? 'Admin' : u.type === 'agency' ? 'Agency' : 'Client'
                ).filter((v, i, a) => a.indexOf(v) === i).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
              </span>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      {hasJoined && !isCancelled && (
        <div className="p-4 border-t">
          <div className="flex gap-2">
            <Input
              placeholder="Type a message..."
              value={newMessage}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  sendTypingIndicator(false);
                  handleSendMessage();
                }
              }}
              disabled={sending}
            />
            <Button onClick={() => { sendTypingIndicator(false); handleSendMessage(); }} disabled={sending || !newMessage.trim()}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}

      {!hasJoined && !isCancelled && (
        <div className="p-4 border-t text-center text-muted-foreground text-sm">
          Join the chat to send messages
        </div>
      )}
    </div>
  );
}
