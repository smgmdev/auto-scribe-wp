import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, MessageSquare, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { AdminFloatingChat } from '@/components/chat/AdminFloatingChat';

interface ServiceRequest {
  id: string;
  title: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
  order_id: string | null;
  cancellation_reason: string | null;
  user_id: string;
  agency_payout_id: string | null;
  media_sites: { name: string; favicon: string | null; price: number };
  profiles: { email: string; username: string | null };
  agency_payouts: { agency_name: string } | null;
}

interface ServiceMessage {
  id: string;
  sender_type: 'client' | 'agency' | 'admin';
  message: string;
  created_at: string;
}

interface OpenChat {
  request: ServiceRequest;
  position: { x: number; y: number };
  zIndex: number;
}

export function AdminEngagementsView() {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [messages, setMessages] = useState<Record<string, ServiceMessage[]>>({});
  const [loading, setLoading] = useState(true);
  const [openChats, setOpenChats] = useState<OpenChat[]>([]);
  const [activeTab, setActiveTab] = useState('active');
  const [nextZIndex, setNextZIndex] = useState(1000);

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('service_requests')
        .select(`*, media_sites (name, favicon, price), agency_payouts (agency_name)`)
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

  const handleMessagesUpdate = useCallback((requestId: string, updatedMessages: ServiceMessage[]) => {
    setMessages(prev => ({
      ...prev,
      [requestId]: updatedMessages
    }));
  }, []);

  const openChat = (request: ServiceRequest) => {
    // Check if already open
    const existingIndex = openChats.findIndex(c => c.request.id === request.id);
    if (existingIndex !== -1) {
      // Bring to front
      bringToFront(request.id);
      return;
    }
    
    // Calculate offset position for stacking effect
    const offset = openChats.length * 30;
    const newChat: OpenChat = {
      request,
      position: { x: offset, y: offset },
      zIndex: nextZIndex
    };
    
    setOpenChats(prev => [...prev, newChat]);
    setNextZIndex(prev => prev + 1);
  };

  const closeChat = (requestId: string) => {
    setOpenChats(prev => prev.filter(c => c.request.id !== requestId));
  };

  const bringToFront = (requestId: string) => {
    setOpenChats(prev => prev.map(chat => 
      chat.request.id === requestId 
        ? { ...chat, zIndex: nextZIndex }
        : chat
    ));
    setNextZIndex(prev => prev + 1);
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, React.ReactNode> = {
      pending_review: <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>,
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
            Active
            {activeRequests.length > 0 && (
              <Badge variant="secondary" className="ml-2">{activeRequests.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="cancelled">
            Cancelled
            {cancelledRequests.length > 0 && (
              <Badge variant="secondary" className="ml-2">{cancelledRequests.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4">
          {activeRequests.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No active engagements</CardContent></Card>
          ) : (
            <div className="grid gap-4">
              {activeRequests.map((r) => (
                <Card key={r.id} className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => openChat(r)}>
                  <CardContent className="p-4 flex justify-between items-start">
                    <div className="flex items-start gap-3">
                      {r.media_sites?.favicon && (
                        <img src={r.media_sites.favicon} className="h-10 w-10 rounded mt-1" alt="" />
                      )}
                      <div>
                        <h3 className="font-medium">{r.title}</h3>
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
                <Card key={r.id} className="cursor-pointer hover:bg-muted/50 transition-colors border-destructive/20" onClick={() => openChat(r)}>
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

      {/* Multiple Floating Chat Windows */}
      {openChats.map((chat) => (
        <AdminFloatingChat
          key={chat.request.id}
          request={chat.request}
          messages={messages[chat.request.id] || []}
          onClose={() => closeChat(chat.request.id)}
          onMessagesUpdate={handleMessagesUpdate}
          position={chat.position}
          zIndex={chat.zIndex}
        />
      ))}
    </div>
  );
}
