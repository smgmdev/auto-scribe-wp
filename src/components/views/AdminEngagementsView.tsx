import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, MessageSquare, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { useAppStore, GlobalChatRequest } from '@/stores/appStore';

interface ServiceRequest {
  id: string;
  title: string;
  description: string;
  status: string;
  read: boolean;
  created_at: string;
  updated_at: string;
  order_id: string | null;
  cancellation_reason: string | null;
  user_id: string;
  agency_payout_id: string | null;
  media_sites: { 
    id: string;
    name: string; 
    favicon: string | null; 
    price: number;
    publication_format: string;
    link: string;
    category: string;
    subcategory: string | null;
    about: string | null;
    agency: string | null;
  };
  profiles: { email: string; username: string | null };
  agency_payouts: { agency_name: string } | null;
  orders: { 
    id: string;
    status: string;
    delivery_status: string;
    delivery_deadline: string | null;
  } | null;
}

interface ServiceMessage {
  id: string;
  sender_type: 'client' | 'agency' | 'admin';
  message: string;
  created_at: string;
}

export function AdminEngagementsView() {
  const { openGlobalChat } = useAppStore();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [messages, setMessages] = useState<Record<string, ServiceMessage[]>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('active');

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('service_requests')
        .select(`
          *,
          media_sites (id, name, favicon, price, publication_format, link, category, subcategory, about, agency),
          agency_payouts (agency_name),
          orders (id, status, delivery_status, delivery_deadline)
        `)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      
      const userIds = [...new Set((data || []).map(r => r.user_id))];
      const { data: profiles } = await supabase.from('profiles').select('id, email, username').in('id', userIds);
      const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));
      
      const enrichedData = (data || []).map(r => ({
        ...r,
        profiles: profileMap[r.user_id] || { email: 'Unknown', username: null }
      }));
      
      setRequests(enrichedData as any);

      if (data?.length) {
        const { data: msgs } = await supabase
          .from('service_messages')
          .select('*')
          .in('request_id', data.map(r => r.id))
          .order('created_at', { ascending: true });

        const grouped: Record<string, ServiceMessage[]> = {};
        msgs?.forEach(m => {
          if (!grouped[m.request_id]) grouped[m.request_id] = [];
          grouped[m.request_id].push(m as ServiceMessage);
        });
        setMessages(grouped);
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChat = async (request: ServiceRequest) => {
    // Mark as read if not already
    if (!request.read) {
      const { error } = await supabase
        .from('service_requests')
        .update({ read: true })
        .eq('id', request.id);
      
      if (!error) {
        // Update local state - real-time subscription will handle the notification count
        setRequests(prev => prev.map(r => 
          r.id === request.id ? { ...r, read: true } : r
        ));
      }
    }

    // Build the GlobalChatRequest object to use the global chat system
    const chatRequest: GlobalChatRequest = {
      id: request.id,
      title: request.title,
      description: request.description,
      status: request.status,
      read: true,
      created_at: request.created_at,
      updated_at: request.updated_at,
      cancellation_reason: request.cancellation_reason,
      media_site: request.media_sites ? {
        id: request.media_sites.id,
        name: request.media_sites.name,
        favicon: request.media_sites.favicon,
        price: request.media_sites.price,
        publication_format: request.media_sites.publication_format,
        link: request.media_sites.link,
        category: request.media_sites.category,
        subcategory: request.media_sites.subcategory,
        about: request.media_sites.about,
        agency: request.media_sites.agency,
      } : null,
      order: request.orders ? {
        id: request.orders.id,
        status: request.orders.status,
        delivery_status: request.orders.delivery_status,
        delivery_deadline: request.orders.delivery_deadline,
      } : null,
    };

    // Open as admin viewing agency requests (same as Investigate in Order Management)
    openGlobalChat(chatRequest, 'agency-request');
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, React.ReactNode> = {
      pending_review: <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Open</Badge>,
      changes_requested: <Badge variant="outline" className="border-amber-500 text-amber-600"><AlertCircle className="h-3 w-3 mr-1" />Changes</Badge>,
      accepted: <Badge className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Accepted</Badge>,
      rejected: <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>,
      paid: <Badge className="bg-blue-600">Paid</Badge>,
      cancelled: <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Cancelled</Badge>,
    };
    return badges[status] || <Badge>{status}</Badge>;
  };

  const activeRequests = requests.filter(r => r.status !== 'cancelled');
  const cancelledRequests = requests.filter(r => r.status === 'cancelled');

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">All Engagements</h2>
        <p className="text-muted-foreground">Monitor all client-agency communications</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="active">
            Active ({activeRequests.length})
          </TabsTrigger>
          <TabsTrigger value="cancelled">
            Cancelled ({cancelledRequests.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4">
          {activeRequests.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No active engagements</CardContent></Card>
          ) : (
            <div className="grid gap-4">
              {activeRequests.map((r) => (
                <Card 
                  key={r.id} 
                  className={`cursor-pointer hover:bg-muted/50 transition-colors relative ${!r.read ? 'bg-blue-500/5 border-blue-500/30' : ''}`} 
                  onClick={() => handleOpenChat(r)}
                >
                  {!r.read && (
                    <div className="absolute top-3 right-3 h-2.5 w-2.5 rounded-full bg-blue-500" />
                  )}
                  <CardContent className="p-4 flex justify-between items-start">
                    <div className="flex items-start gap-3">
                      {r.media_sites?.favicon && (
                        <img src={r.media_sites.favicon} className="h-10 w-10 rounded mt-1" alt="" />
                      )}
                      <div>
                        <h3 className={`font-medium ${!r.read ? 'text-blue-600' : ''}`}>{r.title}</h3>
                        <p className="text-sm text-muted-foreground">{r.media_sites?.name} • {r.profiles?.email}</p>
                        <p className="text-xs text-muted-foreground mt-1">Agency: {r.agency_payouts?.agency_name || 'N/A'}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      {getStatusBadge(r.status)}
                      <p className="text-xs text-muted-foreground mt-2">{format(new Date(r.updated_at), 'MMM d, yyyy')}</p>
                      <div className="flex items-center justify-end gap-1 mt-1 text-xs text-muted-foreground">
                        <MessageSquare className="h-3 w-3" />
                        {messages[r.id]?.length || 0}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="cancelled" className="mt-4">
          {cancelledRequests.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No cancelled engagements</CardContent></Card>
          ) : (
            <div className="grid gap-4">
              {cancelledRequests.map((r) => (
                <Card key={r.id} className="cursor-pointer hover:bg-muted/50 transition-colors border-destructive/20" onClick={() => handleOpenChat(r)}>
                  <CardContent className="p-4 flex justify-between items-start">
                    <div className="flex items-start gap-3">
                      {r.media_sites?.favicon && (
                        <img src={r.media_sites.favicon} className="h-10 w-10 rounded mt-1 opacity-50" alt="" />
                      )}
                      <div>
                        <h3 className="font-medium text-muted-foreground">{r.title}</h3>
                        <p className="text-sm text-muted-foreground">{r.media_sites?.name} • {r.profiles?.email}</p>
                        <p className="text-xs text-muted-foreground mt-1">Agency: {r.agency_payouts?.agency_name || 'N/A'}</p>
                        {r.cancellation_reason && (
                          <p className="text-xs text-destructive mt-1">Reason: {r.cancellation_reason}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      {getStatusBadge(r.status)}
                      <p className="text-xs text-muted-foreground mt-2">{format(new Date(r.updated_at), 'MMM d, yyyy')}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
