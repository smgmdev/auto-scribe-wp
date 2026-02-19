import { useState, useEffect } from 'react';
import { Loader2, MessageSquare, Clock, CheckCircle, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  closed_at: string | null;
  admin_read: boolean;
  user_read: boolean;
  user_email?: string;
}

export function AdminSupportView() {
  const { user } = useAuth();
  const { unreadSupportTicketsCount, setUnreadSupportTicketsCount, openSupportChat } = useAppStore();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('open');

  const fetchTickets = async () => {
    const { data, error } = await supabase
      .from('support_tickets')
      .select('*')
      .order('updated_at', { ascending: false });

    if (!error && data) {
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

  const handleOpenTicket = async (ticket: SupportTicket) => {
    // Mark as read
    if (!ticket.admin_read) {
      await supabase.from('support_tickets').update({ admin_read: true }).eq('id', ticket.id);
      setTickets(prev => prev.map(t => t.id === ticket.id ? { ...t, admin_read: true } : t));
      setUnreadSupportTicketsCount(Math.max(0, unreadSupportTicketsCount - 1));
    }

    // Open the global floating support chat
    openSupportChat({
      id: ticket.id,
      subject: ticket.subject,
      status: ticket.status,
      created_at: ticket.created_at,
      updated_at: ticket.updated_at,
      user_read: ticket.user_read,
      admin_read: ticket.admin_read,
      user_email: ticket.user_email,
    });
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
      <div className="max-w-[980px] mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground">Support Tickets</h1>
          <p className="mt-1 text-muted-foreground">Manage user support requests</p>
        </div>

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

        <div className="space-y-0 mt-0">
          {filteredTickets.length === 0 ? (
            <div className="text-center py-16">
              <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
              <p className="text-muted-foreground">No {activeTab} tickets</p>
            </div>
          ) : (
            filteredTickets.map(ticket => (
              <button
                key={ticket.id}
                className="w-full text-left border rounded-none -mt-px first:mt-0 p-4 hover:bg-gray-50 transition-colors relative"
                onClick={() => handleOpenTicket(ticket)}
              >
                <Badge variant={ticket.status === 'open' ? 'default' : 'secondary'} className="text-xs absolute top-3 right-3">
                  {ticket.status === 'open' ? (
                    <><Clock className="h-3 w-3 mr-1" />Open</>
                  ) : (
                    <><CheckCircle className="h-3 w-3 mr-1" />Closed</>
                  )}
                </Badge>
                <div className="min-w-0 flex-1 pr-20">
                  <div className="flex items-center gap-2">
                    {!ticket.admin_read && (
                      <span className="h-2 w-2 rounded-full bg-red-500 flex-shrink-0" />
                    )}
                    <p className="font-medium text-sm truncate">{ticket.subject}</p>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <User className="h-3 w-3 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground truncate">{ticket.user_email}</p>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3 mt-1.5">
                    <p className="text-xs text-muted-foreground">
                      Ticket Opened: {format(new Date(ticket.created_at), 'MMM d, HH:mm')}
                    </p>
                    {ticket.status === 'closed' && ticket.closed_at && (
                      <p className="text-xs text-muted-foreground">
                        Ticket Closed: {format(new Date(ticket.closed_at), 'MMM d, HH:mm')}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
