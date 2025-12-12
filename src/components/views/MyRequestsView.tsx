import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, MessageSquare, Send, CreditCard, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface ServiceRequest {
  id: string;
  title: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
  media_site_id: string;
  order_id: string | null;
  media_sites: {
    name: string;
    favicon: string | null;
    price: number;
  };
}

interface ServiceMessage {
  id: string;
  request_id: string;
  sender_type: 'client' | 'agency' | 'admin';
  sender_id: string;
  message: string;
  created_at: string;
}

export function MyRequestsView() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [messages, setMessages] = useState<Record<string, ServiceMessage[]>>({});
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (user) {
      fetchRequests();
    }
  }, [user]);

  const fetchRequests = async () => {
    if (!user) return;

    try {
      const { data: requestsData, error: reqError } = await supabase
        .from('service_requests')
        .select(`
          *,
          media_sites (name, favicon, price)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (reqError) throw reqError;

      setRequests(requestsData || []);

      // Fetch messages for all requests
      if (requestsData && requestsData.length > 0) {
        const requestIds = requestsData.map(r => r.id);
        const { data: messagesData } = await supabase
          .from('service_messages')
          .select('*')
          .in('request_id', requestIds)
          .order('created_at', { ascending: true });

        const messagesByRequest: Record<string, ServiceMessage[]> = {};
        messagesData?.forEach(msg => {
          if (!messagesByRequest[msg.request_id]) {
            messagesByRequest[msg.request_id] = [];
          }
          messagesByRequest[msg.request_id].push(msg as ServiceMessage);
        });
        setMessages(messagesByRequest);
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to load requests',
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!user || !selectedRequest || !newMessage.trim()) return;

    setSending(true);
    try {
      const { error } = await supabase.from('service_messages').insert({
        request_id: selectedRequest.id,
        sender_type: 'client',
        sender_id: user.id,
        message: newMessage.trim()
      });

      if (error) throw error;

      // Update local state
      const newMsg: ServiceMessage = {
        id: crypto.randomUUID(),
        request_id: selectedRequest.id,
        sender_type: 'client',
        sender_id: user.id,
        message: newMessage.trim(),
        created_at: new Date().toISOString()
      };

      setMessages(prev => ({
        ...prev,
        [selectedRequest.id]: [...(prev[selectedRequest.id] || []), newMsg]
      }));

      setNewMessage('');
      toast({ title: 'Message sent' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to send message',
        description: error.message,
      });
    } finally {
      setSending(false);
    }
  };

  const proceedToPayment = async (request: ServiceRequest) => {
    setPaying(true);
    try {
      const response = await supabase.functions.invoke('create-escrow-payment', {
        body: { 
          media_site_id: request.media_site_id,
          service_request_id: request.id
        }
      });

      if (response.error) throw new Error(response.error.message);
      if (response.data?.error) throw new Error(response.data.error);

      if (response.data?.url) {
        window.open(response.data.url, '_blank');
        toast({
          title: 'Redirecting to checkout',
          description: 'Complete your payment in the new tab.',
        });
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Payment failed',
        description: error.message,
      });
    } finally {
      setPaying(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending_review':
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending Review</Badge>;
      case 'changes_requested':
        return <Badge variant="outline" className="border-amber-500 text-amber-600"><AlertCircle className="h-3 w-3 mr-1" />Changes Requested</Badge>;
      case 'accepted':
        return <Badge className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Accepted - Ready to Pay</Badge>;
      case 'rejected':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      case 'paid':
        return <Badge className="bg-blue-600"><CreditCard className="h-3 w-3 mr-1" />Paid</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">My Requests</h2>
        <p className="text-muted-foreground">Track your service requests and communicate with agencies</p>
      </div>

      {requests.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No requests yet</p>
            <p className="text-sm text-muted-foreground">Browse media sites and submit a brief to get started</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {requests.map((request) => (
            <Card 
              key={request.id} 
              className="cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => setSelectedRequest(request)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {request.media_sites?.favicon && (
                      <img src={request.media_sites.favicon} alt="" className="w-10 h-10 rounded" />
                    )}
                    <div>
                      <h3 className="font-medium">{request.title}</h3>
                      <p className="text-sm text-muted-foreground">{request.media_sites?.name}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {getStatusBadge(request.status)}
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(request.updated_at), 'MMM d, yyyy')}
                    </span>
                  </div>
                </div>
                {messages[request.id]?.length > 0 && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    {messages[request.id].length} message{messages[request.id].length > 1 ? 's' : ''}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Request Detail Dialog */}
      <Dialog open={!!selectedRequest} onOpenChange={() => setSelectedRequest(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedRequest?.media_sites?.favicon && (
                <img src={selectedRequest.media_sites.favicon} alt="" className="w-6 h-6 rounded" />
              )}
              {selectedRequest?.title}
            </DialogTitle>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{selectedRequest.media_sites?.name}</p>
                {getStatusBadge(selectedRequest.status)}
              </div>

              {/* Messages */}
              <ScrollArea className="h-[300px] border rounded-lg p-4">
                <div className="space-y-4">
                  {(messages[selectedRequest.id] || []).map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.sender_type === 'client' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg p-3 ${
                          msg.sender_type === 'client'
                            ? 'bg-primary text-primary-foreground'
                            : msg.sender_type === 'admin'
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-muted'
                        }`}
                      >
                        <p className="text-xs font-medium mb-1 opacity-70">
                          {msg.sender_type === 'client' ? 'You' : msg.sender_type === 'admin' ? 'Admin' : 'Agency'}
                        </p>
                        <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                        <p className="text-xs opacity-50 mt-1">
                          {format(new Date(msg.created_at), 'MMM d, h:mm a')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {/* Reply Input */}
              {selectedRequest.status !== 'rejected' && selectedRequest.status !== 'paid' && (
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Type your message..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    rows={2}
                    disabled={sending}
                  />
                  <Button onClick={sendMessage} disabled={sending || !newMessage.trim()}>
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              )}

              {/* Payment Button */}
              {selectedRequest.status === 'accepted' && (
                <Button 
                  className="w-full bg-green-600 hover:bg-green-700"
                  onClick={() => proceedToPayment(selectedRequest)}
                  disabled={paying}
                >
                  {paying ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <CreditCard className="h-4 w-4 mr-2" />
                  )}
                  Proceed to Payment - ${selectedRequest.media_sites?.price}
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
