import { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, MessageSquare, Clock, CheckCircle, XCircle, AlertCircle, Send, UserPlus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';

interface ServiceRequest {
  id: string;
  title: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
  order_id: string | null;
  cancellation_reason: string | null;
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
  const { user } = useAuth();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [messages, setMessages] = useState<Record<string, ServiceMessage[]>>({});
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null);
  const [activeTab, setActiveTab] = useState('active');
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);
  const [joiningChat, setJoiningChat] = useState(false);
  const [typingUsers, setTypingUsers] = useState<{ type: string; user_id: string }[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    fetchRequests();
  }, []);

  useEffect(() => {
    if (selectedRequest) {
      checkIfJoined(selectedRequest.id);
      scrollToBottom();

      // Subscribe to realtime messages for selected request
      const channel = supabase
        .channel(`admin-engagement-${selectedRequest.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'service_messages',
            filter: `request_id=eq.${selectedRequest.id}`
          },
          (payload) => {
            const newMessage = payload.new as ServiceMessage;
            setMessages(prev => {
              const existing = prev[selectedRequest.id] || [];
              if (existing.some(m => m.id === newMessage.id)) return prev;
              return {
                ...prev,
                [selectedRequest.id]: [...existing, newMessage]
              };
            });
          }
        )
        .subscribe();

      // Subscribe to presence for typing indicators (use same keys as FloatingChatWindow)
      const presenceChannel = supabase.channel(`typing-${selectedRequest.id}`)
        .on('presence', { event: 'sync' }, () => {
          const state = presenceChannel.presenceState();
          const typing: { type: string; user_id: string }[] = [];
          Object.values(state).forEach((presences: any) => {
            presences.forEach((p: any) => {
              if (p.is_typing && p.sender_id !== user?.id) {
                typing.push({ type: p.sender_type, user_id: p.sender_id });
              }
            });
          });
          setTypingUsers(typing);
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED' && hasJoined) {
            await presenceChannel.track({
              sender_id: user?.id,
              sender_type: 'admin',
              is_typing: false
            });
          }
        });

      presenceChannelRef.current = presenceChannel;

      return () => {
        supabase.removeChannel(channel);
        supabase.removeChannel(presenceChannel);
        presenceChannelRef.current = null;
      };
    }
  }, [selectedRequest?.id, user?.id, hasJoined]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, selectedRequest?.id]);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  const sendTypingIndicator = (isTyping: boolean) => {
    if (!presenceChannelRef.current || !user || !hasJoined) return;
    presenceChannelRef.current.track({
      sender_id: user.id,
      sender_type: 'admin',
      is_typing: isTyping
    });
  };

  const handleInputChange = (value: string) => {
    setNewMessage(value);
    
    if (value.trim()) {
      sendTypingIndicator(true);
      
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        sendTypingIndicator(false);
      }, 2000);
    } else {
      sendTypingIndicator(false);
    }
  };


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

  const checkIfJoined = async (requestId: string) => {
    if (!user) return;
    const { data } = await supabase
      .from('admin_investigations')
      .select('id')
      .eq('service_request_id', requestId)
      .eq('admin_id', user.id)
      .eq('status', 'active')
      .maybeSingle();
    setHasJoined(!!data);
  };

  const handleJoinChat = async () => {
    if (!selectedRequest || !user) return;
    setJoiningChat(true);
    try {
      const { error: invError } = await supabase
        .from('admin_investigations')
        .upsert({
          admin_id: user.id,
          service_request_id: selectedRequest.id,
          order_id: selectedRequest.order_id || selectedRequest.id,
          status: 'active'
        }, { onConflict: 'service_request_id' });

      if (invError) throw invError;

      setHasJoined(true);
      toast({ title: 'Joined chat', description: 'You can now participate in this engagement.' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setJoiningChat(false);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedRequest || !user) return;
    setSending(true);
    try {
      const { error } = await supabase.from('service_messages').insert({
        request_id: selectedRequest.id,
        sender_id: user.id,
        sender_type: 'admin',
        message: newMessage.trim()
      });

      if (error) throw error;

      setMessages(prev => ({
        ...prev,
        [selectedRequest.id]: [...(prev[selectedRequest.id] || []), {
          id: crypto.randomUUID(),
          sender_type: 'admin',
          message: newMessage.trim(),
          created_at: new Date().toISOString()
        }]
      }));
      setNewMessage('');
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setSending(false);
    }
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

  const isCancelled = selectedRequest?.status === 'cancelled';

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
                <Card key={r.id} className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setSelectedRequest(r)}>
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
                <Card key={r.id} className="cursor-pointer hover:bg-muted/50 transition-colors border-destructive/20" onClick={() => setSelectedRequest(r)}>
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

      {/* Chat Dialog */}
      <Dialog open={!!selectedRequest} onOpenChange={() => setSelectedRequest(null)}>
        <DialogContent className="max-w-2xl h-[600px] flex flex-col p-0">
          <DialogHeader className={`p-4 border-b ${isCancelled ? 'bg-destructive/10' : ''}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {selectedRequest?.media_sites?.favicon && (
                  <img src={selectedRequest.media_sites.favicon} className="h-8 w-8 rounded" alt="" />
                )}
                <div>
                  <DialogTitle>{selectedRequest?.title}</DialogTitle>
                  <p className="text-sm text-muted-foreground">
                    {selectedRequest?.media_sites?.name} • {selectedRequest?.profiles?.email}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedRequest && getStatusBadge(selectedRequest.status)}
                {!hasJoined && !isCancelled && (
                  <Button size="sm" onClick={handleJoinChat} disabled={joiningChat}>
                    {joiningChat ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <UserPlus className="h-4 w-4 mr-1" />}
                    Join
                  </Button>
                )}
                {hasJoined && <Badge variant="outline" className="bg-green-50 text-green-700">Joined</Badge>}
              </div>
            </div>
          </DialogHeader>

          {isCancelled && (
            <div className="px-4 py-2 bg-destructive/5 border-b">
              <p className="text-sm text-destructive font-medium">This engagement has been cancelled.</p>
              {selectedRequest?.cancellation_reason && (
                <p className="text-sm text-muted-foreground">{selectedRequest.cancellation_reason}</p>
              )}
            </div>
          )}

          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            <div className="space-y-4">
              {selectedRequest && (messages[selectedRequest.id] || []).map((m) => (
                <div key={m.id} className={`flex ${m.sender_type === 'client' ? 'justify-start' : m.sender_type === 'admin' ? 'justify-center' : 'justify-end'}`}>
                  <div className={`max-w-[80%] p-3 rounded-lg ${
                    m.sender_type === 'client' 
                      ? 'bg-muted' 
                      : m.sender_type === 'agency' 
                        ? 'bg-primary text-primary-foreground' 
                        : 'bg-amber-100 dark:bg-amber-900/30 border border-amber-300'
                  }`}>
                    <p className="text-xs opacity-70 mb-1 capitalize">{m.sender_type}</p>
                    <p className="text-sm whitespace-pre-wrap">{m.message}</p>
                    <p className="text-xs opacity-50 mt-1">{format(new Date(m.created_at), 'MMM d, h:mm a')}</p>
                  </div>
                </div>
              ))}
              
              {/* Typing indicators */}
              {typingUsers.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span>
                    {typingUsers.map(u => u.type).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
                  </span>
                </div>
              )}
            </div>
          </ScrollArea>

          {hasJoined && !isCancelled && (
            <div className="p-4 border-t">
              <div className="flex gap-2">
                <Input
                  placeholder="Type a message..."
                  value={newMessage}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      sendTypingIndicator(false);
                      handleSendMessage();
                    }
                  }}
                  disabled={sending}
                />
                <Button onClick={() => { sendTypingIndicator(false); handleSendMessage(); }} disabled={sending || !newMessage.trim()}>
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )}

          {!hasJoined && !isCancelled && (
            <div className="p-4 border-t text-center text-muted-foreground text-sm">
              Join the chat to send messages
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}