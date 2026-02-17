import { useAppStore } from '@/stores/appStore';
import { useState, useEffect, useRef, useCallback } from 'react';
import { playMessageSound } from '@/lib/chat-presence';
import { createPortal } from 'react-dom';
import { Loader2, Send, X, GripHorizontal, Paperclip, FileText, Image as ImageIcon, Download, Reply, ChevronDown, Info } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
  const [uploadingFile, setUploadingFile] = useState(false);
  const [typingUsers, setTypingUsers] = useState<{ sender_id: string; sender_type: string }[]>([]);
  const [ticketUserDetails, setTicketUserDetails] = useState<{
    full_name: string | null;
    email: string | null;
    whatsapp_phone: string | null;
    agency_name: string | null;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatWindowRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Drag state
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  // Center on mount (desktop) — same size as engagement chat: 600×550
  useEffect(() => {
    if (!isMobile) {
      const w = 600, h = 550;
      setPosition({
        x: Math.max(0, Math.round((window.innerWidth - w) / 2)),
        y: Math.max(0, Math.round((window.innerHeight - h) / 2)),
      });
    }
  }, [isMobile]);

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

  const { decrementUnreadSupportTicketsCount, decrementUserUnreadSupportTicketsCount } = useAppStore();

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

      // Mark as read based on role
      if (isAdmin && !ticket.admin_read) {
        await supabase.from('support_tickets').update({ admin_read: true }).eq('id', ticket.id);
        decrementUnreadSupportTicketsCount();
      } else if (!isAdmin && !ticket.user_read) {
        await supabase.from('support_tickets').update({ user_read: true }).eq('id', ticket.id);
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
          playMessageSound(ticket.id, newMsg.message?.substring(0, 30));
          // Auto-mark as read since chat is open — prevents sidebar badge from appearing
          if (isAdmin) {
            await supabase.from('support_tickets').update({ admin_read: true }).eq('id', ticket.id);
          } else {
            await supabase.from('support_tickets').update({ user_read: true }).eq('id', ticket.id);
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

      // Get profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, username, whatsapp_phone')
        .eq('id', ticketData.user_id)
        .single();

      // Get agency name
      const { data: agency } = await supabase
        .from('agency_applications')
        .select('agency_name')
        .eq('user_id', ticketData.user_id)
        .eq('status', 'approved')
        .maybeSingle();

      setTicketUserDetails({
        full_name: profile?.username || null,
        email: profile?.email || null,
        whatsapp_phone: profile?.whatsapp_phone || null,
        agency_name: agency?.agency_name || null,
      });
    };
    fetchUserDetails();
  }, [isAdmin, ticket.id]);

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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('File must be under 2MB');
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

  return createPortal(
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
      {/* Drag Handle - desktop only */}
      {!isMobile && (
        <div
          className={`flex items-center justify-start py-2 px-4 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'} select-none`}
          onMouseDown={handleDragStart}
        >
          <GripHorizontal className="h-4 w-4 text-muted-foreground" />
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 pb-3 pt-1 border-b border-border shrink-0">
        <div className="min-w-0 flex-1 mr-2">
          <h3 className="font-semibold text-sm text-foreground truncate">{ticket.subject}</h3>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            {ticket.user_email && <>{ticket.user_email} · </>}
            {format(new Date(ticket.created_at), 'MMM d, yyyy')}
            {isAdmin && (
              <Popover>
                <PopoverTrigger asChild>
                  <button className="ml-1 text-muted-foreground hover:text-foreground inline-flex items-center">
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 bg-popover z-[99999]" side="bottom" align="start">
                  <div className="space-y-2 text-sm">
                    <h4 className="font-semibold text-foreground">User Details</h4>
                    <div className="space-y-1.5 text-xs">
                      <div><span className="text-muted-foreground">Full Name:</span> <span className="text-foreground">{ticketUserDetails?.full_name || 'N/A'}</span></div>
                      <div><span className="text-muted-foreground">Email:</span> <span className="text-foreground">{ticketUserDetails?.email || 'N/A'}</span></div>
                      <div><span className="text-muted-foreground">WhatsApp:</span> <span className="text-foreground">{ticketUserDetails?.whatsapp_phone || 'N/A'}</span></div>
                      <div><span className="text-muted-foreground">Agency:</span> <span className="text-foreground">{ticketUserDetails?.agency_name || 'N/A'}</span></div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            )}
            {' · '}
            <Badge variant={ticketStatus === 'open' ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0">
              {ticketStatus}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
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
                            <div className={`text-[10px] mb-1.5 pb-1.5 border-b ${isMine ? 'border-background/20 text-background/50' : 'border-border text-muted-foreground'} italic truncate`}>
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
              <p className="text-xs text-muted-foreground truncate flex-1 italic">
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
              className="h-10 w-10 shrink-0 text-muted-foreground hover:text-foreground hover:bg-foreground hover:text-background"
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
              className="h-10 border-0 shadow-none focus-visible:ring-0"
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
              className="h-10 w-10 flex-shrink-0 text-muted-foreground hover:text-foreground hover:bg-foreground hover:text-background"
              onClick={handleSend}
              disabled={sending || (!newMessage.trim() && !selectedFile)}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      ) : (
        <div className="p-3 text-center text-sm text-muted-foreground shrink-0">
          This ticket has been closed
        </div>
      )}
    </div>,
    document.body
  );
}
