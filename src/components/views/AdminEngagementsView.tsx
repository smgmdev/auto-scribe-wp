import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, MessageSquare, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface ServiceRequest {
  id: string;
  title: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
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

export function AdminEngagementsView() {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [messages, setMessages] = useState<Record<string, ServiceMessage[]>>({});
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null);

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
      
      // Fetch profiles separately
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

  const getStatusBadge = (status: string) => {
    const badges: Record<string, React.ReactNode> = {
      pending_review: <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>,
      changes_requested: <Badge variant="outline" className="border-amber-500 text-amber-600"><AlertCircle className="h-3 w-3 mr-1" />Changes</Badge>,
      accepted: <Badge className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Accepted</Badge>,
      rejected: <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>,
      paid: <Badge className="bg-blue-600">Paid</Badge>,
    };
    return badges[status] || <Badge>{status}</Badge>;
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">All Engagements</h2>
        <p className="text-muted-foreground">Monitor all client-agency communications</p>
      </div>

      {requests.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No engagements yet</CardContent></Card>
      ) : (
        <div className="grid gap-4">
          {requests.map((r) => (
            <Card key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedRequest(r)}>
              <CardContent className="p-4 flex justify-between items-start">
                <div>
                  <h3 className="font-medium">{r.title}</h3>
                  <p className="text-sm text-muted-foreground">{r.media_sites?.name} • {r.profiles?.email}</p>
                  <p className="text-xs text-muted-foreground mt-1">Agency: {r.agency_payouts?.agency_name || 'N/A'}</p>
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

      <Dialog open={!!selectedRequest} onOpenChange={() => setSelectedRequest(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{selectedRequest?.title}</DialogTitle></DialogHeader>
          {selectedRequest && (
            <ScrollArea className="h-[400px] border rounded-lg p-4">
              {(messages[selectedRequest.id] || []).map((m) => (
                <div key={m.id} className={`mb-4 flex ${m.sender_type === 'client' ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[80%] p-3 rounded-lg ${m.sender_type === 'client' ? 'bg-muted' : m.sender_type === 'agency' ? 'bg-primary text-primary-foreground' : 'bg-amber-100'}`}>
                    <p className="text-xs opacity-70 mb-1">{m.sender_type}</p>
                    <p className="text-sm">{m.message}</p>
                    <p className="text-xs opacity-50 mt-1">{format(new Date(m.created_at), 'MMM d, h:mm a')}</p>
                  </div>
                </div>
              ))}
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
