import { useState, useEffect, useRef } from 'react';
import { Loader2, Send, MessageSquare, Clock, CheckCircle, ChevronLeft, User, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useAppStore } from '@/stores/appStore';

interface SupportTicket {
  id: string;
  user_id: string;
  subject: string;
  status: string;
  created_at: string;
  updated_at: string;
  admin_read: boolean;
  user_email?: string;
}

interface SupportMessage {
  id: string;
  ticket_id: string;
  sender_id: string;
  sender_type: string;
  message: string;
  created_at: string;
}

export function AdminSupportView() {
  const { user } = useAuth();
  const { unreadSupportTicketsCount, setUnreadSupportTicketsCount } = useAppStore();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [activeTab, setActiveTab] = useState('open');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch tickets with user email
  const fetchTickets = async () => {
    const { data, error } = await supabase
      .from('support_tickets')
      .select('*')
      .order('updated_at', { ascending: false });

    if (!error && data) {
      // Fetch user emails
      const userIds = [...new Set(data.map(t => t.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email')
        .in('id', userIds);

      const emailMap = new Map(profiles?.map(p => [p.id, p.email]) || []);
      const enriched = data.map(t => ({ ...t, user_email: emailMap.get(t.user_id) || 'Unknown' }));
      setTickets(enriched);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTickets();

    const channel = supabase
      .channel('admin-support-tickets')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, () => {
        fetchTickets();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Fetch messages
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
      if (!selectedTicket.admin_read) {
        await supabase.from('support_tickets').update({ admin_read: true }).eq('id', selectedTicket.id);
        setTickets(prev => prev.map(t => t.id === selectedTicket.id ? { ...t, admin_read: true } : t));
        setUnreadSupportTicketsCount(Math.max(0, unreadSupportTicketsCount - 1));
      }
    };
    fetchMessages();

    const channel = supabase
      .channel(`admin-support-messages-${selectedTicket.id}`)
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

  const handleSendMessage = async () => {
    if (!user || !selectedTicket || !newMessage.trim()) return;
    setSending(true);
    try {
      const { error } = await supabase.from('support_messages').insert({
        ticket_id: selectedTicket.id,
        sender_id: user.id,
        sender_type: 'admin',
        message: newMessage.trim()
      });
      if (error) throw error;

      await supabase.from('support_tickets').update({ user_read: false, updated_at: new Date().toISOString() }).eq('id', selectedTicket.id);

      setNewMessage('');
    } catch (err) {
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleCloseTicket = async () => {
    if (!selectedTicket) return;
    try {
      await supabase.from('support_tickets').update({ 
        status: 'closed', 
        closed_at: new Date().toISOString() 
      }).eq('id', selectedTicket.id);
      setSelectedTicket(prev => prev ? { ...prev, status: 'closed' } : null);
      toast.success('Ticket closed');
    } catch {
      toast.error('Failed to close ticket');
    }
  };

  const handleReopenTicket = async () => {
    if (!selectedTicket) return;
    try {
      await supabase.from('support_tickets').update({ 
        status: 'open', 
        closed_at: null 
      }).eq('id', selectedTicket.id);
      setSelectedTicket(prev => prev ? { ...prev, status: 'open' } : null);
      toast.success('Ticket reopened');
    } catch {
      toast.error('Failed to reopen ticket');
    }
  };

  const filteredTickets = tickets.filter(t => {
    if (activeTab === 'open') return t.status === 'open';
    return t.status === 'closed';
  });

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
                    From: {selectedTicket.user_email} · {format(new Date(selectedTicket.created_at), 'MMM d, yyyy')}
                    {' · '}
                    <Badge variant={selectedTicket.status === 'open' ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0">
                      {selectedTicket.status}
                    </Badge>
                  </p>
                </div>
              </div>
            ) : (
              <>
                <h1 className="text-3xl font-bold text-foreground">Support Tickets</h1>
                <p className="mt-1 text-muted-foreground">Manage user support requests</p>
              </>
            )}
          </div>
          {selectedTicket && (
            <div>
              {selectedTicket.status === 'open' ? (
                <Button variant="outline" size="sm" onClick={handleCloseTicket}>
                  <XCircle className="h-4 w-4 mr-1" /> Close Ticket
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={handleReopenTicket}>
                  <Clock className="h-4 w-4 mr-1" /> Reopen
                </Button>
              )}
            </div>
          )}
        </div>

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
                    <div key={msg.id} className={`flex ${msg.sender_type === 'admin' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] rounded-lg px-4 py-2.5 ${
                        msg.sender_type === 'admin'
                          ? 'bg-black text-white'
                          : 'bg-gray-100 text-foreground'
                      }`}>
                        <p className="text-[10px] font-medium mb-1 opacity-70">
                          {msg.sender_type === 'admin' ? 'Support' : 'User'}
                        </p>
                        <p className="text-sm whitespace-pre-wrap break-words">{msg.message}</p>
                        <p className={`text-[10px] mt-1 ${msg.sender_type === 'admin' ? 'text-white/60' : 'text-muted-foreground'}`}>
                          {format(new Date(msg.created_at), 'MMM d, HH:mm')}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            <div className="border-t p-3 flex gap-2">
              <Input
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                placeholder="Type a reply..."
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
          </div>
        ) : (
          <>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full p-0 h-auto">
                <TabsTrigger value="open" className="flex-1 py-2.5 text-sm">
                  Open {tickets.filter(t => t.status === 'open').length > 0 && (
                    <Badge variant="destructive" className="ml-2 text-[10px] px-1.5 py-0">
                      {tickets.filter(t => t.status === 'open').length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="closed" className="flex-1 py-2.5 text-sm">
                  Closed
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="space-y-2">
              {filteredTickets.length === 0 ? (
                <div className="text-center py-16">
                  <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
                  <p className="text-muted-foreground">No {activeTab} tickets</p>
                </div>
              ) : (
                filteredTickets.map(ticket => (
                  <button
                    key={ticket.id}
                    className="w-full text-left border rounded-lg p-4 hover:bg-gray-50 transition-colors flex items-center justify-between gap-4"
                    onClick={() => setSelectedTicket(ticket)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {!ticket.admin_read && (
                          <span className="h-2 w-2 rounded-full bg-red-500 flex-shrink-0" />
                        )}
                        <p className="font-medium text-sm truncate">{ticket.subject}</p>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <User className="h-3 w-3 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground truncate">{ticket.user_email}</p>
                        <span className="text-xs text-muted-foreground">·</span>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(ticket.updated_at), 'MMM d, HH:mm')}
                        </p>
                      </div>
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
          </>
        )}
      </div>
    </div>
  );
}
