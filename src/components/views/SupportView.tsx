import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, MessageSquare, Clock, CheckCircle, X, GripHorizontal, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/use-mobile';
import { pushPopup, removePopup } from '@/lib/popup-stack';
import { useAppStore } from '@/stores/appStore';
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
  closed_at: string | null;
  user_read: boolean;
  last_message_at?: string;
  last_message_sender?: string;
}

// ─── Main Support View ───
export function SupportView() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const { openSupportChat } = useAppStore();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('open');
  const [hasCreditsHistory, setHasCreditsHistory] = useState<boolean | null>(null);

  // New ticket popup state
  const [newTicketOpen, setNewTicketOpen] = useState(false);
  const [newFirstMessage, setNewFirstMessage] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [creating, setCreating] = useState(false);

  // New ticket popup drag
  // Initialize position centered immediately to avoid flash
  const [popupPos, setPopupPos] = useState(() => {
    if (typeof window !== 'undefined') {
      const w = 460, h = 480;
      return {
        x: Math.max(0, (window.innerWidth - w) / 2),
        y: Math.max(0, (window.innerHeight - h) / 2),
      };
    }
    return { x: 0, y: 0 };
  });
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

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

  // Check credits history in real time
  useEffect(() => {
    if (!user) return;
    const checkCredits = async () => {
      const { data } = await supabase
        .from('credit_transactions')
        .select('id')
        .eq('user_id', user.id)
        .not('type', 'in', '(withdrawal_locked,withdrawal_completed)')
        .limit(1);
      setHasCreditsHistory(!!(data && data.length > 0));
    };
    checkCredits();

    const creditChannel = supabase
      .channel('support-credit-check')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'credit_transactions', filter: `user_id=eq.${user.id}` }, () => {
        checkCredits();
      })
      .subscribe();

    return () => { supabase.removeChannel(creditChannel); };
  }, [user]);

  // Fetch tickets
  useEffect(() => {
    if (!user) return;
    const fetchTickets = async () => {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });
      if (!error && data) {
        // Fetch last message for each ticket
        const ticketIds = data.map(t => t.id);
        const { data: lastMessages } = await supabase
          .from('support_messages')
          .select('ticket_id, sender_type, created_at')
          .in('ticket_id', ticketIds)
          .order('created_at', { ascending: false });

        const lastMessageMap = new Map<string, { created_at: string; sender_type: string }>();
        lastMessages?.forEach(msg => {
          if (!lastMessageMap.has(msg.ticket_id)) {
            lastMessageMap.set(msg.ticket_id, { created_at: msg.created_at, sender_type: msg.sender_type });
          }
        });

        const enriched = data.map(t => ({
          ...t,
          last_message_at: lastMessageMap.get(t.id)?.created_at,
          last_message_sender: lastMessageMap.get(t.id)?.sender_type,
        }));
        setTickets(enriched);
      }
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

      // Telegram alert for new support ticket (fire-and-forget)
      supabase.functions.invoke('send-telegram', {
        body: { message: `🎫 <b>New Support Ticket</b>\n📝 ${newCategory}\n📧 ${user.email || 'Unknown'}` }
      }).catch(() => {});

      setNewFirstMessage('');
      setNewCategory('');
      setNewTicketOpen(false);
      openSupportChat(ticket);
      toast.success('Support ticket created');
    } catch {
      toast.error('Failed to create ticket');
    } finally {
      setCreating(false);
    }
  };

  if (loading || hasCreditsHistory === null) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isLocked = !hasCreditsHistory;

  return (
    <div className="animate-fade-in bg-white min-h-[calc(100vh-56px)] lg:min-h-screen -m-4 lg:-m-8 p-4 lg:p-8">
      <div className="max-w-[980px] mx-auto space-y-4">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Support</h1>
            <p className="mt-1 text-muted-foreground">Ask Arcana Mace staff</p>
          </div>
          <Button
            className="w-full lg:w-auto bg-foreground text-background hover:bg-transparent hover:text-foreground border border-foreground"
            onClick={() => !isLocked && setNewTicketOpen(true)}
            disabled={isLocked}
          >
            New Ticket
          </Button>
        </div>

        {/* Body — blurred when locked */}
        <div className="relative">
          <div className={isLocked ? 'pointer-events-none select-none blur-sm' : undefined}>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full p-0 h-auto">
                <TabsTrigger value="open" className="flex-1 py-2.5 text-sm">
                  Open <span className="ml-1 text-sm">({tickets.filter(t => t.status === 'open').length})</span>
                </TabsTrigger>
                <TabsTrigger value="closed" className="flex-1 py-2.5 text-sm">
                  Closed <span className="ml-1 text-sm">({tickets.filter(t => t.status === 'closed').length})</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Ticket List */}
            <div className="space-y-0 mt-0">
              {tickets.filter(t => activeTab === 'open' ? t.status === 'open' : t.status === 'closed').length === 0 ? (
                <div className="text-center py-16">
                  <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
                  <p className="text-muted-foreground">No {activeTab} tickets</p>
                  {activeTab === 'open' && (
                    <p className="text-sm text-muted-foreground mt-1">Click "New Ticket" to get started</p>
                  )}
                </div>
              ) : (
                tickets.filter(t => activeTab === 'open' ? t.status === 'open' : t.status === 'closed').map(ticket => (
                  <button
                    key={ticket.id}
                    className={`w-full text-left border rounded-none -mt-px first:mt-0 p-4 hover:bg-muted/50 transition-colors relative ${!ticket.user_read ? 'bg-blue-50' : ''}`}
                    onClick={() => {
                      if (!ticket.user_read) {
                        supabase.from('support_tickets').update({ user_read: true }).eq('id', ticket.id);
                        setTickets(prev => prev.map(t => t.id === ticket.id ? { ...t, user_read: true } : t));
                        useAppStore.getState().decrementUserUnreadSupportTicketsCount();
                      }
                      openSupportChat(ticket);
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 w-full">
                        {!ticket.user_read && (
                          <span className="h-2 w-2 rounded-full bg-blue-500 flex-shrink-0" />
                        )}
                        <p className="font-medium text-sm truncate flex-1">{ticket.subject}</p>
                        <Badge variant={ticket.status === 'open' ? 'default' : 'secondary'} className="text-xs flex-shrink-0">
                          {ticket.status === 'open' ? (
                            <><Clock className="h-3 w-3 mr-1" />Open</>
                          ) : (
                            <><CheckCircle className="h-3 w-3 mr-1" />Closed</>
                          )}
                        </Badge>
                      </div>
                      <div className="flex flex-col gap-0.5 mt-1.5">
                        <p className="text-xs text-muted-foreground">
                          Ticket Opened: {format(new Date(ticket.created_at), 'MMM d, yyyy HH:mm')}
                        </p>
                        {ticket.last_message_at && (
                          <p className="text-xs text-muted-foreground">
                            Last Message: {format(new Date(ticket.last_message_at), 'MMM d, yyyy HH:mm')} — from {ticket.last_message_sender === 'admin' ? 'Staff' : 'You'}
                          </p>
                        )}
                        {ticket.status === 'closed' && ticket.closed_at && (
                          <p className="text-xs text-muted-foreground">
                            Ticket Closed: {format(new Date(ticket.closed_at), 'MMM d, yyyy HH:mm')}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Locked overlay */}
          {isLocked && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-background/95 border border-border px-8 py-8 max-w-sm w-full mx-4 text-center shadow-lg">
                <div className="flex items-center justify-center h-12 w-12 bg-muted mx-auto mb-4">
                  <Lock className="h-5 w-5 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">Support Unavailable</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Arcana Mace Client Support is available to accounts that have a credit history — either through purchases (buying credits) or earnings (selling media).
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

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
            {/* Drag bar - always visible */}
            <div
              className={`flex items-center justify-between border-b bg-muted/30 shrink-0 ${
                isMobile
                  ? 'px-3 py-1.5'
                  : `px-4 py-2 ${dragging ? 'cursor-grabbing' : 'cursor-grab'} select-none`
              }`}
              onMouseDown={!isMobile ? handleMouseDown : undefined}
            >
              <GripHorizontal className="h-4 w-4 text-muted-foreground" />
              <button
                onClick={() => setNewTicketOpen(false)}
                onMouseDown={(e) => !isMobile && e.stopPropagation()}
                className="rounded-sm transition-all hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black focus:outline-none h-7 w-7 flex items-center justify-center"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center justify-between px-5 pb-3 pt-2 border-b border-border shrink-0">
              <h2 className="text-lg font-bold text-foreground select-none">New Support Ticket</h2>
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
                className="w-full bg-foreground text-background border border-transparent hover:!bg-transparent hover:!text-foreground hover:!border-foreground transition-all"
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
