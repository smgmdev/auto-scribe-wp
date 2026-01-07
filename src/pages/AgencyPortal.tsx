import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, MessageSquare, Send, CheckCircle, XCircle, AlertCircle, Clock, LogOut, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import amlogo from '@/assets/amlogo.png';

interface ServiceRequest {
  id: string;
  title: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
  media_sites: {
    name: string;
    favicon: string | null;
    price: number;
  };
  profiles: {
    email: string;
    username: string | null;
  };
  messages: ServiceMessage[];
  orders: {
    id: string;
    agency_read: boolean;
    delivery_status: string;
    accepted_at: string | null;
  } | null;
}

interface ServiceMessage {
  id: string;
  request_id: string;
  sender_type: 'client' | 'agency' | 'admin';
  sender_id: string;
  message: string;
  created_at: string;
}

interface Agency {
  id: string;
  agency_name: string;
  email: string;
  commission_percentage: number;
  onboarding_complete: boolean;
}

export default function AgencyPortal() {
  const [agency, setAgency] = useState<Agency | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [responseStatus, setResponseStatus] = useState<'accepted' | 'changes_requested' | 'rejected'>('accepted');
  const [unreadAdminRequests, setUnreadAdminRequests] = useState<Set<string>>(new Set());
  const [unreadCompletedCount, setUnreadCompletedCount] = useState(0);

  useEffect(() => {
    // Check for stored agency session
    const storedAgency = localStorage.getItem('agency_session');
    if (storedAgency) {
      try {
        const parsed = JSON.parse(storedAgency);
        setAgency(parsed);
      } catch (e) {
        localStorage.removeItem('agency_session');
      }
    }
  }, []);

  // Polling for admin notifications via edge function
  useEffect(() => {
    if (!agency) return;
    
    console.log('[AgencyPortal] Started polling for admin notifications, agency:', agency.id);
    
    const checkForAdminNotifications = async () => {
      console.log('[AgencyPortal] Checking for admin notifications...');
      try {
        const response = await supabase.functions.invoke('agency-requests', {
          body: { action: 'check_admin_notifications' },
          headers: { 'x-agency-id': agency.id }
        });

        console.log('[AgencyPortal] Notification check response:', response);

        if (response.error) {
          console.error('[AgencyPortal] Error checking notifications:', response.error);
          return;
        }

        const notifications = response.data?.notifications || [];
        const unreadRequests = response.data?.unreadRequests || [];
        
        console.log('[AgencyPortal] Notifications count:', notifications.length, 'Unread requests:', unreadRequests);
        
        // Update unread requests set
        if (unreadRequests.length > 0) {
          setUnreadAdminRequests(prev => {
            const newSet = new Set(prev);
            unreadRequests.forEach((id: string) => newSet.add(id));
            return newSet;
          });
        }
        
        // Show toasts for new notifications (only once per notification type per request)
        if (notifications.length > 0) {
          console.log('[AgencyPortal] Found notifications:', notifications);
          
          // Group notifications by request to show one toast per request
          const requestNotifications = new Map<string, { hasJoin: boolean; hasLeave: boolean }>();
          for (const notif of notifications) {
            const existing = requestNotifications.get(notif.requestId) || { hasJoin: false, hasLeave: false };
            if (notif.type === 'admin_joined') existing.hasJoin = true;
            if (notif.type === 'admin_left') existing.hasLeave = true;
            requestNotifications.set(notif.requestId, existing);
          }
          
          // Show one toast per type (not per request to avoid spam)
          const hasAnyJoin = Array.from(requestNotifications.values()).some(n => n.hasJoin);
          const hasAnyLeave = Array.from(requestNotifications.values()).some(n => n.hasLeave);
          
          if (hasAnyJoin) {
            toast({
              title: "Staff Joined Chat",
              description: "Arcana Mace Staff has entered the chat.",
            });
          }
          if (hasAnyLeave) {
            toast({
              title: "Staff Left Chat",
              description: "Arcana Mace Staff has left the chat.",
            });
          }
          
          // Refresh requests after notifications
          fetchRequests();
        }
      } catch (error) {
        console.error('[AgencyPortal] Error in notification polling:', error);
      }
    };
    
    // Run initial check immediately
    checkForAdminNotifications();
    
    // Poll every 2 seconds
    const pollInterval = setInterval(checkForAdminNotifications, 2000);
    
    return () => {
      clearInterval(pollInterval);
    };
  }, [agency?.id]);

  useEffect(() => {
    if (agency) {
      fetchRequests();
    }
  }, [agency?.id]);

  const handleLogin = async () => {
    if (!email || !password) {
      toast({
        variant: 'destructive',
        title: 'Missing credentials',
        description: 'Please enter email and password.',
      });
      return;
    }

    setIsLoggingIn(true);
    try {
      const response = await supabase.functions.invoke('agency-auth', {
        body: { action: 'login', email, password }
      });

      if (response.error) throw new Error(response.error.message);
      if (response.data?.error) throw new Error(response.data.error);

      const agencyData = response.data.agency;
      setAgency(agencyData);
      localStorage.setItem('agency_session', JSON.stringify(agencyData));
      
      toast({
        title: 'Welcome back!',
        description: `Logged in as ${agencyData.agency_name}`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Login failed',
        description: error.message,
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    setAgency(null);
    localStorage.removeItem('agency_session');
    setRequests([]);
  };

  const fetchRequests = async () => {
    if (!agency) return;

    setLoading(true);
    try {
      const response = await supabase.functions.invoke('agency-requests', {
        body: { action: 'list' },
        headers: { 'x-agency-id': agency.id }
      });

      if (response.error) throw new Error(response.error.message);
      if (response.data?.error) throw new Error(response.data.error);

      const fetchedRequests = response.data.requests || [];
      setRequests(fetchedRequests);
      
      // Count unread completed orders (status=paid and agency_read=false)
      const unreadCompleted = fetchedRequests.filter(
        (r: ServiceRequest) => r.status === 'paid' && r.orders?.agency_read === false
      ).length;
      setUnreadCompletedCount(unreadCompleted);
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

  const sendResponse = async () => {
    if (!agency || !selectedRequest || !newMessage.trim()) return;

    setSending(true);
    try {
      const response = await supabase.functions.invoke('agency-requests', {
        body: { 
          action: 'respond',
          request_id: selectedRequest.id,
          message: newMessage.trim(),
          status: responseStatus
        },
        headers: { 'x-agency-id': agency.id }
      });

      if (response.error) throw new Error(response.error.message);
      if (response.data?.error) throw new Error(response.data.error);

      toast({
        title: 'Response sent',
        description: `Request marked as ${responseStatus.replace('_', ' ')}`,
      });

      setNewMessage('');
      setSelectedRequest(null);
      fetchRequests();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to send response',
        description: error.message,
      });
    } finally {
      setSending(false);
    }
  };

  const getStatusBadge = (status: string, messages: ServiceMessage[] = []) => {
    // Check if agency has ever replied to this request
    const hasAgencyReply = messages.some(m => m.sender_type === 'agency' || m.sender_type === 'admin');
    
    // Show "New Request" only for pending_review requests that have no agency replies yet
    if (status === 'pending_review' && !hasAgencyReply) {
      return <Badge className="bg-green-500 text-white border-green-500">New Request</Badge>;
    }
    switch (status) {
      case 'pending_review':
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending Review</Badge>;
      case 'changes_requested':
        return <Badge variant="outline" className="border-amber-500 text-amber-600"><AlertCircle className="h-3 w-3 mr-1" />Changes Requested</Badge>;
      case 'accepted':
        return <Badge className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Accepted</Badge>;
      case 'rejected':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      case 'paid':
        return <Badge className="bg-blue-600">Paid</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const handleSelectRequest = async (request: ServiceRequest) => {
    setSelectedRequest(request);
    
    // Mark as read if it has unread admin messages
    if (unreadAdminRequests.has(request.id) && agency) {
      try {
        await supabase.functions.invoke('agency-requests', {
          body: { action: 'mark_read', request_id: request.id },
          headers: { 'x-agency-id': agency.id }
        });
        
        // Remove from unread set
        setUnreadAdminRequests(prev => {
          const newSet = new Set(prev);
          newSet.delete(request.id);
          return newSet;
        });
      } catch (error) {
        console.error('[AgencyPortal] Error marking as read:', error);
      }
    }
    
    // Mark order as read if it's a completed order with unread status
    if (request.status === 'paid' && request.orders?.agency_read === false && agency) {
      try {
        await supabase.functions.invoke('agency-requests', {
          body: { action: 'mark_order_read', request_id: request.id },
          headers: { 'x-agency-id': agency.id }
        });
        
        // Update local state
        setRequests(prev => prev.map(r => 
          r.id === request.id && r.orders
            ? { ...r, orders: { ...r.orders, agency_read: true } }
            : r
        ));
        setUnreadCompletedCount(prev => Math.max(0, prev - 1));
      } catch (error) {
        console.error('[AgencyPortal] Error marking order as read:', error);
      }
    }
  };

  // Login Screen
  if (!agency) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <img src={amlogo} alt="Logo" className="h-16 w-16 mx-auto mb-4" />
            <CardTitle>Agency Portal</CardTitle>
            <p className="text-sm text-muted-foreground">Sign in to manage your requests</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoggingIn}
              />
            </div>
            <div className="space-y-2">
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoggingIn}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>
            <Button className="w-full" onClick={handleLogin} disabled={isLoggingIn}>
              {isLoggingIn && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Dashboard
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={amlogo} alt="Logo" className="h-10 w-10" />
            <div>
              <h1 className="font-bold">{agency.agency_name}</h1>
              <p className="text-xs text-muted-foreground">{agency.email}</p>
            </div>
          </div>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="pending" className="space-y-6">
          <TabsList>
            <TabsTrigger value="pending">
              Pending ({requests.filter(r => r.status === 'pending_review').length})
            </TabsTrigger>
            <TabsTrigger value="in_progress">
              In Progress ({requests.filter(r => ['changes_requested', 'accepted'].includes(r.status)).length})
            </TabsTrigger>
            <TabsTrigger value="completed" className="relative">
              Completed ({requests.filter(r => ['paid', 'rejected'].includes(r.status)).length})
              {unreadCompletedCount > 0 && (
                <span className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center bg-green-500 text-white text-xs rounded-full">
                  {unreadCompletedCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <TabsContent value="pending" className="space-y-4">
                {requests.filter(r => r.status === 'pending_review').map((request) => (
                  <RequestCard 
                    key={request.id} 
                    request={request} 
                    hasUnreadAdmin={unreadAdminRequests.has(request.id)}
                    onSelect={() => handleSelectRequest(request)} 
                    getStatusBadge={getStatusBadge} 
                  />
                ))}
                {requests.filter(r => r.status === 'pending_review').length === 0 && (
                  <EmptyState message="No pending requests" />
                )}
              </TabsContent>

              <TabsContent value="in_progress" className="space-y-4">
                {requests.filter(r => ['changes_requested', 'accepted'].includes(r.status)).map((request) => (
                  <RequestCard 
                    key={request.id} 
                    request={request} 
                    hasUnreadAdmin={unreadAdminRequests.has(request.id)}
                    onSelect={() => handleSelectRequest(request)} 
                    getStatusBadge={getStatusBadge} 
                  />
                ))}
                {requests.filter(r => ['changes_requested', 'accepted'].includes(r.status)).length === 0 && (
                  <EmptyState message="No requests in progress" />
                )}
              </TabsContent>

              <TabsContent value="completed" className="space-y-4">
                {requests.filter(r => ['paid', 'rejected'].includes(r.status)).map((request) => (
                  <RequestCard 
                    key={request.id} 
                    request={request} 
                    hasUnreadAdmin={unreadAdminRequests.has(request.id)}
                    onSelect={() => handleSelectRequest(request)} 
                    getStatusBadge={getStatusBadge} 
                  />
                ))}
                {requests.filter(r => ['paid', 'rejected'].includes(r.status)).length === 0 && (
                  <EmptyState message="No completed requests" />
                )}
              </TabsContent>
            </>
          )}
        </Tabs>
      </main>

      {/* Request Detail Dialog */}
      <Dialog open={!!selectedRequest} onOpenChange={() => setSelectedRequest(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{selectedRequest?.title}</DialogTitle>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {selectedRequest.media_sites?.favicon && (
                    <img src={selectedRequest.media_sites.favicon} alt="" className="w-6 h-6 rounded" />
                  )}
                  <span className="text-sm">{selectedRequest.media_sites?.name}</span>
                </div>
                {getStatusBadge(selectedRequest.status, selectedRequest.messages)}
              </div>

              <div className="text-sm text-muted-foreground">
                Client: {selectedRequest.profiles?.email}
              </div>

              {/* Messages */}
              <ScrollArea className="h-[250px] border rounded-lg p-4">
                <div className="space-y-4">
                  {(selectedRequest.messages || []).map((msg) => {
                    // Parse admin system messages
                    const isAdminJoined = msg.message.includes('[ADMIN_JOINED]');
                    const isAdminLeft = msg.message.includes('[ADMIN_LEFT]');
                    const isSystemMessage = isAdminJoined || isAdminLeft;
                    
                    // Clean message content
                    let displayMessage = msg.message;
                    if (isAdminJoined) {
                      displayMessage = msg.message.replace(/\[ADMIN_JOINED\]/g, '').replace(/\[\/ADMIN_JOINED\]/g, '');
                    } else if (isAdminLeft) {
                      displayMessage = msg.message.replace(/\[ADMIN_LEFT\]/g, '').replace(/\[\/ADMIN_LEFT\]/g, '');
                    }
                    
                    if (isSystemMessage) {
                      return (
                        <div key={msg.id} className="flex justify-center my-2">
                          <div className={`px-4 py-2 rounded-full text-xs font-medium ${
                            isAdminJoined 
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' 
                              : 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400'
                          }`}>
                            {isAdminJoined ? '👤 ' : '🚪 '}{displayMessage.trim()}
                          </div>
                        </div>
                      );
                    }
                    
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${msg.sender_type === 'agency' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg p-3 ${
                            msg.sender_type === 'agency'
                              ? 'bg-primary text-primary-foreground'
                              : msg.sender_type === 'admin'
                              ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200'
                              : 'bg-muted'
                          }`}
                        >
                          <p className="text-xs font-medium mb-1 opacity-70">
                            {msg.sender_type === 'agency' ? 'You' : msg.sender_type === 'admin' ? 'Staff' : 'Client'}
                          </p>
                          <p className="text-sm whitespace-pre-wrap">{displayMessage}</p>
                          <p className="text-xs opacity-50 mt-1">
                            {format(new Date(msg.created_at), 'MMM d, h:mm a')}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>

              {/* Response Form */}
              {selectedRequest.status !== 'paid' && selectedRequest.status !== 'rejected' && (
                <div className="space-y-3">
                  <Textarea
                    placeholder="Your response to the client..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    rows={3}
                    disabled={sending}
                  />

                  <div className="flex gap-2 flex-wrap">
                    <Button
                      variant={responseStatus === 'accepted' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setResponseStatus('accepted')}
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Accept
                    </Button>
                    <Button
                      variant={responseStatus === 'changes_requested' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setResponseStatus('changes_requested')}
                    >
                      <AlertCircle className="h-4 w-4 mr-1" />
                      Request Changes
                    </Button>
                    <Button
                      variant={responseStatus === 'rejected' ? 'destructive' : 'outline'}
                      size="sm"
                      onClick={() => setResponseStatus('rejected')}
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Reject
                    </Button>
                  </div>

                  <Button 
                    className="w-full" 
                    onClick={sendResponse}
                    disabled={sending || !newMessage.trim()}
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                    Send Response
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RequestCard({ request, hasUnreadAdmin, onSelect, getStatusBadge }: { 
  request: ServiceRequest; 
  hasUnreadAdmin: boolean;
  onSelect: () => void;
  getStatusBadge: (status: string, messages?: ServiceMessage[]) => React.ReactNode;
}) {
  // Check if staff is currently in chat
  const lastAdminMessage = request.messages?.filter(m => m.sender_type === 'admin').pop();
  const isStaffInChat = lastAdminMessage?.message.includes('[ADMIN_JOINED]') && 
    !request.messages?.some(m => m.sender_type === 'admin' && m.message.includes('[ADMIN_LEFT]') && new Date(m.created_at) > new Date(lastAdminMessage.created_at));
  
  // Check if this is an unread completed order
  const isUnreadCompleted = request.status === 'paid' && request.orders?.agency_read === false;
  
  return (
    <Card 
      className={`cursor-pointer hover:bg-muted/50 transition-colors ${
        hasUnreadAdmin ? 'ring-2 ring-amber-500/50 bg-amber-50/50 dark:bg-amber-900/10' : ''
      } ${isStaffInChat ? 'border-l-4 border-l-green-500' : ''} ${
        isUnreadCompleted ? 'ring-2 ring-green-500/50 bg-green-50/50 dark:bg-green-900/10' : ''
      }`} 
      onClick={onSelect}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {request.media_sites?.favicon && (
              <img src={request.media_sites.favicon} alt="" className="w-10 h-10 rounded" />
            )}
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-medium">{request.title}</h3>
                {isUnreadCompleted && (
                  <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 text-xs animate-pulse">
                    New Completion
                  </Badge>
                )}
                {isStaffInChat && (
                  <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 text-xs">
                    Staff Active
                  </Badge>
                )}
                {hasUnreadAdmin && !isStaffInChat && (
                  <Badge variant="outline" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 text-xs animate-pulse">
                    Staff Message
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{request.media_sites?.name}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Client: {request.profiles?.email}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            {getStatusBadge(request.status, request.messages)}
            <span className="text-xs text-muted-foreground">
              {format(new Date(request.updated_at), 'MMM d, yyyy')}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12">
        <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  );
}
