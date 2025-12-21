import { useState, useEffect } from 'react';
import { ClipboardList, Loader2, MessageSquare, ExternalLink, Bell } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { useAppStore } from '@/stores/appStore';

interface ServiceRequest {
  id: string;
  title: string;
  description: string;
  status: string;
  read: boolean;
  created_at: string;
  updated_at: string;
  media_site: {
    name: string;
    favicon: string | null;
  } | null;
  order: {
    id: string;
    status: string;
    delivery_status: string;
  } | null;
}

export function AgencyRequestsView() {
  const { user } = useAuth();
  const { setAgencyUnreadServiceRequestsCount } = useAppStore();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [agencyPayoutId, setAgencyPayoutId] = useState<string | null>(null);

  const fetchRequests = async () => {
    if (!user) return;

    // First get the agency payout id for this user
    const { data: agencyData } = await supabase
      .from('agency_payouts')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!agencyData) {
      setLoading(false);
      return;
    }

    setAgencyPayoutId(agencyData.id);

    // Fetch service requests for this agency
    const { data, error } = await supabase
      .from('service_requests')
      .select(`
        id,
        title,
        description,
        status,
        read,
        created_at,
        updated_at,
        media_site:media_sites(name, favicon),
        order:orders(id, status, delivery_status)
      `)
      .eq('agency_payout_id', agencyData.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setRequests(data as unknown as ServiceRequest[]);
      // Update unread count in store
      const unreadCount = data.filter(r => !r.read).length;
      setAgencyUnreadServiceRequestsCount(unreadCount);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRequests();
  }, [user]);

  // Real-time subscription for new requests
  useEffect(() => {
    if (!agencyPayoutId) return;

    const channel = supabase
      .channel('agency-requests')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'service_requests',
          filter: `agency_payout_id=eq.${agencyPayoutId}`
        },
        (payload) => {
          console.log('New service request received:', payload);
          toast({
            title: 'New Service Request!',
            description: 'A client has submitted a new brief.',
          });
          fetchRequests(); // Refetch to get full data with joins
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'service_requests',
          filter: `agency_payout_id=eq.${agencyPayoutId}`
        },
        () => {
          fetchRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [agencyPayoutId]);

  const getStatusBadge = (status: string, isRead: boolean) => {
    // Show "New Request" in green for unread pending_review
    if (status === 'pending_review' && !isRead) {
      return <Badge className="bg-green-500 text-white border-green-500">New Request</Badge>;
    }
    switch (status) {
      case 'pending_review':
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Pending Review</Badge>;
      case 'accepted':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Accepted</Badge>;
      case 'rejected':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Rejected</Badge>;
      case 'completed':
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Completed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const markAsRead = async (requestId: string) => {
    await supabase
      .from('service_requests')
      .update({ read: true })
      .eq('id', requestId);
    
    // Update local state
    setRequests(prev => prev.map(r => 
      r.id === requestId ? { ...r, read: true } : r
    ));
    
    // Update store count
    const newUnreadCount = requests.filter(r => !r.read && r.id !== requestId).length;
    setAgencyUnreadServiceRequestsCount(newUnreadCount);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
          <ClipboardList className="h-8 w-8" />
          Service Requests
        </h1>
        <p className="mt-2 text-muted-foreground">
          Manage service requests from clients for your media sites
        </p>
      </div>

      {/* Requests List */}
      {requests.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <MessageSquare className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground text-center">
              No service requests yet. When clients submit briefs for your media sites, they'll appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => (
            <Card 
              key={request.id} 
              className={`border-border/50 hover:border-border transition-colors relative ${!request.read ? 'ring-1 ring-green-500/50' : ''}`}
              onClick={() => !request.read && markAsRead(request.id)}
            >
              {!request.read && (
                <div className="absolute top-3 right-3">
                  <Bell className="h-4 w-4 text-green-500 animate-pulse" />
                </div>
              )}
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {request.media_site?.favicon && (
                      <img 
                        src={request.media_site.favicon} 
                        alt="" 
                        className="h-8 w-8 rounded object-cover"
                      />
                    )}
                    <div>
                      <CardTitle className="text-lg">{request.title}</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {request.media_site?.name || 'Unknown Site'}
                      </p>
                    </div>
                  </div>
                  {getStatusBadge(request.status, request.read)}
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                  {request.description}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(request.created_at), 'MMM d, yyyy h:mm a')}
                  </span>
                  <Button variant="outline" size="sm">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View Details
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}