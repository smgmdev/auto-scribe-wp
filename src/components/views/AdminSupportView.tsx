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
      <div className="max-w-[980px] mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Support Tickets</h1>
          <p className="mt-1 text-muted-foreground">Manage user support requests</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full p-0 h-auto">
            <TabsTrigger value="open" className="flex-1 py-2.5 text-sm">
              Open {tickets.filter(t => t.status === 'open').length > 0 && (
                <span className="ml-1 text-sm">({tickets.filter(t => t.status === 'open').length})</span>
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
                onClick={() => handleOpenTicket(ticket)}
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
      </div>
    </div>
  );
}
