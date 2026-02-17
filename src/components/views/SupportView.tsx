import { useState, useEffect, useRef } from 'react';
import { Plus, Loader2, Send, MessageSquare, Clock, CheckCircle, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { format } from 'date-fns';

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

export function SupportView() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [newTicketOpen, setNewTicketOpen] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newFirstMessage, setNewFirstMessage] = useState('');
  const [creating, setCreating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

    // Real-time ticket updates
    const channel = supabase
      .channel('user-support-tickets')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets', filter: `user_id=eq.${user.id}` }, () => {
        fetchTickets();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Fetch messages when ticket selected
  useEffect(() => {
    if (!selectedTicket) return;
    const fetchMessages = async () => {
      setLoadingMessages(true);
      const { data, error } = await supabase
        .from('support_messages')
        .select('*')
        .eq('ticket_id', selectedTicket.id)
        .order('created_at', { ascending: true });
      if (!error && data) setMessages(data);
      setLoadingMessages(false);

      // Mark as read
      if (!selectedTicket.user_read) {
        await supabase.from('support_tickets').update({ user_read: true }).eq('id', selectedTicket.id);
        setTickets(prev => prev.map(t => t.id === selectedTicket.id ? { ...t, user_read: true } : t));
      }
    };
    fetchMessages();

    // Real-time messages
    const channel = supabase
      .channel(`support-messages-${selectedTicket.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages', filter: `ticket_id=eq.${selectedTicket.id}` }, (payload) => {
        setMessages(prev => [...prev, payload.new as SupportMessage]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedTicket?.id]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleCreateTicket = async () => {
    if (!user || !newSubject.trim() || !newFirstMessage.trim()) return;
    setCreating(true);
    try {
      const { data: ticket, error } = await supabase
        .from('support_tickets')
        .insert({ user_id: user.id, subject: newSubject.trim() })
        .select()
        .single();
      if (error) throw error;

      await supabase.from('support_messages').insert({
        ticket_id: ticket.id,
        sender_id: user.id,
        sender_type: 'user',
        message: newFirstMessage.trim()
      });

      setNewSubject('');
      setNewFirstMessage('');
      setNewTicketOpen(false);
      setSelectedTicket(ticket);
      toast.success('Support ticket created');
    } catch (err) {
      toast.error('Failed to create ticket');
    } finally {
      setCreating(false);
    }
  };

  const handleSendMessage = async () => {
    if (!user || !selectedTicket || !newMessage.trim()) return;
    setSending(true);
    try {
      const { error } = await supabase.from('support_messages').insert({
        ticket_id: selectedTicket.id,
        sender_id: user.id,
        sender_type: 'user',
        message: newMessage.trim()
      });
      if (error) throw error;

      // Update ticket to mark as unread for admin
      await supabase.from('support_tickets').update({ admin_read: false, updated_at: new Date().toISOString() }).eq('id', selectedTicket.id);

      setNewMessage('');
    } catch (err) {
      toast.error('Failed to send message');
    } finally {
      setSending(false);
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
            {selectedTicket ? (
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" onClick={() => setSelectedTicket(null)} className="h-8 w-8">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div>
                  <h1 className="text-2xl font-bold text-foreground">{selectedTicket.subject}</h1>
                  <p className="text-sm text-muted-foreground">
                    Opened {format(new Date(selectedTicket.created_at), 'MMM d, yyyy')}
                    {' · '}
                    <Badge variant={selectedTicket.status === 'open' ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0">
                      {selectedTicket.status}
                    </Badge>
                  </p>
                </div>
              </div>
            ) : (
              <>
                <h1 className="text-3xl font-bold text-foreground">Support</h1>
                <p className="mt-1 text-muted-foreground">Get help from our team</p>
              </>
            )}
          </div>
          {!selectedTicket && (
            <Button
              className="bg-black text-white hover:bg-black/90"
              onClick={() => setNewTicketOpen(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              New Ticket
            </Button>
          )}
        </div>

        {/* Ticket List or Chat */}
        {selectedTicket ? (
          <div className="border rounded-lg bg-white flex flex-col" style={{ height: 'calc(100vh - 240px)' }}>
            <ScrollArea className="flex-1 p-4">
              {loadingMessages ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : messages.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No messages yet</p>
              ) : (
                <div className="space-y-4">
                  {messages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.sender_type === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] rounded-lg px-4 py-2.5 ${
                        msg.sender_type === 'user'
                          ? 'bg-black text-white'
                          : 'bg-gray-100 text-foreground'
                      }`}>
                        <p className="text-sm whitespace-pre-wrap break-words">{msg.message}</p>
                        <p className={`text-[10px] mt-1 ${msg.sender_type === 'user' ? 'text-white/60' : 'text-muted-foreground'}`}>
                          {format(new Date(msg.created_at), 'MMM d, HH:mm')}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            {selectedTicket.status === 'open' && (
              <div className="border-t p-3 flex gap-2">
                <Input
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="h-10"
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                />
                <Button
                  size="icon"
                  className="h-10 w-10 bg-black text-white hover:bg-black/90 flex-shrink-0"
                  onClick={handleSendMessage}
                  disabled={sending || !newMessage.trim()}
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            )}
            {selectedTicket.status === 'closed' && (
              <div className="border-t p-3 text-center text-sm text-muted-foreground">
                This ticket has been closed
              </div>
            )}
          </div>
        ) : (
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
                  className="w-full text-left border rounded-lg p-4 hover:bg-gray-50 transition-colors flex items-center justify-between gap-4"
                  onClick={() => setSelectedTicket(ticket)}
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
        )}
      </div>

      {/* New Ticket Dialog */}
      <Dialog open={newTicketOpen} onOpenChange={setNewTicketOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Support Ticket</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Subject</label>
              <Input
                value={newSubject}
                onChange={e => setNewSubject(e.target.value)}
                placeholder="Brief description of your issue"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Message</label>
              <textarea
                value={newFirstMessage}
                onChange={e => setNewFirstMessage(e.target.value)}
                placeholder="Describe your issue in detail..."
                className="mt-1 flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0"
              />
            </div>
            <Button
              className="w-full bg-black text-white hover:bg-black/90"
              onClick={handleCreateTicket}
              disabled={creating || !newSubject.trim() || !newFirstMessage.trim()}
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create Ticket
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
