import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Loader2, Send, MessageSquare, Clock, CheckCircle, X, GripHorizontal, Paperclip, FileText, Image as ImageIcon, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/use-mobile';
import { pushPopup, removePopup } from '@/lib/popup-stack';
import { toast } from 'sonner';
import { format } from 'date-fns';

const TICKET_CATEGORIES = [
  'Request invoice for wire transfer top up',
  'Account related issues',
  'Order related issues',
  'Other',
] as const;

interface SupportTicket {
  id: string;
  subject: string;
  status: string;
  created_at: string;
  updated_at: string;
  user_read: boolean;
}

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
      const { data, error } = await supabase.storage
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

// ─── Floating Support Chat Window ───
function SupportChatPopup({ ticket, onClose }: { ticket: SupportTicket; onClose: () => void }) {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [ticketStatus, setTicketStatus] = useState(ticket.status);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatWindowRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drag state
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  // Center on mount (desktop)
  useEffect(() => {
    if (!isMobile) {
      const w = 420, h = 520;
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

      // Mark as read
      if (!ticket.user_read) {
        await supabase.from('support_tickets').update({ user_read: true }).eq('id', ticket.id);
      }
    };
    fetchMessages();

    // Real-time messages
    const msgChannel = supabase
      .channel(`support-msg-popup-${ticket.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages', filter: `ticket_id=eq.${ticket.id}` }, (payload) => {
        setMessages(prev => [...prev, payload.new as SupportMessage]);
      })
      .subscribe();

    // Real-time ticket status
    const ticketChannel = supabase
      .channel(`support-ticket-popup-${ticket.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'support_tickets', filter: `id=eq.${ticket.id}` }, (payload) => {
        const updated = payload.new as SupportTicket;
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

      const { error } = await supabase.from('support_messages').insert({
        ticket_id: ticket.id,
        sender_id: user.id,
        sender_type: 'user',
        message: fullMessage
      });
      if (error) throw error;
      await supabase.from('support_tickets').update({ admin_read: false, updated_at: new Date().toISOString() }).eq('id', ticket.id);
      setNewMessage('');
      setSelectedFile(null);
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
        width: 420,
        height: 520,
        minHeight: 420,
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
            {format(new Date(ticket.created_at), 'MMM d, yyyy')}
            {' · '}
            <Badge variant={ticketStatus === 'open' ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0">
              {ticketStatus}
            </Badge>
          </p>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0">
          <X className="h-5 w-5" />
        </button>
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
              return (
                <div key={msg.id} className={`flex ${msg.sender_type === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-lg px-3 py-2 ${
                    msg.sender_type === 'user'
                      ? 'bg-foreground text-background'
                      : 'bg-muted text-foreground'
                  }`}>
                    {textContent && <p className="text-sm whitespace-pre-wrap break-words">{textContent}</p>}
                    {attachment && <AttachmentPreview attachment={attachment} isUser={msg.sender_type === 'user'} />}
                    <p className={`text-[10px] mt-1 ${msg.sender_type === 'user' ? 'text-background/60' : 'text-muted-foreground'}`}>
                      {format(new Date(msg.created_at), 'MMM d, HH:mm')}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      {/* Input */}
      {ticketStatus === 'open' ? (
        <div className="border-t border-border shrink-0">
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
          <div className="p-3 flex gap-2 items-center">
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
              className="h-10 w-10 shrink-0"
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
              className="h-10"
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey && (newMessage.trim() || selectedFile)) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <Button
              size="icon"
              className="h-10 w-10 bg-foreground text-background hover:bg-foreground/90 flex-shrink-0"
              onClick={handleSend}
              disabled={sending || (!newMessage.trim() && !selectedFile)}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      ) : (
        <div className="border-t border-border p-3 text-center text-sm text-muted-foreground shrink-0">
          This ticket has been closed
        </div>
      )}
    </div>,
    document.body
  );
}

// ─── Main Support View ───
export function SupportView() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [openChatTicket, setOpenChatTicket] = useState<SupportTicket | null>(null);

  // New ticket popup state
  const [newTicketOpen, setNewTicketOpen] = useState(false);
  const [newFirstMessage, setNewFirstMessage] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [creating, setCreating] = useState(false);

  // New ticket popup drag
  const [popupPos, setPopupPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (newTicketOpen && !isMobile) {
      const w = 460, h = 480;
      setPopupPos({
        x: Math.max(0, (window.innerWidth - w) / 2),
        y: Math.max(0, (window.innerHeight - h) / 2),
      });
    }
  }, [newTicketOpen, isMobile]);

  useEffect(() => {
    if (newTicketOpen) {
      pushPopup('new-support-ticket', () => setNewTicketOpen(false));
      return () => removePopup('new-support-ticket');
    }
  }, [newTicketOpen]);

  useEffect(() => {
    if (newTicketOpen && isMobile) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [newTicketOpen, isMobile]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isMobile) return;
    setDragging(true);
    dragOffset.current = { x: e.clientX - popupPos.x, y: e.clientY - popupPos.y };
  }, [popupPos, isMobile]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      setPopupPos({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y });
    };
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [dragging]);

  // Fetch tickets
  useEffect(() => {
    if (!user) return;
    const fetchTickets = async () => {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });
      if (!error && data) setTickets(data);
      setLoading(false);
    };
    fetchTickets();

    const channel = supabase
      .channel('user-support-tickets')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets', filter: `user_id=eq.${user.id}` }, () => {
        fetchTickets();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const handleCreateTicket = async () => {
    if (!user || !newCategory || !newFirstMessage.trim()) return;
    setCreating(true);
    try {
      const { data: ticket, error } = await supabase
        .from('support_tickets')
        .insert({ user_id: user.id, subject: newCategory })
        .select()
        .single();
      if (error) throw error;

      await supabase.from('support_messages').insert({
        ticket_id: ticket.id,
        sender_id: user.id,
        sender_type: 'user',
        message: newFirstMessage.trim()
      });

      setNewFirstMessage('');
      setNewCategory('');
      setNewTicketOpen(false);
      setOpenChatTicket(ticket);
      toast.success('Support ticket created');
    } catch {
      toast.error('Failed to create ticket');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in bg-white min-h-[calc(100vh-56px)] lg:min-h-screen -m-4 lg:-m-8 p-4 lg:p-8">
      <div className="max-w-[980px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Support</h1>
            <p className="mt-1 text-muted-foreground">Get help from our team</p>
          </div>
          <Button
            className="bg-foreground text-background hover:bg-transparent hover:text-foreground border border-foreground"
            onClick={() => setNewTicketOpen(true)}
          >
            New Ticket
          </Button>
        </div>

        {/* Ticket List */}
        <div className="space-y-2">
          {tickets.length === 0 ? (
            <div className="text-center py-16">
              <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
              <p className="text-muted-foreground">No support tickets yet</p>
              <p className="text-sm text-muted-foreground mt-1">Click "New Ticket" to get started</p>
            </div>
          ) : (
            tickets.map(ticket => (
              <button
                key={ticket.id}
                className="w-full text-left border rounded-lg p-4 hover:bg-muted/50 transition-colors flex items-center justify-between gap-4"
                onClick={() => setOpenChatTicket(ticket)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {!ticket.user_read && (
                      <span className="h-2 w-2 rounded-full bg-blue-500 flex-shrink-0" />
                    )}
                    <p className="font-medium text-sm truncate">{ticket.subject}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(new Date(ticket.updated_at), 'MMM d, yyyy HH:mm')}
                  </p>
                </div>
                <Badge variant={ticket.status === 'open' ? 'default' : 'secondary'} className="text-xs flex-shrink-0">
                  {ticket.status === 'open' ? (
                    <><Clock className="h-3 w-3 mr-1" />Open</>
                  ) : (
                    <><CheckCircle className="h-3 w-3 mr-1" />Closed</>
                  )}
                </Badge>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Floating Chat Popup */}
      {openChatTicket && (
        <SupportChatPopup
          ticket={openChatTicket}
          onClose={() => setOpenChatTicket(null)}
        />
      )}

      {/* New Ticket Popup */}
      {newTicketOpen && createPortal(
        <>
          <div className="fixed inset-0 bg-black/50 z-[70]" onClick={() => setNewTicketOpen(false)} />
          <div
            className={
              isMobile
                ? 'fixed inset-0 z-[71] bg-background flex flex-col h-[100dvh]'
                : 'fixed z-[71] bg-background rounded-lg shadow-xl border border-border flex flex-col'
            }
            style={isMobile ? undefined : { left: popupPos.x, top: popupPos.y, width: 460, maxHeight: '80vh' }}
          >
            {!isMobile && (
              <div
                className={`flex items-center justify-start py-2 px-5 ${dragging ? 'cursor-grabbing' : 'cursor-grab'} select-none`}
                onMouseDown={handleMouseDown}
              >
                <GripHorizontal className="h-4 w-4 text-muted-foreground" />
              </div>
            )}

            <div className="flex items-center justify-between px-5 pb-4 pt-1 border-b border-border shrink-0">
              <h2 className="text-lg font-bold text-foreground select-none">New Support Ticket</h2>
              <button onClick={() => setNewTicketOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground">Category</label>
                <Select value={newCategory} onValueChange={setNewCategory}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent className="z-[80] bg-background">
                    {TICKET_CATEGORIES.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Message</label>
                <textarea
                  value={newFirstMessage}
                  onChange={e => setNewFirstMessage(e.target.value)}
                  placeholder="Describe your issue in detail..."
                  className="mt-1 flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0"
                />
              </div>
            </div>

            <div className="px-5 py-4 border-t border-border shrink-0">
              <Button
                className="w-full bg-foreground text-background hover:bg-foreground/90"
                onClick={handleCreateTicket}
                disabled={creating || !newCategory || !newFirstMessage.trim()}
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Create Ticket
              </Button>
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
