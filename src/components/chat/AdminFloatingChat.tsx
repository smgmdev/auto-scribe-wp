import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Send, UserPlus, X, GripHorizontal, Info, ChevronDown, LogOut, ExternalLink, Building2, Clock, CheckCircle, ShoppingCart, Copy, Reply, User, MoreVertical, Mail, Calendar, Truck, RefreshCw, Phone, XCircle, Package, Scale } from 'lucide-react';
import amblackLogo from '@/assets/amblack-2.png';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { useAppStore } from '@/stores/appStore';

interface ServiceRequest {
  id: string;
  title: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
  order_id: string | null;
  cancellation_reason: string | null;
  user_id: string;
  agency_payout_id: string | null;
  media_sites: { 
    id?: string;
    name: string; 
    favicon: string | null; 
    price: number;
    link?: string;
    category?: string;
    subcategory?: string;
    publication_format?: string;
    agency?: string;
    about?: string;
  };
  profiles: { email: string; username: string | null };
  agency_payouts: { agency_name: string } | null;
}

interface ServiceMessage {
  id: string;
  sender_type: 'client' | 'agency' | 'admin';
  sender_id?: string;
  message: string;
  created_at: string;
}

interface OrderDetails {
  id: string;
  order_number: string | null;
  amount_cents: number;
  status: string;
  delivery_status: string;
  delivery_url: string | null;
  delivery_notes: string | null;
  delivery_deadline: string | null;
  created_at: string;
  paid_at: string | null;
  delivered_at: string | null;
  accepted_at: string | null;
}

interface AgencyDetails {
  agency_name: string;
  email: string | null;
  onboarding_complete: boolean;
  created_at: string;
  logo_url: string | null;
}

interface ClientDetails {
  id: string;
  email: string | null;
  username: string | null;
  created_at: string;
  email_verified: boolean;
  suspended: boolean;
  whatsapp_phone: string | null;
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
  const { incrementUnreadMessageCount } = useAppStore();
  
  const [messages, setMessages] = useState<ServiceMessage[]>(initialMessages);
  const [loadingMessages, setLoadingMessages] = useState(initialMessages.length === 0);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);
  const [joiningChat, setJoiningChat] = useState(false);
  const [leavingChat, setLeavingChat] = useState(false);
  const [typingUsers, setTypingUsers] = useState<{ type: string; user_id: string }[]>([]);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [replyToMessage, setReplyToMessage] = useState<ServiceMessage | null>(null);
  
  // Dialogs
  const [mediaListingOpen, setMediaListingOpen] = useState(false);
  const [agencyDetailsOpen, setAgencyDetailsOpen] = useState(false);
  const [agencyDetails, setAgencyDetails] = useState<AgencyDetails | null>(null);
  const [loadingAgency, setLoadingAgency] = useState(false);
  const [orderDetailsOpen, setOrderDetailsOpen] = useState(false);
  const [orderDetails, setOrderDetails] = useState<OrderDetails | null>(null);
  const [loadingOrderDetails, setLoadingOrderDetails] = useState(false);
  const [clientDetailsOpen, setClientDetailsOpen] = useState(false);
  const [clientDetails, setClientDetails] = useState<ClientDetails | null>(null);
  const [loadingClient, setLoadingClient] = useState(false);
  const [logoLoading, setLogoLoading] = useState(false);
  
  // Presence tracking
  const [clientPresence, setClientPresence] = useState<{ online: boolean; lastSeen: string | null }>({ online: false, lastSeen: null });
  const [agencyPresence, setAgencyPresence] = useState<{ online: boolean; lastSeen: string | null }>({ online: false, lastSeen: null });
  
  // Drag state
  const [localPosition, setLocalPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const userPresenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const [, setTimerTick] = useState(0); // Force re-render for last seen updates
  
  // Auto-focus input when chat opens
  useEffect(() => {
    // Small delay to ensure the input is rendered
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);
  
  // Auto-focus when this chat is clicked/focused
  useEffect(() => {
    inputRef.current?.focus();
  }, [zIndex]);
  
  const isCancelled = request.status === 'cancelled';
  
  // Fetch messages if not provided
  useEffect(() => {
    if (initialMessages.length > 0) {
      setMessages(initialMessages);
      setLoadingMessages(false);
      return;
    }
    
    const fetchMessages = async () => {
      setLoadingMessages(true);
      const { data } = await supabase
        .from('service_messages')
        .select('*')
        .eq('request_id', request.id)
        .order('created_at', { ascending: true });
      
      setMessages((data as ServiceMessage[]) || []);
      setLoadingMessages(false);
    };
    
    fetchMessages();
  }, [request.id, initialMessages]);
  const hasOrder = !!request.order_id;
  
  // Timer tick to update relative time display every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setTimerTick(tick => tick + 1);
    }, 60000); // Update every minute for "Xm ago" display
    
    return () => clearInterval(interval);
  }, []);

  // Parse special message types
  const parseOrderPlaced = (message: string): { type: string; media_site_id: string; media_site_name: string; credits_used: number; order_id: string; delivery_deadline?: string } | null => {
    const match = message.match(/\[ORDER_PLACED\](.*?)\[\/ORDER_PLACED\]/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    }
    return null;
  };

  const parseOrderCancelled = (message: string): { type: string; media_site_id: string; media_site_name: string; credits_refunded: number; order_id: string; cancelled_by?: string; reason?: string | null } | null => {
    const match = message.match(/\[ORDER_CANCELLED\](.*?)\[\/ORDER_CANCELLED\]/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    }
    return null;
  };

  const parseCancelOrderRequest = (message: string): { type: string; order_id: string; media_site_id?: string; media_site_name: string; reason?: string; requester_type: string } | null => {
    const match = message.match(/\[CANCEL_ORDER_REQUEST\](.*?)\[\/CANCEL_ORDER_REQUEST\]/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    }
    return null;
  };

  const parseCancelOrderAccepted = (message: string): { type: string; order_id: string; media_site_name: string; credits_refunded: number; accepted_by: string } | null => {
    const match = message.match(/\[CANCEL_ORDER_ACCEPTED\](.*?)\[\/CANCEL_ORDER_ACCEPTED\]/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    }
    return null;
  };

  const parseOrderDelivered = (message: string): { type: string; order_id: string; media_site_id?: string; media_site_name: string; delivery_url?: string | null; delivery_notes?: string | null; delivered_by: string } | null => {
    const match = message.match(/\[ORDER_DELIVERED\](.*?)\[\/ORDER_DELIVERED\]/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    }
    return null;
  };

  const parseDeliveryAccepted = (message: string): { type: string; order_id: string; media_site_name: string } | null => {
    const match = message.match(/\[DELIVERY_ACCEPTED\](.*?)\[\/DELIVERY_ACCEPTED\]/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    }
    return null;
  };

  const parseRevisionRequested = (message: string): { type: string; order_id: string; media_site_name: string; reason: string } | null => {
    const match = message.match(/\[REVISION_REQUESTED\](.*?)\[\/REVISION_REQUESTED\]/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    }
    return null;
  };

  const parseDisputeResolved = (message: string): { type: string; reason: string; resolved_by: string; credits_refunded?: number } | null => {
    const match = message.match(/\[DISPUTE_RESOLVED\]([\s\S]*?)\[\/DISPUTE_RESOLVED\]/);
    if (match) {
      try {
        return JSON.parse(match[1].trim());
      } catch {
        return null;
      }
    }
    return null;
  };

  // Parse quoted/reply messages
  const parseQuote = (message: string): { originalId: string | null; quoteText: string; replyText: string } | null => {
    if (!message.startsWith('> ')) return null;
    const parts = message.split('\n\n');
    const quotePart = parts[0].substring(2);
    const replyText = parts.slice(1).join('\n\n');
    
    const idMatch = quotePart.match(/^\[([^\]]+)\]:(.*)$/);
    if (idMatch) {
      return { originalId: idMatch[1], quoteText: idMatch[2], replyText };
    }
    return { originalId: null, quoteText: quotePart, replyText };
  };

  // Get the actual reply content from a message, excluding any quoted content
  const getReplyContentOnly = (message: string): string => {
    let cleanMessage = message;
    // If message starts with quote format, extract only the reply part (after \n\n)
    if (cleanMessage.startsWith('> ')) {
      const parts = cleanMessage.split('\n\n');
      if (parts.length > 1) {
        return parts.slice(1).join('\n\n').trim();
      }
    }
    return cleanMessage;
  };

  const scrollToMessage = (messageId: string) => {
    const element = document.getElementById(`admin-msg-${request.id}-${messageId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMessageId(messageId);
      setTimeout(() => setHighlightedMessageId(null), 2000);
    }
  };

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
  const initialScrollDoneRef = useRef(false);
  
  useEffect(() => {
    if (messages.length === 0) return;
    
    // Use longer delay for initial scroll to ensure content is rendered
    const delay = initialScrollDoneRef.current ? 50 : 200;
    
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      initialScrollDoneRef.current = true;
    }, delay);
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

  // Fetch initial last_online_at from database
  useEffect(() => {
    const fetchLastOnline = async () => {
      // Fetch client's last_online_at from profiles
      const { data: clientData } = await supabase
        .from('profiles')
        .select('last_online_at')
        .eq('id', request.user_id)
        .maybeSingle();
      
      if (clientData?.last_online_at) {
        setClientPresence(prev => ({ ...prev, lastSeen: clientData.last_online_at }));
      }
      
      // Fetch agency's last_online_at from agency_payouts
      if (request.agency_payout_id) {
        const { data: agencyData } = await supabase
          .from('agency_payouts')
          .select('last_online_at')
          .eq('id', request.agency_payout_id)
          .maybeSingle();
        
        if (agencyData?.last_online_at) {
          setAgencyPresence(prev => ({ ...prev, lastSeen: agencyData.last_online_at }));
        }
      }
    };
    
    fetchLastOnline();
  }, [request.user_id, request.agency_payout_id]);

  // User presence tracking (client and agency online status)
  useEffect(() => {
    const channelName = `presence-${request.id}`;
    const channel = supabase.channel(channelName);

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        let clientOnline = false;
        let agencyOnline = false;
        
        Object.values(state).forEach((presences: any) => {
          presences.forEach((p: any) => {
            if (p.user_type === 'client') {
              clientOnline = true;
            } else if (p.user_type === 'agency') {
              agencyOnline = true;
            }
          });
        });
        
        setClientPresence(prev => ({ ...prev, online: clientOnline }));
        setAgencyPresence(prev => ({ ...prev, online: agencyOnline }));
      })
      .on('presence', { event: 'leave' }, async ({ leftPresences }: any) => {
        for (const p of leftPresences) {
          const now = new Date().toISOString();
          if (p.user_type === 'client') {
            setClientPresence({ online: false, lastSeen: now });
            // Update database
            await supabase
              .from('profiles')
              .update({ last_online_at: now })
              .eq('id', request.user_id);
          } else if (p.user_type === 'agency' && request.agency_payout_id) {
            setAgencyPresence({ online: false, lastSeen: now });
            // Update database
            await supabase
              .from('agency_payouts')
              .update({ last_online_at: now })
              .eq('id', request.agency_payout_id);
          }
        }
      })
      .subscribe();

    userPresenceChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      userPresenceChannelRef.current = null;
    };
  }, [request.id, request.user_id, request.agency_payout_id]);

  // Format relative time
  const formatLastSeen = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return format(date, 'MMM d, HH:mm');
  };

  // Get last seen from presence state
  const clientLastSeen = clientPresence.lastSeen;
  const agencyLastSeen = agencyPresence.lastSeen;

  // Drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, input, [role="button"]')) return;
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
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
      // Create investigation record
      const { error } = await supabase
        .from('admin_investigations')
        .upsert({
          admin_id: user.id,
          service_request_id: request.id,
          order_id: request.order_id || request.id,
          status: 'active'
        }, { onConflict: 'service_request_id' });

      if (error) throw error;

      // Send join message
      const joinMessage = '[ADMIN_JOINED]Arcana Mace Staff has entered the chat.[/ADMIN_JOINED]';
      await supabase.from('service_messages').insert({
        request_id: request.id,
        sender_id: user.id,
        sender_type: 'admin',
        message: joinMessage
      });

      // Notify client (user_id)
      const clientNotifyChannel = supabase.channel(`notify-${request.user_id}`);
      clientNotifyChannel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await clientNotifyChannel.send({
            type: 'broadcast',
            event: 'admin-joined',
            payload: {
              requestId: request.id,
              message: 'Arcana Mace Staff has entered the chat.'
            }
          });
          setTimeout(() => supabase.removeChannel(clientNotifyChannel), 500);
        }
      });
      
      // Notify agency (agency_payout_id)
      if (request.agency_payout_id) {
        const agencyNotifyChannel = supabase.channel(`notify-${request.agency_payout_id}`);
        agencyNotifyChannel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await agencyNotifyChannel.send({
              type: 'broadcast',
              event: 'admin-joined',
              payload: {
                requestId: request.id,
                message: 'Arcana Mace Staff has entered the chat.'
              }
            });
            setTimeout(() => supabase.removeChannel(agencyNotifyChannel), 500);
          }
        });
      }

      setHasJoined(true);
      toast({ title: 'Joined chat', description: 'You can now participate in this engagement.' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setJoiningChat(false);
    }
  };

  const handleLeaveChat = async () => {
    if (!user) return;
    setLeavingChat(true);
    try {
      // Send leave message
      const leaveMessage = '[ADMIN_LEFT]Arcana Mace Staff has left the chat.[/ADMIN_LEFT]';
      await supabase.from('service_messages').insert({
        request_id: request.id,
        sender_id: user.id,
        sender_type: 'admin',
        message: leaveMessage
      });

      // Delete investigation record when admin leaves
      await supabase
        .from('admin_investigations')
        .delete()
        .eq('service_request_id', request.id)
        .eq('admin_id', user.id);

      // Notify client (user_id)
      const clientNotifyChannel = supabase.channel(`notify-${request.user_id}`);
      clientNotifyChannel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await clientNotifyChannel.send({
            type: 'broadcast',
            event: 'admin-left',
            payload: {
              requestId: request.id,
              message: 'Arcana Mace Staff has left the chat.'
            }
          });
          setTimeout(() => supabase.removeChannel(clientNotifyChannel), 500);
        }
      });
      
      // Notify agency (agency_payout_id)
      if (request.agency_payout_id) {
        const agencyNotifyChannel = supabase.channel(`notify-${request.agency_payout_id}`);
        agencyNotifyChannel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await agencyNotifyChannel.send({
              type: 'broadcast',
              event: 'admin-left',
              payload: {
                requestId: request.id,
                message: 'Arcana Mace Staff has left the chat.'
              }
            });
            setTimeout(() => supabase.removeChannel(agencyNotifyChannel), 500);
          }
        });
      }

      setHasJoined(false);
      toast({ title: 'Left chat', description: 'You have left the conversation.' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setLeavingChat(false);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !user) return;
    setSending(true);
    sendTypingIndicator(false);
    
    try {
      let messageContent = newMessage.trim();
      
      // If replying, prepend the quote (only include the reply content, not nested quotes)
      if (replyToMessage) {
        const quoteText = getReplyContentOnly(replyToMessage.message).substring(0, 100);
        messageContent = `> [${replyToMessage.id}]:${quoteText}\n\n${messageContent}`;
      }
      
      const { error } = await supabase.from('service_messages').insert({
        request_id: request.id,
        sender_id: user.id,
        sender_type: 'admin',
        message: messageContent
      });

      if (error) throw error;

      const newMsg: ServiceMessage = {
        id: crypto.randomUUID(),
        sender_type: 'admin',
        message: messageContent,
        created_at: new Date().toISOString()
      };
      
      setMessages(prev => {
        const updated = [...prev, newMsg];
        onMessagesUpdate(request.id, updated);
        return updated;
      });
      setNewMessage('');
      setReplyToMessage(null);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setSending(false);
    }
  };

  const fetchAgencyDetails = async (agencyName: string) => {
    setLoadingAgency(true);
    setLogoLoading(true);
    try {
      const { data } = await supabase
        .from('agency_payouts')
        .select('agency_name, email, onboarding_complete, created_at')
        .eq('agency_name', agencyName)
        .maybeSingle();
      
      if (data) {
        const { data: appData } = await supabase
          .from('agency_applications')
          .select('logo_url')
          .eq('agency_name', agencyName)
          .maybeSingle();
        
        let logoUrl: string | null = null;
        
        // Get signed URL for logo if exists
        if (appData?.logo_url) {
          console.log('Fetching signed URL for logo:', appData.logo_url);
          const { data: signed, error: signError } = await supabase.storage
            .from('agency-documents')
            .createSignedUrl(appData.logo_url, 3600);
          console.log('Signed URL result:', { signed, signError });
          if (!signError && signed?.signedUrl) {
            logoUrl = signed.signedUrl;
          }
        }
        
        setAgencyDetails({
          ...data,
          logo_url: logoUrl
        });
        setAgencyDetailsOpen(true);
      }
    } catch (error) {
      console.error('Error fetching agency:', error);
    } finally {
      setLoadingAgency(false);
    }
  };

  const fetchOrderDetails = async () => {
    if (!request.order_id) return;
    setLoadingOrderDetails(true);
    setOrderDetailsOpen(true);
    try {
      const { data } = await supabase
        .from('orders')
        .select('id, order_number, amount_cents, status, delivery_status, delivery_url, delivery_notes, delivery_deadline, created_at, paid_at, delivered_at, accepted_at')
        .eq('id', request.order_id)
        .maybeSingle();
      setOrderDetails(data);
    } catch (error) {
      console.error('Error fetching order:', error);
    } finally {
      setLoadingOrderDetails(false);
    }
  };

  const fetchClientDetails = async (userId?: string) => {
    const clientId = userId || request.user_id;
    if (!clientId) return;
    
    setLoadingClient(true);
    setClientDetailsOpen(true);
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, email, username, created_at, email_verified, suspended, whatsapp_phone')
        .eq('id', clientId)
        .maybeSingle();
      
      setClientDetails(data);
    } catch (error) {
      console.error('Error fetching client:', error);
    } finally {
      setLoadingClient(false);
    }
  };

  const fetchAgencyDetailsBySenderId = async (senderId: string) => {
    setLoadingAgency(true);
    setLogoLoading(true);
    setAgencyDetailsOpen(true);
    try {
      const { data } = await supabase
        .from('agency_payouts')
        .select('agency_name, email, onboarding_complete, created_at')
        .eq('user_id', senderId)
        .maybeSingle();
      
      if (data) {
        const { data: appData } = await supabase
          .from('agency_applications')
          .select('logo_url')
          .eq('agency_name', data.agency_name)
          .maybeSingle();
        
        let logoUrl: string | null = null;
        
        // Get signed URL for logo if exists
        if (appData?.logo_url) {
          console.log('fetchAgencyDetailsBySenderId - Fetching signed URL for logo:', appData.logo_url);
          const { data: signed, error: signError } = await supabase.storage
            .from('agency-documents')
            .createSignedUrl(appData.logo_url, 3600);
          console.log('fetchAgencyDetailsBySenderId - Signed URL result:', { signed, signError });
          if (!signError && signed?.signedUrl) {
            logoUrl = signed.signedUrl;
          }
        }
        
        setAgencyDetails({
          ...data,
          logo_url: logoUrl
        });
      } else {
        // Fallback: try agency_payout_id from request
        if (request.agency_payout_id) {
          const { data: agencyData } = await supabase
            .from('agency_payouts')
            .select('agency_name, email, onboarding_complete, created_at')
            .eq('id', request.agency_payout_id)
            .maybeSingle();
          
          if (agencyData) {
            const { data: appData } = await supabase
              .from('agency_applications')
              .select('logo_url')
              .eq('agency_name', agencyData.agency_name)
              .maybeSingle();
            
            let logoUrl: string | null = null;
            
            // Get signed URL for logo if exists
            if (appData?.logo_url) {
              const { data: signed, error: signError } = await supabase.storage
                .from('agency-documents')
                .createSignedUrl(appData.logo_url, 3600);
              if (!signError && signed?.signedUrl) {
                logoUrl = signed.signedUrl;
              }
            }
            
            setAgencyDetails({
              ...agencyData,
              logo_url: logoUrl
            });
          }
        }
      }
    } catch (error) {
      console.error('Error fetching agency:', error);
    } finally {
      setLoadingAgency(false);
    }
  };

  const handleUserDetails = (msg: ServiceMessage) => {
    if (msg.sender_type === 'client') {
      fetchClientDetails(msg.sender_id);
    } else if (msg.sender_type === 'agency') {
      if (msg.sender_id) {
        fetchAgencyDetailsBySenderId(msg.sender_id);
      } else if (request.media_sites?.agency) {
        fetchAgencyDetails(request.media_sites.agency);
      }
    }
  };

  const formatTimeRemaining = (deadline: string) => {
    const now = new Date();
    const target = new Date(deadline);
    const diff = target.getTime() - now.getTime();
    
    if (diff <= 0) return { text: 'Overdue', isOverdue: true };
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return { text: `${days}d ${hours % 24}h`, isOverdue: false };
    }
    return { text: `${hours}h ${minutes}m`, isOverdue: false };
  };

  // Render message content with special message handling
  const renderMessageContent = (msg: ServiceMessage, isOwnMessage: boolean) => {
    const orderPlaced = parseOrderPlaced(msg.message);
    const orderCancelled = parseOrderCancelled(msg.message);
    const cancelRequest = parseCancelOrderRequest(msg.message);
    const cancelAccepted = parseCancelOrderAccepted(msg.message);
    const orderDelivered = parseOrderDelivered(msg.message);
    const deliveryAccepted = parseDeliveryAccepted(msg.message);
    const revisionRequested = parseRevisionRequested(msg.message);
    const disputeResolved = parseDisputeResolved(msg.message);
    const quote = parseQuote(msg.message);

    // Debug log for dispute resolved parsing
    if (msg.message.includes('DISPUTE_RESOLVED')) {
      console.log('[AdminFloatingChat] Dispute resolved message detected:', { 
        message: msg.message.substring(0, 100), 
        parsed: disputeResolved 
      });
    }

    // Handle dispute resolved message
    if (disputeResolved) {
      const isCompleted = disputeResolved.type === 'dispute_resolved_complete';
      return (
        <div className="space-y-1">
          <div className={`rounded-lg border p-3 ${isCompleted ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800' : 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800'}`}>
            <div className="flex items-center gap-2 mb-2">
              <Scale className={`h-4 w-4 ${isCompleted ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'}`} />
              <span className={`font-semibold text-sm ${isCompleted ? 'text-green-700 dark:text-green-300' : 'text-orange-700 dark:text-orange-300'}`}>
                Dispute Resolved
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {isCompleted ? 'Order marked as completed by Arcana Mace Staff' : 'Order cancelled by Arcana Mace Staff'}
            </p>
            {disputeResolved.reason && (
              <p className="text-xs mt-2 text-muted-foreground">
                Reason: {disputeResolved.reason}
              </p>
            )}
            {!isCompleted && disputeResolved.credits_refunded !== undefined && (
              <p className="text-xs mt-1 text-muted-foreground">
                {disputeResolved.credits_refunded} credits refunded to client
              </p>
            )}
          </div>
          <p className="text-xs opacity-50">
            {format(new Date(msg.created_at), 'HH:mm')}
          </p>
        </div>
      );
    }

    // Handle order delivered message
    if (orderDelivered) {
      return (
        <div className="space-y-1">
          <div className="rounded-lg border p-4 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/40 dark:to-emerald-950/40 border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2 mb-2">
              <Truck className="h-4 w-4 text-green-600 dark:text-green-400" />
              <span className="font-semibold text-sm text-green-700 dark:text-green-300">
                Order Delivered
              </span>
            </div>
            <p className="text-sm font-medium text-foreground">
              {orderDelivered.media_site_name}
            </p>
            <p className="text-sm mt-2 text-muted-foreground">
              Delivery has been submitted for client review.
            </p>
            {orderDelivered.delivery_url && (
              <div className="mt-2">
                <a 
                  href={orderDelivered.delivery_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  View Delivery
                </a>
              </div>
            )}
            {orderDelivered.delivery_notes && (
              <p className="text-xs mt-2 text-muted-foreground">
                Notes: {orderDelivered.delivery_notes}
              </p>
            )}
          </div>
          <p className="text-xs opacity-50">
            {format(new Date(msg.created_at), 'HH:mm')}
          </p>
        </div>
      );
    }

    // Handle delivery accepted message
    if (deliveryAccepted) {
      return (
        <div className="space-y-1">
          <div className="rounded-lg border p-3 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2 mb-2">
              <Package className="h-4 w-4 text-green-600 dark:text-green-400" />
              <span className="font-semibold text-sm text-green-700 dark:text-green-300">
                Delivery Accepted
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Client accepted the delivery for {deliveryAccepted.media_site_name}
            </p>
            <p className="text-xs mt-1 text-muted-foreground">
              Order has been marked as completed
            </p>
          </div>
          <p className="text-xs opacity-50">
            {format(new Date(msg.created_at), 'HH:mm')}
          </p>
        </div>
      );
    }

    // Handle revision requested message
    if (revisionRequested) {
      return (
        <div className="space-y-1">
          <div className="rounded-lg border p-3 bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800">
            <div className="flex items-center gap-2 mb-2">
              <RefreshCw className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              <span className="font-semibold text-sm text-orange-700 dark:text-orange-300">
                Revision Requested
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Client requested a revision for {revisionRequested.media_site_name}
            </p>
            <p className="text-xs mt-1 italic text-muted-foreground">
              Reason: {revisionRequested.reason}
            </p>
          </div>
          <p className="text-xs opacity-50">
            {format(new Date(msg.created_at), 'HH:mm')}
          </p>
        </div>
      );
    }
    
    // Handle cancel order request message
    if (cancelRequest) {
      const msgIndex = messages.findIndex(m => m.id === msg.id);
      const hasAcceptance = messages.slice(msgIndex + 1).some(m => parseCancelOrderAccepted(m.message));
      const isPending = !hasAcceptance;

      return (
        <div className="space-y-1">
          <div className="rounded-lg border p-3 bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800">
            <div className="flex items-center gap-2 mb-2">
              <X className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              <span className="font-semibold text-sm text-orange-700 dark:text-orange-300">
                Cancellation Request
              </span>
              {!isPending && (
                <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                  Accepted
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {cancelRequest.requester_type === 'client' ? 'Client' : 'Agency'} requested to cancel the order for {cancelRequest.media_site_name}
            </p>
            {cancelRequest.reason && (
              <p className="text-xs mt-1 italic text-muted-foreground">
                Reason: {cancelRequest.reason}
              </p>
            )}
          </div>
          <p className="text-xs opacity-50">
            {format(new Date(msg.created_at), 'HH:mm')}
          </p>
        </div>
      );
    }

    // Handle cancel order accepted message
    if (cancelAccepted) {
      return (
        <div className="space-y-1">
          <div className="rounded-lg border p-3 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
              <span className="font-semibold text-sm text-green-700 dark:text-green-300">
                Cancellation Accepted
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Order for {cancelAccepted.media_site_name} has been cancelled mutually
            </p>
            <p className="text-xs mt-1 text-muted-foreground">
              {cancelAccepted.credits_refunded} credits refunded to client
            </p>
          </div>
          <p className="text-xs opacity-50">
            {format(new Date(msg.created_at), 'HH:mm')}
          </p>
        </div>
      );
    }
    
    // Handle order placed special message
    if (orderPlaced) {
      const timeInfo = orderPlaced.delivery_deadline ? formatTimeRemaining(orderPlaced.delivery_deadline) : null;
      
      return (
        <div className="space-y-1">
          <div className="rounded-lg border p-3 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2 mb-2">
              <ShoppingCart className="h-4 w-4 text-green-600 dark:text-green-400" />
              <span className="font-semibold text-sm text-green-700 dark:text-green-300">Order Placed</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {orderPlaced.media_site_name}
            </p>
            <p className="text-xs mt-1 text-muted-foreground">
              {orderPlaced.credits_used} credits
            </p>
            {timeInfo && (
              <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-green-200 dark:border-green-800">
                <Clock className={`h-3.5 w-3.5 ${timeInfo.isOverdue ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`} />
                <span className={`text-xs font-medium ${timeInfo.isOverdue ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>
                  {timeInfo.isOverdue ? 'Delivery overdue' : `Expected delivery in: ${timeInfo.text}`}
                </span>
              </div>
            )}
          </div>
          <p className="text-xs opacity-50">
            {format(new Date(msg.created_at), 'HH:mm')}
          </p>
        </div>
      );
    }

    // Handle order cancelled special message
    if (orderCancelled) {
      const cancelledByAdmin = orderCancelled.cancelled_by === 'admin';
      
      return (
        <div className="space-y-1">
          <div className="rounded-lg border p-3 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800">
            <div className="flex items-center gap-2 mb-2">
              <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
              <span className="font-semibold text-sm text-red-700 dark:text-red-300">Order Cancelled</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {orderCancelled.media_site_name}
            </p>
            <p className="text-xs mt-1 text-muted-foreground">
              {orderCancelled.credits_refunded} credits refunded
            </p>
            {cancelledByAdmin && (
              <div className="mt-2 pt-2 border-t border-red-200 dark:border-red-800">
                <p className="text-xs font-medium text-red-600 dark:text-red-400">
                  Cancelled by Arcana Mace Staff
                </p>
                {orderCancelled.reason && (
                  <p className="text-xs mt-1 italic text-muted-foreground">
                    Reason: {orderCancelled.reason}
                  </p>
                )}
              </div>
            )}
          </div>
          <p className="text-xs opacity-50">
            {format(new Date(msg.created_at), 'HH:mm')}
          </p>
        </div>
      );
    }

    // Get display message (handle quoted messages)
    let displayMessage = msg.message;
    if (quote) {
      displayMessage = quote.replyText;
    }

    // Find the original message to get sender info for the quote
    const getQuoteSenderLabel = () => {
      if (!quote?.originalId) return null;
      const originalMsg = messages.find(m => m.id === quote.originalId);
      if (!originalMsg) return null;
      if (originalMsg.sender_type === 'admin') return 'You';
      if (originalMsg.sender_type === 'agency') return 'Agency';
      return 'Client';
    };
    
    // Clean up quote text - remove any "> [id]:" format that might be nested
    const getCleanQuoteText = () => {
      if (!quote) return '';
      let text = quote.quoteText;
      // Remove any leading "> " and "[id]:" patterns
      text = text.replace(/^> /, '');
      text = text.replace(/^\[[^\]]+\]:/, '');
      return text.trim();
    };
    
    const quoteSenderLabel = getQuoteSenderLabel();
    const cleanQuoteText = getCleanQuoteText();

    // Regular message with quote support
    return (
      <div className="space-y-2">
        {quote && (
          <div 
            className={`text-xs p-2 rounded border-l-2 cursor-pointer ${
              isOwnMessage 
                ? 'bg-primary-foreground/10 border-primary-foreground/30' 
                : 'bg-muted/50 border-muted-foreground/30'
            }`}
            onClick={() => quote.originalId && scrollToMessage(quote.originalId)}
          >
            {quoteSenderLabel && (
              <p className="font-medium opacity-80 mb-0.5">{quoteSenderLabel}</p>
            )}
            <p className="opacity-70 line-clamp-2">{cleanQuoteText}</p>
          </div>
        )}
        {displayMessage && (
          <p className="text-sm whitespace-pre-wrap break-words">{displayMessage}</p>
        )}
        <p className="text-xs opacity-50 mt-1">
          {format(new Date(msg.created_at), 'HH:mm')}
        </p>
      </div>
    );
  };

  return (
    <>
      {/* Floating Chat Window - No backdrop, allows interaction with the rest of the app */}
      <div
        className="fixed bg-background border rounded-t-lg shadow-2xl shadow-black/25 flex flex-col overflow-hidden"
        style={{
          width: '600px',
          maxWidth: 'calc(100vw - 32px)',
          height: '550px',
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
                <h3 className="font-semibold text-sm">{request.media_sites?.name || request.title}</h3>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <span className="font-medium">Client:</span>
                    {clientPresence.online ? (
                      <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                        Online now
                      </span>
                    ) : clientLastSeen ? (
                      <span>Last seen {formatLastSeen(clientLastSeen)}</span>
                    ) : (
                      <span>—</span>
                    )}
                  </span>
                  {request.agency_payouts?.agency_name && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <span className="font-medium">Agency:</span>
                      {agencyPresence.online ? (
                        <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                          Online now
                        </span>
                      ) : agencyLastSeen ? (
                        <span>Last seen {formatLastSeen(agencyLastSeen)}</span>
                      ) : (
                        <span>—</span>
                      )}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 gap-1 text-xs hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black data-[state=open]:bg-black data-[state=open]:text-white dark:data-[state=open]:bg-white dark:data-[state=open]:text-black"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    Action
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40 bg-popover border shadow-lg" style={{ zIndex: 99999 }}>
                  {!hasJoined && !isCancelled && (
                    <DropdownMenuItem 
                      className="cursor-pointer focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black"
                      onClick={handleJoinChat}
                      disabled={joiningChat}
                    >
                      {joiningChat ? 'Joining...' : 'Join Chat'}
                    </DropdownMenuItem>
                  )}
                  {hasJoined && !isCancelled && (
                    <DropdownMenuItem 
                      className="cursor-pointer text-destructive focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black"
                      onClick={handleLeaveChat}
                      disabled={leavingChat}
                    >
                      {leavingChat ? 'Leaving...' : 'Leave Chat'}
                    </DropdownMenuItem>
                  )}
                  {hasOrder && (
                    <DropdownMenuItem 
                      className="cursor-pointer focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black"
                      onClick={fetchOrderDetails}
                    >
                      View Order
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              {request.media_sites && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
                  onClick={() => setMediaListingOpen(true)}
                  title="Media Listing Info"
                >
                  <Info className="h-4 w-4" />
                </Button>
              )}
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

        {/* Order Status Banner */}
        {hasOrder && orderDetails && (
          <div className="p-3 bg-black text-white border-b border-black">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <CheckCircle className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Order Placed</p>
                  {orderDetails.delivery_status === 'pending' && orderDetails.delivery_deadline && (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs text-white/70">Awaiting delivery</span>
                      <span className="text-white/40">•</span>
                      {(() => {
                        const timeInfo = formatTimeRemaining(orderDetails.delivery_deadline);
                        return (
                          <>
                            <Clock className={`h-3 w-3 ${timeInfo.isOverdue ? 'text-red-400' : 'text-white/70'}`} />
                            <span className={`text-xs ${timeInfo.isOverdue ? 'text-red-400' : 'text-white/70'}`}>
                              {timeInfo.isOverdue ? 'Overdue' : timeInfo.text}
                            </span>
                          </>
                        );
                      })()}
                    </div>
                  )}
                  {orderDetails.delivery_status === 'delivered' && (
                    <p className="text-xs text-white/70">Awaiting client approval</p>
                  )}
                  {orderDetails.delivery_status === 'accepted' && (
                    <p className="text-xs text-white/70">Completed</p>
                  )}
                </div>
              </div>
              <Badge 
                variant="secondary" 
                className={`cursor-pointer ${
                  orderDetails.delivery_status === 'accepted' 
                    ? 'bg-green-500 text-white hover:bg-green-600' 
                    : orderDetails.delivery_status === 'delivered'
                    ? 'bg-purple-500 text-white hover:bg-purple-600'
                    : 'bg-white text-black hover:bg-white/80'
                }`}
                onClick={fetchOrderDetails}
              >
                {orderDetails.delivery_status === 'accepted' && 'Completed'}
                {orderDetails.delivery_status === 'delivered' && 'Pending Approval'}
                {orderDetails.delivery_status === 'pending' && 'View Details'}
              </Badge>
            </div>
          </div>
        )}

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
        <ScrollArea className="flex-1">
          {loadingMessages ? (
            <div className="flex flex-col items-center justify-center h-full py-12">
              <img src={amblackLogo} alt="Loading" className="w-16 h-16 animate-pulse mb-4" />
              <p className="text-sm text-muted-foreground">Loading Messages...</p>
            </div>
          ) : (
            <div className="space-y-2 p-3">
              {messages.map((m) => {
                // Check for admin joined message
                const adminJoinedMatch = m.message.match(/\[ADMIN_JOINED\](.*?)\[\/ADMIN_JOINED\]/);
                if (adminJoinedMatch) {
                  return (
                    <p key={m.id} className="text-xs text-muted-foreground text-center py-2">
                      {adminJoinedMatch[1]}
                    </p>
                  );
                }
                
                // Check for admin left message
                const adminLeftMatch = m.message.match(/\[ADMIN_LEFT\](.*?)\[\/ADMIN_LEFT\]/);
                if (adminLeftMatch) {
                  return (
                    <p key={m.id} className="text-xs text-muted-foreground text-center py-2">
                      {adminLeftMatch[1]}
                    </p>
                  );
                }

                const isAdmin = m.sender_type === 'admin';
                const isClient = m.sender_type === 'client';
                const isAgency = m.sender_type === 'agency';

                // Check for special message types
                const orderPlaced = parseOrderPlaced(m.message);
                const orderCancelled = parseOrderCancelled(m.message);
                const cancelRequest = parseCancelOrderRequest(m.message);
                const cancelAccepted = parseCancelOrderAccepted(m.message);
                const isSpecialMessage = orderPlaced || orderCancelled || cancelRequest || cancelAccepted;

                return (
                  <div 
                    key={m.id} 
                    id={`admin-msg-${request.id}-${m.id}`}
                    className={`flex ${isClient ? 'justify-start' : isAgency ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`group relative max-w-[80%] ${isSpecialMessage ? '' : 'p-3 rounded-lg'} transition-all duration-300 ${
                      isSpecialMessage ? '' : (
                        isAdmin 
                          ? 'bg-blue-500 text-white' 
                          : isAgency 
                            ? 'bg-primary text-primary-foreground' 
                            : 'bg-muted'
                      )
                    } ${highlightedMessageId === m.id ? 'ring-2 ring-offset-2 ring-primary' : ''}`}>
                      {/* Message Actions Dropdown */}
                      {!isSpecialMessage && !isAdmin && (
                        <DropdownMenu modal={false}>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className={`absolute top-1 right-1 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity ${
                                isAgency 
                                  ? 'text-primary-foreground hover:bg-primary-foreground/20' 
                                  : 'text-foreground hover:bg-background/50'
                              }`}
                            >
                              <ChevronDown className="h-3 w-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent 
                            align="end" 
                            className="bg-popover border shadow-lg"
                            style={{ zIndex: 99999 }}
                            sideOffset={5}
                          >
                            <DropdownMenuItem 
                              onClick={() => {
                                setReplyToMessage(m);
                                setTimeout(() => inputRef.current?.focus(), 0);
                              }}
                              className="cursor-pointer focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black"
                            >
                              <Reply className="h-4 w-4 mr-2" />
                              Reply
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleUserDetails(m)}
                              className="cursor-pointer focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black"
                            >
                              <User className="h-4 w-4 mr-2" />
                              {m.sender_type === 'client' ? 'Client Details' : 'Agency Details'}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                      {!isSpecialMessage && (
                        <p className="text-xs font-medium mb-1 opacity-70 capitalize pr-5">
                          {isAdmin ? 'Arcana Mace Staff' : m.sender_type}
                        </p>
                      )}
                      {renderMessageContent(m, isAgency || isAdmin)}
                    </div>
                  </div>
                );
              })}
              
              {messages.length === 0 && !loadingMessages && (
                <p className="text-sm text-muted-foreground text-center py-8">No messages yet</p>
              )}
              
              {/* Scroll anchor */}
              <div ref={messagesEndRef} />
            </div>
          )}
        </ScrollArea>

        {/* Typing indicators */}
        {typingUsers.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground border-t">
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

        {/* Input */}
        {!isCancelled && (
          <div className="border-t">
            {!hasJoined ? (
              <div className="flex items-center justify-center py-2 px-3 bg-muted/20">
                <button
                  onClick={handleJoinChat}
                  disabled={joiningChat}
                  className="text-blue-500 hover:text-blue-600 text-sm font-medium flex items-center gap-1.5 disabled:opacity-50"
                >
                  {joiningChat ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <UserPlus className="h-3.5 w-3.5" />
                  )}
                  Join Chat
                </button>
              </div>
            ) : (
              <>
                {replyToMessage && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b">
                    <Reply className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground">
                        Replying to {replyToMessage.sender_type === 'admin' ? 'yourself' : replyToMessage.sender_type}
                      </p>
                      <p className="text-sm truncate">{replyToMessage.message.substring(0, 50)}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => setReplyToMessage(null)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
                <div className="flex items-center">
                  <Input
                    ref={inputRef}
                    placeholder={replyToMessage ? "Type your reply..." : "Type your message..."}
                    value={newMessage}
                    onChange={handleInputChange}
                    disabled={sending}
                    className="rounded-none border-0 flex-1"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && newMessage.trim()) {
                        e.preventDefault();
                        sendTypingIndicator(false);
                        handleSendMessage();
                      }
                    }}
                  />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 shrink-0 rounded-none hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
                  disabled={sending || !newMessage.trim()}
                  onClick={() => { sendTypingIndicator(false); handleSendMessage(); }}
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
                <button
                  onClick={handleLeaveChat}
                  disabled={leavingChat}
                  className="text-muted-foreground hover:text-destructive text-xs px-3 flex items-center gap-1 disabled:opacity-50"
                >
                  {leavingChat ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogOut className="h-3 w-3" />}
                  Leave
                </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Media Listing Dialog */}
      <Dialog open={mediaListingOpen} onOpenChange={setMediaListingOpen}>
        <DialogContent className="sm:max-w-lg z-[9999]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <img
                src={request.media_sites?.favicon || ''}
                alt={request.media_sites?.name}
                className="h-12 w-12 rounded-xl bg-muted object-contain"
              />
              <span>{request.media_sites?.name}</span>
            </DialogTitle>
          </DialogHeader>

          {request.media_sites && (
            <div className="space-y-4 mt-4">
              {request.media_sites.link && (
                <div>
                  <p className="text-sm text-muted-foreground">Website</p>
                  <a 
                    href={request.media_sites.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline flex items-center gap-1"
                  >
                    {(() => {
                      try {
                        return new URL(request.media_sites.link).hostname.replace('www.', '');
                      } catch {
                        return request.media_sites.link;
                      }
                    })()}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
              
              <div className="flex gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Price</p>
                  <p className="text-foreground font-medium">${request.media_sites.price.toLocaleString()}</p>
                </div>
                {request.media_sites.publication_format && (
                  <div>
                    <p className="text-sm text-muted-foreground">Format</p>
                    <Badge variant="secondary">{request.media_sites.publication_format}</Badge>
                  </div>
                )}
              </div>
              
              {request.media_sites.category && (
                <div>
                  <p className="text-sm text-muted-foreground">Category</p>
                  <p className="text-foreground">{request.media_sites.category}</p>
                </div>
              )}
              
              {request.media_sites.subcategory && (
                <div>
                  <p className="text-sm text-muted-foreground">Subcategory</p>
                  <p className="text-foreground">{request.media_sites.subcategory}</p>
                </div>
              )}
              
              {request.media_sites.agency && (
                <div>
                  <p className="text-sm text-muted-foreground">Agency</p>
                  <p 
                    className={`text-blue-600 hover:text-blue-700 cursor-pointer hover:underline transition-colors flex items-center gap-1 ${loadingAgency ? 'pointer-events-none opacity-70' : ''}`}
                    onClick={() => fetchAgencyDetails(request.media_sites.agency!)}
                  >
                    {request.media_sites.agency}
                    {loadingAgency ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Info className="h-3 w-3" />
                    )}
                  </p>
                </div>
              )}
              
              {request.media_sites.about && (
                <div>
                  <p className="text-sm text-muted-foreground">About</p>
                  <p className="text-foreground text-sm">{request.media_sites.about}</p>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 mt-6">
            <Button 
              variant="outline"
              onClick={() => setMediaListingOpen(false)}
              className="hover:bg-black hover:text-white transition-colors"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Agency Details Dialog */}
      <Dialog open={agencyDetailsOpen} onOpenChange={(open) => {
        setAgencyDetailsOpen(open);
        if (!open) setLogoLoading(false);
      }}>
        <DialogContent className="sm:max-w-md z-[10000]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="relative h-12 w-12">
                {loadingAgency ? (
                  <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : agencyDetails?.logo_url ? (
                  <>
                    {logoLoading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-muted rounded-xl">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    )}
                    <img 
                      src={agencyDetails.logo_url} 
                      alt={agencyDetails.agency_name}
                      className={`h-12 w-12 rounded-xl bg-muted object-contain ${logoLoading ? 'opacity-0' : 'opacity-100'}`}
                      onLoad={() => setLogoLoading(false)}
                      onError={() => setLogoLoading(false)}
                    />
                  </>
                ) : (
                  <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center">
                    <Building2 className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
              </div>
              <span>{agencyDetails?.agency_name || 'Agency Details'}</span>
            </DialogTitle>
          </DialogHeader>

          {loadingAgency ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : agencyDetails ? (
            <div className="space-y-4 mt-4">
              {agencyDetails.email && (
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="text-foreground">{agencyDetails.email}</p>
                </div>
              )}
              
              <div>
                <p className="text-sm text-muted-foreground">Member Since</p>
                <p className="text-foreground">
                  {new Date(agencyDetails.created_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge variant={agencyDetails.onboarding_complete ? 'default' : 'secondary'} className={agencyDetails.onboarding_complete ? 'bg-green-600' : ''}>
                  {agencyDetails.onboarding_complete ? 'Verified' : 'Pending'}
                </Badge>
              </div>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">Agency not found</p>
          )}

          <div className="flex justify-end mt-6">
            <Button 
              variant="outline"
              onClick={() => setAgencyDetailsOpen(false)}
              className="hover:bg-black hover:text-white transition-colors"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Order Details Dialog */}
      <Dialog open={orderDetailsOpen} onOpenChange={setOrderDetailsOpen}>
        <DialogContent className="sm:max-w-md z-[9999]">
          <div className="absolute right-4 top-4 flex items-center gap-1">
            <DialogClose className="rounded-sm ring-offset-background transition-all hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black focus:outline-none h-7 w-7 flex items-center justify-center">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogClose>
          </div>
          <DialogHeader>
            <DialogTitle>Order Details</DialogTitle>
          </DialogHeader>
          {loadingOrderDetails ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : orderDetails ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
                {request.media_sites?.favicon ? (
                  <img src={request.media_sites.favicon} alt="" className="w-12 h-12 rounded object-cover" />
                ) : (
                  <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
                    <ShoppingCart className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <div>
                  <h3 className="font-semibold">{request.media_sites?.name}</h3>
                  {request.media_sites?.agency && (
                    <p className="text-sm text-muted-foreground">via {request.media_sites.agency}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Payment Status</p>
                  <Badge variant="secondary" className="mt-1 bg-blue-600/20 text-blue-600">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Paid
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Delivery Status</p>
                  <Badge 
                    variant="secondary" 
                    className={`mt-1 ${
                      orderDetails.delivery_status === 'accepted' 
                        ? 'bg-green-600 text-white' 
                        : orderDetails.delivery_status === 'delivered'
                        ? 'bg-purple-600/20 text-purple-600'
                        : 'bg-yellow-600/20 text-yellow-600'
                    }`}
                  >
                    {orderDetails.delivery_status === 'accepted' && 'Completed'}
                    {orderDetails.delivery_status === 'delivered' && 'Pending Approval'}
                    {orderDetails.delivery_status === 'pending' && 'Pending'}
                  </Badge>
                </div>
              </div>

              {orderDetails.delivery_deadline && orderDetails.delivery_status === 'pending' && (
                <div className="border-t pt-4">
                  {(() => {
                    const timeInfo = formatTimeRemaining(orderDetails.delivery_deadline);
                    return (
                      <div className="flex justify-between text-sm items-center">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <Clock className="h-4 w-4" />
                          Expected Delivery
                        </span>
                        <span className={`font-semibold ${timeInfo.isOverdue ? 'text-red-500' : 'text-green-600'}`}>
                          {timeInfo.isOverdue ? 'Overdue' : timeInfo.text}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              )}

              <div className="border-t pt-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Amount Paid</span>
                  <span className="font-semibold">${(orderDetails.amount_cents / 100).toFixed(2)}</span>
                </div>
              </div>

              {orderDetails.delivery_url && (
                <div className="border-t pt-4">
                  <p className="text-sm text-muted-foreground mb-2">Delivery Link</p>
                  <a 
                    href={orderDetails.delivery_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline flex items-center gap-1"
                  >
                    {orderDetails.delivery_url}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}

              {orderDetails.delivery_notes && (
                <div className="border-t pt-4">
                  <p className="text-sm text-muted-foreground mb-2">Delivery Notes</p>
                  <p className="text-sm">{orderDetails.delivery_notes}</p>
                </div>
              )}

              <div className="text-xs text-muted-foreground border-t pt-4 space-y-1">
                <p className="flex items-center gap-1">
                  Order ID: {orderDetails.order_number || orderDetails.id.slice(0, 8)}
                  <Copy 
                    className="h-3 w-3 cursor-pointer hover:text-foreground transition-colors" 
                    onClick={() => {
                      navigator.clipboard.writeText(orderDetails.order_number || orderDetails.id);
                      toast({ title: "Copied", description: "Order ID copied to clipboard" });
                    }}
                  />
                </p>
                <p>Order Placed: {new Date(orderDetails.created_at).toLocaleString()}</p>
                {orderDetails.paid_at && <p>Paid: {new Date(orderDetails.paid_at).toLocaleString()}</p>}
                {orderDetails.delivered_at && <p>Delivered: {new Date(orderDetails.delivered_at).toLocaleString()}</p>}
              </div>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">Order not found</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Client Details Dialog */}
      <Dialog open={clientDetailsOpen} onOpenChange={setClientDetailsOpen}>
        <DialogContent className="sm:max-w-md z-[10000]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center">
                <User className="h-6 w-6 text-muted-foreground" />
              </div>
              <span>Client Details</span>
            </DialogTitle>
          </DialogHeader>

          {loadingClient ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : clientDetails ? (
            <div className="space-y-4 mt-4">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="text-foreground">{clientDetails.email || 'No email'}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">WhatsApp</p>
                  <p className="text-foreground">{clientDetails.whatsapp_phone || 'N/A'}</p>
                </div>
              </div>
              
              {clientDetails.username && (
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Username</p>
                    <p className="text-foreground">{clientDetails.username}</p>
                  </div>
                </div>
              )}
              
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Member Since</p>
                  <p className="text-foreground">
                    {new Date(clientDetails.created_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Email Status</p>
                  <Badge variant={clientDetails.email_verified ? 'default' : 'secondary'} className={clientDetails.email_verified ? 'bg-green-600' : ''}>
                    {clientDetails.email_verified ? 'Verified' : 'Unverified'}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Account Status</p>
                  <Badge variant={clientDetails.suspended ? 'destructive' : 'default'} className={!clientDetails.suspended ? 'bg-green-600' : ''}>
                    {clientDetails.suspended ? 'Suspended' : 'Active'}
                  </Badge>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">Client not found</p>
          )}

          <div className="flex justify-end mt-6">
            <Button 
              variant="outline"
              onClick={() => setClientDetailsOpen(false)}
              className="hover:bg-black hover:text-white transition-colors"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
