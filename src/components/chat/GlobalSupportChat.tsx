import { useAppStore } from '@/stores/appStore';
import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Send, X, GripHorizontal, Paperclip, FileText, Image as ImageIcon, Download, Reply } from 'lucide-react';
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatWindowRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      } else if (!isAdmin && !ticket.user_read) {
        await supabase.from('support_tickets').update({ user_read: true }).eq('id', ticket.id);
      }
    };
    fetchMessages();

    const msgChannel = supabase
      .channel(`support-msg-global-${ticket.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages', filter: `ticket_id=eq.${ticket.id}` }, (payload) => {
        setMessages(prev => [...prev, payload.new as SupportMessage]);
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
          <p className="text-[11px] text-muted-foreground">
            {ticket.user_email && <>{ticket.user_email} · </>}
            {format(new Date(ticket.created_at), 'MMM d, yyyy')}
            {' · '}
            <Badge variant={ticketStatus === 'open' ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0">
              {ticketStatus}
            </Badge>
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isAdmin && (
            ticketStatus === 'open' ? (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={async () => {
                await supabase.from('support_tickets').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', ticket.id);
                setTicketStatus('closed');
                toast.success('Ticket closed');
              }}>Close</Button>
            ) : (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={async () => {
                await supabase.from('support_tickets').update({ status: 'open', closed_at: null }).eq('id', ticket.id);
                setTicketStatus('open');
                toast.success('Ticket reopened');
              }}>Reopen</Button>
            )
          )}
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
                  {isMine && (
                    <button
                      onClick={() => setReplyingTo(msg)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity self-center mr-1 text-muted-foreground hover:text-foreground"
                      title="Reply"
                    >
                      <Reply className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <div className={`max-w-[75%] rounded-lg px-3 py-2 ${
                    isMine
                      ? 'bg-foreground text-background'
                      : 'bg-muted text-foreground'
                  }`}>
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
                    <p className={`text-[10px] mt-1 ${isMine ? 'text-background/60' : 'text-muted-foreground'}`}>
                      {msg.sender_type === 'admin' ? 'Support' : (ticket.user_email || 'User')} · {format(new Date(msg.created_at), 'MMM d, HH:mm')}
                    </p>
                  </div>
                  {!isMine && (
                    <button
                      onClick={() => setReplyingTo(msg)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity self-center ml-1 text-muted-foreground hover:text-foreground"
                      title="Reply"
                    >
                      <Reply className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

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
              onChange={e => setNewMessage(e.target.value)}
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
