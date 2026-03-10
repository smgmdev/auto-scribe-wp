import { useAppStore } from '@/stores/appStore';
import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Send, X, GripHorizontal, Paperclip, FileText, Image as ImageIcon, Download, Reply, ChevronDown, Info, XCircle } from 'lucide-react';
import { AgencyDetailsDialog } from '@/components/agency/AgencyDetailsDialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/use-mobile';
import { pushPopup, removePopup } from '@/lib/popup-stack';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface SupportMessage {
  id: string;
  ticket_id: string;
  sender_id: string;
  sender_type: string;
  message: string;
  created_at: string;
}

// ─── Attachment Preview Component ───
function AttachmentPreview({ attachment, isUser }: { attachment: { url: string; name: string; type: string }; isUser: boolean }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const isImage = attachment.type?.startsWith('image/');

  useEffect(() => {
    const getUrl = async () => {
      const { data } = await supabase.storage
        .from('support-attachments')
        .createSignedUrl(attachment.url, 3600);
      if (data?.signedUrl) setSignedUrl(data.signedUrl);
    };
    getUrl();
  }, [attachment.url]);

  const handleDownload = () => {
    if (signedUrl) window.open(signedUrl, '_blank');
  };

  return (
    <div className={`mt-1.5 rounded border ${isUser ? 'border-background/20' : 'border-border'}`}>
      {isImage && signedUrl ? (
        <img src={signedUrl} alt={attachment.name} className="max-w-full max-h-40 rounded-t object-cover cursor-pointer" onClick={handleDownload} />
      ) : null}
      <div className={`flex items-center gap-1.5 px-2 py-1.5 text-xs ${isUser ? 'text-background/80' : 'text-muted-foreground'}`}>
        <FileText className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate flex-1">{attachment.name}</span>
        <button onClick={handleDownload} className="shrink-0 hover:opacity-70">
          <Download className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function GlobalSupportChat() {
  const { openSupportTicket, closeSupportChat } = useAppStore();

  if (!openSupportTicket) return null;

  return (
    <SupportChatWindow
      ticket={openSupportTicket}
      onClose={closeSupportChat}
    />
  );
}

function SupportChatWindow({ ticket, onClose }: { ticket: { id: string; subject: string; status: string; created_at: string; updated_at: string; user_read: boolean; admin_read?: boolean; user_email?: string }; onClose: () => void }) {
  const { user, isAdmin } = useAuth();
  const isMobile = useIsMobile();
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [ticketStatus, setTicketStatus] = useState(ticket.status);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [replyingTo, setReplyingTo] = useState<SupportMessage | null>(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [userDetailsOpen, setUserDetailsOpen] = useState(false);
  const [userDetailsPos, setUserDetailsPos] = useState({ x: 0, y: 0 });
  const [userDetailsDragging, setUserDetailsDragging] = useState(false);
  const userDetailsDragRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const userDetailsInitialized = useRef(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [typingUsers, setTypingUsers] = useState<{ sender_id: string; sender_type: string }[]>([]);
  const [ticketUserDetails, setTicketUserDetails] = useState<{
    full_name: string | null;
    email: string | null;
    whatsapp_phone: string | null;
    agency_name: string | null;
    agency_whatsapp: string | null;
    user_whatsapp: string | null;
  } | null>(null);
  const [agencyDetailsOpen, setAgencyDetailsOpen] = useState(false);
  const [agencyDetailsName, setAgencyDetailsName] = useState<string | null>(null);
  const [userOnline, setUserOnline] = useState(false);
  const [adminOnline, setAdminOnline] = useState(false);
  const [adminUserId, setAdminUserId] = useState<string | null>(null);
  const [ticketUserId, setTicketUserId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatWindowRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFocusedRef = useRef(false);
  const hasPendingReadRef = useRef(false);

  // Initialize position centered immediately to avoid flash
  const [position, setPosition] = useState(() => {
    if (typeof window !== 'undefined') {
      const w = 600, h = 550;
      return {
        x: Math.max(0, Math.round((window.innerWidth - w) / 2)),
        y: Math.max(0, Math.round((window.innerHeight - h) / 2)),
      };
    }
    return { x: 0, y: 0 };
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  // Popup stack
  useEffect(() => {
    const id = `support-chat-${ticket.id}`;
    pushPopup(id, onClose);
    return () => removePopup(id);
  }, [ticket.id, onClose]);

  // Body scroll lock on mobile
  useEffect(() => {
    if (!isMobile) return;
    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.overflow = '';
      window.scrollTo(0, scrollY);
    };
  }, [isMobile]);

  // Drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY, posX: position.x, posY: position.y };
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      setPosition({
        x: dragStartRef.current.posX + (e.clientX - dragStartRef.current.x),
        y: dragStartRef.current.posY + (e.clientY - dragStartRef.current.y),
      });
    };
    const onUp = () => setIsDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isDragging]);

  // User details popup drag handlers
  const handleUserDetailsDragStart = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    setUserDetailsDragging(true);
    userDetailsDragRef.current = { x: e.clientX, y: e.clientY, posX: userDetailsPos.x, posY: userDetailsPos.y };
  }, [userDetailsPos]);

  useEffect(() => {
    if (!userDetailsDragging) return;
    const onMove = (e: MouseEvent) => {
      setUserDetailsPos({
        x: userDetailsDragRef.current.posX + (e.clientX - userDetailsDragRef.current.x),
        y: userDetailsDragRef.current.posY + (e.clientY - userDetailsDragRef.current.y),
      });
    };
    const onUp = () => setUserDetailsDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [userDetailsDragging]);

  const openUserDetails = useCallback(() => {
    if (!userDetailsInitialized.current && !isMobile) {
      const w = 320, h = 220;
      setUserDetailsPos({
        x: Math.max(0, Math.round((window.innerWidth - w) / 2)),
        y: Math.max(0, Math.round((window.innerHeight - h) / 2)),
      });
      userDetailsInitialized.current = true;
    }
    setUserDetailsOpen(true);
  }, [isMobile]);

  const { decrementUnreadSupportTicketsCount, decrementUserUnreadSupportTicketsCount } = useAppStore();

  // Mark ticket as read helper
  const markAsRead = useCallback(async () => {
    if (!user) return;
    hasPendingReadRef.current = false;
    if (isAdmin) {
      await supabase.from('support_tickets').update({ admin_read: true }).eq('id', ticket.id);
    } else {
      await supabase.from('support_tickets').update({ user_read: true }).eq('id', ticket.id);
    }
  }, [user, isAdmin, ticket.id]);

  // Track focus state — mark as read when window is clicked/focused
  useEffect(() => {
    const el = chatWindowRef.current;
    if (!el) return;
    
    const handleFocus = () => {
      isFocusedRef.current = true;
      // If there are pending unread messages, mark as read now
      if (hasPendingReadRef.current) {
        markAsRead();
      }
    };
    const handleBlur = () => {
      isFocusedRef.current = false;
    };
    
    // Use mousedown/touchstart on the chat window to detect focus
    el.addEventListener('mousedown', handleFocus);
    el.addEventListener('touchstart', handleFocus);
    // Detect when clicking outside
    const handleDocumentClick = (e: MouseEvent) => {
      if (!el.contains(e.target as Node)) {
        handleBlur();
      }
    };
    document.addEventListener('mousedown', handleDocumentClick);
    
    // Set focused on mount (user just opened it)
    isFocusedRef.current = true;
    
    return () => {
      el.removeEventListener('mousedown', handleFocus);
      el.removeEventListener('touchstart', handleFocus);
      document.removeEventListener('mousedown', handleDocumentClick);
    };
  }, [markAsRead]);

  // Fetch messages
  useEffect(() => {
    const fetchMessages = async () => {
      setLoadingMessages(true);
      const { data } = await supabase
        .from('support_messages')
        .select('*')
        .eq('ticket_id', ticket.id)
        .order('created_at', { ascending: true });
      if (data) setMessages(data);
      setLoadingMessages(false);

      // Mark as read on open since user just clicked to open (focused)
      if (isAdmin && !ticket.admin_read) {
        await markAsRead();
        decrementUnreadSupportTicketsCount();
      } else if (!isAdmin && !ticket.user_read) {
        await markAsRead();
        decrementUserUnreadSupportTicketsCount();
      }
    };
    fetchMessages();

    const msgChannel = supabase
      .channel(`support-msg-global-${ticket.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages', filter: `ticket_id=eq.${ticket.id}` }, async (payload) => {
        const newMsg = payload.new as SupportMessage;
        setMessages(prev => [...prev, newMsg]);
        const isCounterparty = isAdmin ? newMsg.sender_type === 'user' : newMsg.sender_type === 'admin';
        if (isCounterparty) {
          if (isFocusedRef.current) {
            // Chat is focused — mark as read immediately
            await markAsRead();
          } else {
            // Chat is open but not focused — sound is handled by Sidebar (single source of truth)
            hasPendingReadRef.current = true;
          }
        }
      })
      .subscribe();

    const ticketChannel = supabase
      .channel(`support-ticket-global-${ticket.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'support_tickets', filter: `id=eq.${ticket.id}` }, (payload) => {
        const updated = payload.new as any;
        setTicketStatus(updated.status);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(ticketChannel);
    };
  }, [ticket.id]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Fetch user details for admin view
  useEffect(() => {
    if (!isAdmin || !ticket.id) return;
    const fetchUserDetails = async () => {
      // Get user_id from ticket
      const { data: ticketData } = await supabase
        .from('support_tickets')
        .select('user_id')
        .eq('id', ticket.id)
        .single();
      if (!ticketData?.user_id) return;
      setTicketUserId(ticketData.user_id);

      // Get profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, username, whatsapp_phone, last_online_at')
        .eq('id', ticketData.user_id)
        .single();

      // Check online status (within last 2 minutes)
      if (profile?.last_online_at) {
        const lastOnline = new Date(profile.last_online_at).getTime();
        setUserOnline(Date.now() - lastOnline < 2 * 60 * 1000);
      }

      // Get agency application (for name, full_name, whatsapp)
      const { data: agency } = await supabase
        .from('agency_applications')
        .select('agency_name, full_name, whatsapp_phone')
        .eq('user_id', ticketData.user_id)
        .eq('status', 'approved')
        .maybeSingle();

      setTicketUserDetails({
        full_name: agency?.full_name || null,
        email: profile?.email || null,
        whatsapp_phone: profile?.whatsapp_phone || null,
        agency_name: agency?.agency_name || null,
        agency_whatsapp: agency?.whatsapp_phone || null,
        user_whatsapp: profile?.whatsapp_phone || null,
      });
    };
    fetchUserDetails();
  }, [isAdmin, ticket.id]);

  // Track user online status in real-time for admin via profile updates
  useEffect(() => {
    if (!isAdmin || !ticketUserId) return;
    const channel = supabase
      .channel(`support-user-online-${ticketUserId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${ticketUserId}` }, (payload) => {
        const updated = payload.new as any;
        if (updated.last_online_at) {
          const lastOnline = new Date(updated.last_online_at).getTime();
          setUserOnline(Date.now() - lastOnline < 2 * 60 * 1000);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isAdmin, ticketUserId]);

  // Track admin online status in real-time for non-admin users
  useEffect(() => {
    if (isAdmin) return;

    let isActive = true;
    let timeoutId: ReturnType<typeof setTimeout>;
    let adminId: string | null = null;

    const checkAdminStatus = async () => {
      if (!isActive) return;
      const { data, error } = await supabase.rpc('get_admin_online_status');
      if (!error && data !== null) {
        setAdminOnline(data as boolean);
      }
      if (isActive) timeoutId = setTimeout(checkAdminStatus, 15000);
    };

    // Also fetch admin user_id for other features + real-time listener
    const fetchAdminId = async () => {
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin')
        .limit(1)
        .maybeSingle();
      if (roleData?.user_id) {
        setAdminUserId(roleData.user_id);
        adminId = roleData.user_id;
      }
    };

    checkAdminStatus();
    fetchAdminId();

    // Real-time listener on profiles table for admin last_online_at changes
    const profileChannel = supabase
      .channel('admin-online-status-rt')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
        },
        (payload) => {
          // Only react to admin profile updates
          if (adminId && payload.new?.id === adminId) {
            const lastOnline = payload.new?.last_online_at;
            if (lastOnline) {
              const diff = Date.now() - new Date(lastOnline).getTime();
              setAdminOnline(diff < 2 * 60 * 1000);
            } else {
              setAdminOnline(false);
            }
          }
        }
      )
      .subscribe();

    return () => {
      isActive = false;
      clearTimeout(timeoutId);
      supabase.removeChannel(profileChannel);
    };
  }, [isAdmin]);

  // Typing indicator with presence
  const senderType = isAdmin ? 'admin' : 'user';
  
  useEffect(() => {
    if (!user || !ticket.id) return;

    const channelName = `support-typing-${ticket.id}`;
    const channel = supabase.channel(channelName);

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const typing: { sender_id: string; sender_type: string }[] = [];
        Object.values(state).forEach((presences: any) => {
          presences.forEach((p: any) => {
            if (p.is_typing && p.sender_id !== user.id) {
              typing.push({ sender_id: p.sender_id, sender_type: p.sender_type });
            }
          });
        });
        setTypingUsers(typing);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            sender_id: user.id,
            sender_type: senderType,
            is_typing: false
          });
        }
      });

    typingChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      typingChannelRef.current = null;
      setTypingUsers([]);
    };
  }, [ticket.id, user?.id, senderType]);

  const broadcastTyping = useCallback((isTyping: boolean) => {
    if (typingChannelRef.current && user) {
      typingChannelRef.current.track({
        sender_id: user.id,
        sender_type: senderType,
        is_typing: isTyping
      });
    }
  }, [user?.id, senderType]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    if (e.target.value.trim()) {
      broadcastTyping(true);
    }

    typingTimeoutRef.current = setTimeout(() => {
      broadcastTyping(false);
    }, 2000);
  }, [broadcastTyping]);

  const ALLOWED_FILE_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg'
  ];
  const BLOCKED_EXTENSIONS = ['.exe', '.bat', '.cmd', '.com', '.msi', '.scr', '.ps1', '.vbs', '.js', '.wsh', '.wsf', '.jar', '.sh', '.app', '.dmg', '.dll', '.sys', '.lnk', '.pif', '.reg', '.inf', '.hta', '.cpl'];

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = '.' + (file.name.split('.').pop()?.toLowerCase() || '');
    if (BLOCKED_EXTENSIONS.includes(ext)) {
      toast.error('Executable files are not allowed for security reasons.');
      e.target.value = '';
      return;
    }

    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      toast.error('Only Word (.doc, .docx), PDF, PNG, and JPG files are allowed.');
      e.target.value = '';
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error('File must be under 2MB');
      e.target.value = '';
      return;
    }
    setSelectedFile(file);
    e.target.value = '';
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <ImageIcon className="h-4 w-4" />;
    return <FileText className="h-4 w-4" />;
  };

  const handleSend = async () => {
    if (!user || (!newMessage.trim() && !selectedFile)) return;
    // Security: never send to a closed support ticket
    if (ticketStatus === 'closed') return;
    setSending(true);
    broadcastTyping(false);
    try {
      let fullMessage = newMessage.trim();

      if (selectedFile) {
        setUploadingFile(true);
        const fileExt = selectedFile.name.split('.').pop();
        const filePath = `${user.id}/${ticket.id}/${crypto.randomUUID()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('support-attachments')
          .upload(filePath, selectedFile);

        if (uploadError) throw uploadError;

        const fileData = JSON.stringify({ url: filePath, name: selectedFile.name, type: selectedFile.type });
        fullMessage = fullMessage
          ? `${fullMessage}\n[ATTACHMENT]${fileData}[/ATTACHMENT]`
          : `[ATTACHMENT]${fileData}[/ATTACHMENT]`;
        setUploadingFile(false);
      }

      // Prepend reply reference if replying
      if (replyingTo) {
        const replyPreview = replyingTo.message.replace(/\[ATTACHMENT\].*?\[\/ATTACHMENT\]/, '').replace(/^\[REPLY:.*?\]\s*/, '').trim().slice(0, 80) || 'Attachment';
        fullMessage = `[REPLY:${replyPreview}] ${fullMessage}`;
      }

      const senderType = isAdmin ? 'admin' : 'user';

      const { error } = await supabase.from('support_messages').insert({
        ticket_id: ticket.id,
        sender_id: user.id,
        sender_type: senderType,
        message: fullMessage
      });
      if (error) throw error;

      // Mark the other party as unread
      if (isAdmin) {
        await supabase.from('support_tickets').update({ user_read: false, updated_at: new Date().toISOString() }).eq('id', ticket.id);
      } else {
        await supabase.from('support_tickets').update({ admin_read: false, updated_at: new Date().toISOString() }).eq('id', ticket.id);
      }
      setNewMessage('');
      setSelectedFile(null);
      setReplyingTo(null);
    } catch {
      toast.error('Failed to send message');
      setUploadingFile(false);
    } finally {
      setSending(false);
    }
  };

  return <>{createPortal(
    <div
      ref={chatWindowRef}
      className={
        isMobile
          ? 'fixed inset-0 z-[60] bg-background flex flex-col h-[100dvh]'
          : 'fixed z-[60] bg-background rounded-lg shadow-xl border border-border flex flex-col'
      }
      style={isMobile ? undefined : {
        left: position.x,
        top: position.y,
        width: 600,
        height: 550,
        maxHeight: 'calc(100vh - 100px)',
      }}
    >
      {/* Drag Handle + actions row */}
      <div
        className={`flex items-center justify-between ${isMobile ? 'px-3 py-1.5' : 'py-2 px-4'} border-b bg-muted/30 ${!isMobile ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : ''} select-none shrink-0`}
        onMouseDown={!isMobile ? handleDragStart : undefined}
      >
        <GripHorizontal className="h-4 w-4 text-muted-foreground" />
        <div className="flex items-center gap-1 shrink-0">
          {isAdmin && (
            <button
              onClick={(e) => { e.stopPropagation(); openUserDetails(); }}
              className="text-xs px-2.5 py-1 rounded-none border border-border text-muted-foreground hover:bg-foreground hover:text-background hover:border-foreground transition-colors inline-flex items-center gap-1"
            >
              <Info className="h-3 w-3" />
              User
            </button>
          )}
          {isAdmin && ticketStatus === 'open' && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowCloseConfirm(true); }}
              className="text-xs px-2.5 py-1 rounded-none border border-border text-muted-foreground hover:bg-foreground hover:text-background hover:border-foreground transition-colors"
            >
              Close Ticket
            </button>
          )}
          <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Header */}
      <div className={`flex items-center justify-between px-4 ${isMobile ? 'py-1.5' : 'py-2'} border-b border-border shrink-0`}>
        <div className="min-w-0 flex-1 mr-2">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm text-foreground truncate">{ticket.subject}</h3>
            <Badge variant={ticketStatus === 'open' ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0 flex-shrink-0">
              {ticketStatus}
            </Badge>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground -mt-0.5">
             {isAdmin ? (
              <>
                <span>User</span>
                <span className="mx-0.5">·</span>
                <span className="flex items-center gap-1">
                  <span className={`h-1.5 w-1.5 rounded-full inline-block ${userOnline ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
                  <span className={userOnline ? 'text-emerald-600' : 'text-muted-foreground'}>{userOnline ? 'Online' : 'Offline'}</span>
                </span>
              </>
            ) : (
              <>
                <span className="text-foreground">Arcana Mace Staff</span>
                <span className="flex items-center gap-1">
                  <span className={`h-1.5 w-1.5 rounded-full inline-block ${adminOnline ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
                  <span className={adminOnline ? 'text-emerald-600' : 'text-muted-foreground'}>{adminOnline ? 'Online' : 'Offline'}</span>
                </span>
              </>
            )}

          </div>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        {loadingMessages ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-center text-muted-foreground py-8 text-sm">No messages yet</p>
        ) : (
          <div className="space-y-3">
            {messages.map(msg => {
              const attachmentMatch = msg.message.match(/\[ATTACHMENT\](.*?)\[\/ATTACHMENT\]/);
              let attachment: { url: string; name: string; type: string } | null = null;
              let textContent = msg.message;
              if (attachmentMatch) {
                try { attachment = JSON.parse(attachmentMatch[1]); } catch {}
                textContent = msg.message.replace(/\[ATTACHMENT\].*?\[\/ATTACHMENT\]/, '').trim();
              }
              const isMine = isAdmin ? msg.sender_type === 'admin' : msg.sender_type === 'user';
              return (
                <div key={msg.id} className={`group flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-lg px-3 py-2 ${
                    isMine
                      ? 'bg-foreground text-background'
                      : 'bg-muted text-foreground'
                  }`}>
                    <div className="flex items-start justify-between gap-1">
                      <div className="flex-1 min-w-0">
                        {msg.message.startsWith('[REPLY:') && (() => {
                          const replyMatch = msg.message.match(/^\[REPLY:(.*?)\]/);
                          if (!replyMatch) return null;
                          const replyText = replyMatch[1];
                          return (
                            <div className={`text-[10px] mb-1.5 pb-1.5 border-b ${isMine ? 'border-background/20 text-background/50' : 'border-border text-muted-foreground'} truncate`}>
                              ↩ {replyText}
                            </div>
                          );
                        })()}
                        {textContent && <p className="text-sm whitespace-pre-wrap break-words">
                          {textContent.replace(/^\[REPLY:.*?\]\s*/, '')}
                        </p>}
                        {attachment && <AttachmentPreview attachment={attachment} isUser={isMine} />}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className={`h-5 w-5 flex items-center justify-center cursor-pointer rounded hover:bg-black/10 dark:hover:bg-white/10 outline-none border-none bg-transparent shrink-0 ${
                              isMine ? 'text-background/70' : 'text-muted-foreground'
                            }`}
                          >
                            <ChevronDown className="h-3 w-3 pointer-events-none" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align={isMine ? "end" : "start"}
                          side="bottom"
                          sideOffset={5}
                          collisionPadding={16}
                          className="bg-popover border shadow-lg z-[99999]"
                        >
                          <DropdownMenuItem
                            onSelect={() => setReplyingTo(msg)}
                            className="cursor-pointer focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black"
                          >
                            <Reply className="h-4 w-4 mr-2" />
                            Reply
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <p className={`text-[10px] mt-1 ${isMine ? 'text-background/60' : 'text-muted-foreground'}`}>
                      {msg.sender_type === 'admin' ? (isAdmin ? 'You' : 'Arcana Mace Support') : (isAdmin ? 'User' : 'You')} · {format(new Date(msg.created_at), 'MMM d, HH:mm')}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      {/* Typing Indicator */}
      {typingUsers.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground border-t">
          <div className="flex gap-1">
            <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <span>
            {typingUsers.map(u => u.sender_type === 'admin' ? 'Arcana Mace Support' : 'User').filter((v, i, a) => a.indexOf(v) === i).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
          </span>
        </div>
      )}

      {/* Input */}
      {ticketStatus === 'open' ? (
        <div className="shrink-0">
          {replyingTo && (
            <div className="flex items-center gap-2 px-3 pt-2 pb-1 border-t border-border">
              <Reply className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <p className="text-xs text-muted-foreground truncate flex-1">
                {replyingTo.message.replace(/\[ATTACHMENT\].*?\[\/ATTACHMENT\]/, '').replace(/^\[REPLY:.*?\]\s*/, '').trim() || 'Attachment'}
              </p>
              <button onClick={() => setReplyingTo(null)} className="text-muted-foreground hover:text-foreground shrink-0">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          {selectedFile && (
            <div className="flex items-center gap-2 px-3 pt-2 pb-1">
              <div className="flex items-center gap-1.5 bg-muted rounded px-2 py-1 text-xs text-foreground max-w-[200px]">
                {getFileIcon(selectedFile.type)}
                <span className="truncate">{selectedFile.name}</span>
                <button onClick={() => setSelectedFile(null)} className="ml-1 text-muted-foreground hover:text-foreground">
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}
          <div className="flex items-center border-t border-border">
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
              onChange={handleFileSelect}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0 rounded-none hover:bg-foreground hover:text-background"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending}
              title="Attach file (PDF, Word, PNG, JPG - max 2MB)"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Input
              value={newMessage}
              onChange={handleInputChange}
              placeholder="Type a message..."
              autoComplete="off"
              data-lpignore="true"
              data-form-type="other"
              name="support-chat-message-input"
              className="rounded-none border-0 flex-1 h-10 text-sm sm:text-base shadow-none focus-visible:ring-0"
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey && (newMessage.trim() || selectedFile)) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0 rounded-none hover:bg-foreground hover:text-background"
              onClick={handleSend}
              disabled={sending || (!newMessage.trim() && !selectedFile)}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      ) : (
        <div className="shrink-0">
          <div className="border-t border-border" />
          <p className="p-3 text-center text-sm text-muted-foreground">This ticket has been closed</p>
        </div>
      )}
    </div>,
    document.body
  )}
  {showCloseConfirm && (
    <AlertDialog open={showCloseConfirm} onOpenChange={setShowCloseConfirm}>
      <AlertDialogContent className="z-[99999]">
        <AlertDialogHeader className="text-left">
          <AlertDialogTitle>Close this ticket?</AlertDialogTitle>
          <AlertDialogDescription>
            This will mark the ticket as closed. The user will no longer be able to send messages.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="hover:bg-foreground hover:text-background hover:border-foreground">Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-foreground text-background border border-foreground shadow-none hover:bg-transparent hover:text-foreground hover:border-foreground"
            onClick={async () => {
              await supabase.from('support_tickets').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', ticket.id);
              setTicketStatus('closed');
              setShowCloseConfirm(false);
              toast.success('Ticket closed');
            }}
          >
            Close Ticket
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )}
  {userDetailsOpen && isAdmin && createPortal(
    isMobile ? (
      <div className="fixed inset-0 z-[300] bg-background flex flex-col">
        <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/30">
          <GripHorizontal className="h-4 w-4 text-muted-foreground" />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => setUserDetailsOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="p-4 space-y-4 flex-1">
          <h4 className="font-semibold text-foreground text-lg">User Details</h4>
          <div className="space-y-3 text-sm">
            <div><span className="text-muted-foreground">Full Name:</span> <span className="text-foreground font-medium">{ticketUserDetails?.agency_name ? (ticketUserDetails?.full_name || 'N/A') : 'Not Agency Account'}</span></div>
            <div><span className="text-muted-foreground">Email:</span> <span className="text-foreground font-medium">{ticketUserDetails?.email || 'N/A'}</span></div>
            <div><span className="text-muted-foreground">User WhatsApp:</span> <span className="text-foreground font-medium">{ticketUserDetails?.user_whatsapp || 'N/A'}</span></div>
            <div><span className="text-muted-foreground">Agency WhatsApp:</span> <span className="text-foreground font-medium">{ticketUserDetails?.agency_name ? (ticketUserDetails?.agency_whatsapp || 'N/A') : 'Not Agency Account'}</span></div>
            <div className="flex items-center gap-1"><span className="text-muted-foreground">Agency:</span> {ticketUserDetails?.agency_name ? (
              <button className="text-accent hover:underline flex items-center gap-1" onClick={() => { setAgencyDetailsName(ticketUserDetails.agency_name); setAgencyDetailsOpen(true); }}>{ticketUserDetails.agency_name}<Info className="h-3.5 w-3.5" /></button>
            ) : <span className="text-foreground font-medium">N/A</span>}</div>
          </div>
          <div className="flex justify-end">
            <Button
              className="w-full bg-foreground text-background border border-foreground hover:bg-transparent hover:text-foreground hover:border-foreground"
              onClick={() => setUserDetailsOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    ) : (
      <div
        className="fixed z-[200] bg-background rounded-lg shadow-xl border border-border"
        style={{ left: userDetailsPos.x, top: userDetailsPos.y, width: 320 }}
      >
        <div
          className={`flex items-center justify-between px-4 py-2 border-b bg-muted/30 ${userDetailsDragging ? 'cursor-grabbing' : 'cursor-grab'} select-none`}
          onMouseDown={handleUserDetailsDragStart}
        >
          <GripHorizontal className="h-4 w-4 text-muted-foreground" />
          <button onClick={() => setUserDetailsOpen(false)} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4 pt-4 space-y-4">
          <h4 className="font-semibold text-foreground text-lg">User Details</h4>
          <div className="space-y-3 text-sm">
            <div><span className="text-muted-foreground">Full Name:</span> <span className="text-foreground font-medium">{ticketUserDetails?.agency_name ? (ticketUserDetails?.full_name || 'N/A') : 'Not Agency Account'}</span></div>
            <div><span className="text-muted-foreground">Email:</span> <span className="text-foreground font-medium">{ticketUserDetails?.email || 'N/A'}</span></div>
            <div><span className="text-muted-foreground">User WhatsApp:</span> <span className="text-foreground font-medium">{ticketUserDetails?.user_whatsapp || 'N/A'}</span></div>
            <div><span className="text-muted-foreground">Agency WhatsApp:</span> <span className="text-foreground font-medium">{ticketUserDetails?.agency_name ? (ticketUserDetails?.agency_whatsapp || 'N/A') : 'Not Agency Account'}</span></div>
            <div className="flex items-center gap-1"><span className="text-muted-foreground">Agency:</span> {ticketUserDetails?.agency_name ? (
              <button className="text-accent hover:underline flex items-center gap-1" onClick={() => { setAgencyDetailsName(ticketUserDetails.agency_name); setAgencyDetailsOpen(true); }}>{ticketUserDetails.agency_name}<Info className="h-3.5 w-3.5" /></button>
            ) : <span className="text-foreground font-medium">N/A</span>}</div>
          </div>
          <div className="flex justify-end">
            <Button
              className="bg-foreground text-background border border-foreground hover:bg-transparent hover:text-foreground hover:border-foreground"
              onClick={() => setUserDetailsOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    ),
    document.body
  )}
  <AgencyDetailsDialog
    open={agencyDetailsOpen}
    onOpenChange={setAgencyDetailsOpen}
    agencyName={agencyDetailsName}
    zIndex={350}
  />
  </>;
}
