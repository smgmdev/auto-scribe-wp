import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Loader2, MessageSquare, Clock, CheckCircle, X, GripHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  user_read: boolean;
}

// ─── Main Support View ───
export function SupportView() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const { openSupportChat } = useAppStore();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);

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
      openSupportChat(ticket);
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
                onClick={() => openSupportChat(ticket)}
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
