import { useState, useEffect, useCallback } from 'react';
import { Shield, Search, Loader2, RefreshCw, CheckCircle, AlertTriangle, MessageSquare, ExternalLink, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useAppStore } from '@/stores/appStore';
import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';

interface FlaggedMessage {
  id: string;
  message_id: string;
  request_id: string;
  sender_id: string;
  sender_type: string;
  message_text: string;
  detected_type: string;
  detected_value: string;
  flagged_at: string;
  reviewed: boolean;
  reviewed_at: string | null;
  created_at: string;
}

interface GroupedFlag {
  request_id: string;
  engagement_title: string;
  media_site_name: string;
  media_site_favicon: string | null;
  flags: FlaggedMessage[];
  hasUnreviewed: boolean;
}

const DETECTION_LABELS: Record<string, { label: string; color: string }> = {
  email: { label: 'Email', color: 'bg-red-600' },
  phone: { label: 'Phone', color: 'bg-orange-600' },
  whatsapp: { label: 'WhatsApp', color: 'bg-green-600' },
  telegram: { label: 'Telegram', color: 'bg-blue-500' },
  discord: { label: 'Discord', color: 'bg-indigo-600' },
  skype: { label: 'Skype', color: 'bg-sky-600' },
  instagram: { label: 'Instagram', color: 'bg-pink-600' },
  twitter: { label: 'Twitter/X', color: 'bg-zinc-700' },
  facebook: { label: 'Facebook', color: 'bg-blue-700' },
  linkedin: { label: 'LinkedIn', color: 'bg-blue-800' },
  snapchat: { label: 'Snapchat', color: 'bg-yellow-500' },
  signal: { label: 'Signal', color: 'bg-blue-600' },
  wechat: { label: 'WeChat', color: 'bg-green-700' },
  social_media: { label: 'Social Media', color: 'bg-purple-600' },
  other: { label: 'Other', color: 'bg-gray-600' },
};

function highlightDetectedValue(text: string, detectedValue: string): JSX.Element {
  if (!detectedValue || !text) return <span>{text}</span>;
  
  const lowerText = text.toLowerCase();
  const lowerValue = detectedValue.toLowerCase();
  const idx = lowerText.indexOf(lowerValue);
  
  if (idx === -1) {
    return <span>{text}</span>;
  }
  
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + detectedValue.length);
  const after = text.slice(idx + detectedValue.length);
  
  return (
    <span>
      {before}
      <mark className="bg-yellow-300 text-black px-0.5 font-semibold">{match}</mark>
      {after}
    </span>
  );
}

export function AdminSecuritySupervisionView() {
  const [flags, setFlags] = useState<FlaggedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'unreviewed' | 'all' | 'reviewed'>('unreviewed');
  const [engagementData, setEngagementData] = useState<Record<string, { title: string; media_site_name: string; media_site_favicon: string | null }>>({});
  const [markingReviewed, setMarkingReviewed] = useState<Set<string>>(new Set());
  
  const { setCurrentView, setUnreadFlaggedMessagesCount } = useAppStore();
  const { toast } = useToast();

  const fetchFlags = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('flagged_chat_messages')
        .select('*')
        .order('flagged_at', { ascending: false });

      if (error) throw error;
      setFlags(data || []);

      // Fetch engagement data for all unique request_ids
      const requestIds = [...new Set((data || []).map(f => f.request_id))];
      if (requestIds.length > 0) {
        const { data: requests } = await supabase
          .from('service_requests')
          .select('id, title, media_sites(name, favicon)')
          .in('id', requestIds);

        const engMap: Record<string, { title: string; media_site_name: string; media_site_favicon: string | null }> = {};
        (requests || []).forEach((r: any) => {
          engMap[r.id] = {
            title: r.title,
            media_site_name: r.media_sites?.name || 'Unknown',
            media_site_favicon: r.media_sites?.favicon || null,
          };
        });
        setEngagementData(engMap);
      }
    } catch (err) {
      console.error('Error fetching flags:', err);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load flagged messages' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchFlags();
  }, [fetchFlags]);

  // Real-time subscription for new flags
  useEffect(() => {
    const channel = supabase
      .channel('flagged-messages-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'flagged_chat_messages',
      }, (payload) => {
        const newFlag = payload.new as FlaggedMessage;
        setFlags(prev => {
          // Avoid duplicates
          if (prev.some(f => f.id === newFlag.id)) return prev;
          return [newFlag, ...prev];
        });
        // Fetch engagement data for new request_id if missing
        if (!engagementData[newFlag.request_id]) {
          supabase
            .from('service_requests')
            .select('id, title, media_sites(name, favicon)')
            .eq('id', newFlag.request_id)
            .maybeSingle()
            .then(({ data }) => {
              if (data) {
                setEngagementData(prev => ({
                  ...prev,
                  [(data as any).id]: {
                    title: (data as any).title,
                    media_site_name: (data as any).media_sites?.name || 'Unknown',
                    media_site_favicon: (data as any).media_sites?.favicon || null,
                  },
                }));
              }
            });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [engagementData]);

  // Real-time listener for new service messages — triggers immediate single-message scan
  useEffect(() => {
    const scanSingleMessage = async (message: any) => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scan-single-message`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              message_id: message.id,
              request_id: message.request_id,
              sender_id: message.sender_id,
              sender_type: message.sender_type,
              message: message.message,
            }),
          }
        );
        // Results will appear via the flagged_chat_messages realtime subscription above
      } catch (err) {
        console.error('Real-time scan error:', err);
      }
    };

    const channel = supabase
      .channel('service-messages-realtime-scan')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'service_messages',
      }, (payload) => {
        scanSingleMessage(payload.new);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleScan = async () => {
    setScanning(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scan-chat-messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({}),
        }
      );

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Scan failed');
      }

      const result = await response.json();
      toast({
        title: 'Scan Complete',
        description: `Scanned ${result.scanned} messages. Found ${result.regexFlags} pattern matches and ${result.aiFlags} AI detections. ${result.inserted} new flags added.`,
      });

      // Refresh data
      await fetchFlags();
    } catch (err: any) {
      console.error('Scan error:', err);
      toast({ variant: 'destructive', title: 'Scan Failed', description: err.message });
    } finally {
      setScanning(false);
    }
  };

  const markAsReviewed = async (flagId: string) => {
    setMarkingReviewed(prev => new Set(prev).add(flagId));
    try {
      const { error } = await supabase
        .from('flagged_chat_messages')
        .update({ reviewed: true, reviewed_at: new Date().toISOString() })
        .eq('id', flagId);

      if (error) throw error;
      setFlags(prev => prev.map(f => f.id === flagId ? { ...f, reviewed: true, reviewed_at: new Date().toISOString() } : f));
      setUnreadFlaggedMessagesCount(Math.max(0, useAppStore.getState().unreadFlaggedMessagesCount - 1));
    } catch (err) {
      console.error('Error marking reviewed:', err);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to mark as reviewed' });
    } finally {
      setMarkingReviewed(prev => { const next = new Set(prev); next.delete(flagId); return next; });
    }
  };

  const markGroupReviewed = async (requestId: string) => {
    const groupFlags = flags.filter(f => f.request_id === requestId && !f.reviewed);
    const ids = groupFlags.map(f => f.id);
    if (ids.length === 0) return;

    try {
      const { error } = await supabase
        .from('flagged_chat_messages')
        .update({ reviewed: true, reviewed_at: new Date().toISOString() })
        .in('id', ids);

      if (error) throw error;
      setFlags(prev => prev.map(f => ids.includes(f.id) ? { ...f, reviewed: true, reviewed_at: new Date().toISOString() } : f));
      setUnreadFlaggedMessagesCount(Math.max(0, useAppStore.getState().unreadFlaggedMessagesCount - ids.length));
      toast({ title: 'Marked as reviewed', description: `${ids.length} flags marked as reviewed` });
    } catch (err) {
      console.error('Error:', err);
    }
  };

  const openEngagement = (requestId: string) => {
    localStorage.setItem('selectedEngagementId', requestId);
    setCurrentView('admin-engagements');
  };

  // Filter and group
  const filteredFlags = flags.filter(f => {
    if (activeTab === 'unreviewed' && f.reviewed) return false;
    if (activeTab === 'reviewed' && !f.reviewed) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        f.message_text.toLowerCase().includes(q) ||
        f.detected_value.toLowerCase().includes(q) ||
        f.detected_type.toLowerCase().includes(q) ||
        (engagementData[f.request_id]?.title || '').toLowerCase().includes(q) ||
        (engagementData[f.request_id]?.media_site_name || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Group by request_id
  const grouped: GroupedFlag[] = [];
  const requestMap = new Map<string, FlaggedMessage[]>();
  for (const f of filteredFlags) {
    const existing = requestMap.get(f.request_id);
    if (existing) existing.push(f);
    else requestMap.set(f.request_id, [f]);
  }
  for (const [requestId, groupFlags] of requestMap) {
    const eng = engagementData[requestId];
    grouped.push({
      request_id: requestId,
      engagement_title: eng?.title || 'Unknown Engagement',
      media_site_name: eng?.media_site_name || 'Unknown',
      media_site_favicon: eng?.media_site_favicon || null,
      flags: groupFlags,
      hasUnreviewed: groupFlags.some(f => !f.reviewed),
    });
  }

  const unreviewedCount = flags.filter(f => !f.reviewed).length;

  return (
    <div className="bg-white -m-4 lg:-m-8 min-h-[calc(100vh-56px)] lg:min-h-screen">
      <div className="max-w-[980px] mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <h1 className="text-4xl font-bold text-foreground">Security Supervision</h1>
            {unreviewedCount > 0 && (
              <Badge className="bg-red-600 text-white text-xs">{unreviewedCount}</Badge>
            )}
          </div>
          <Button
            onClick={handleScan}
            disabled={scanning}
            size="sm"
            className="bg-foreground text-background hover:bg-foreground/90 border border-foreground w-full md:w-auto"
          >
            {scanning ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
            {scanning ? 'Scanning...' : 'Scan All Chats'}
          </Button>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="w-full md:grid md:grid-cols-3 justify-start overflow-x-auto scrollbar-hide flex-nowrap h-auto gap-0 bg-foreground text-background">
            <TabsTrigger value="unreviewed" className="whitespace-nowrap flex-shrink-0 data-[state=active]:bg-background data-[state=active]:text-foreground">
              Unreviewed ({flags.filter(f => !f.reviewed).length})
            </TabsTrigger>
            <TabsTrigger value="all" className="whitespace-nowrap flex-shrink-0 data-[state=active]:bg-background data-[state=active]:text-foreground">
              All ({flags.length})
            </TabsTrigger>
            <TabsTrigger value="reviewed" className="whitespace-nowrap flex-shrink-0 data-[state=active]:bg-background data-[state=active]:text-foreground">
              Reviewed ({flags.filter(f => f.reviewed).length})
            </TabsTrigger>
          </TabsList>

          {/* Search */}
          <div className="mt-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white" />
              <Input
                placeholder="Search messages, contacts, engagements..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-foreground text-background border-foreground placeholder:text-white/50 h-9 text-xs"
              />
            </div>
          </div>

          <TabsContent value={activeTab} className="mt-3">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : grouped.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Shield className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">
                  {activeTab === 'unreviewed' 
                    ? 'No unreviewed flags. Click "Scan All Chats" to check for contact sharing.' 
                    : 'No flagged messages found.'}
                </p>
              </div>
            ) : (
              <div className="space-y-0">
                {grouped.map((group) => (
                  <Card key={group.request_id} className={cn(
                    "border-b last:border-b-0 border-x-0 border-t-0 shadow-none",
                    group.hasUnreviewed && "border-l-2 border-l-blue-500"
                  )}>
                    <CardContent className="p-3">
                      {/* Engagement Header */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {group.media_site_favicon && (
                            <img src={group.media_site_favicon} alt="" className="h-4 w-4 flex-shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="text-xs font-semibold truncate">{group.engagement_title}</p>
                            <p className="text-[10px] text-muted-foreground">{group.media_site_name} · {group.flags.length} flag{group.flags.length !== 1 ? 's' : ''}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {group.hasUnreviewed && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-[10px] h-6 px-2"
                              onClick={() => markGroupReviewed(group.request_id)}
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              Mark All Reviewed
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-[10px] h-6 px-2"
                            onClick={() => openEngagement(group.request_id)}
                          >
                            <ExternalLink className="h-3 w-3 mr-1" />
                            Open Chat
                          </Button>
                        </div>
                      </div>

                      {/* Flagged Messages */}
                      <div className="space-y-1.5">
                        {group.flags.map((flag) => {
                          const detection = DETECTION_LABELS[flag.detected_type] || DETECTION_LABELS.other;
                          return (
                            <div
                              key={flag.id}
                              className={`p-2 border text-xs ${flag.reviewed ? 'bg-muted/30 opacity-60' : 'bg-red-50 border-red-200'}`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                    <Badge className={`${detection.color} text-white text-[9px] py-0 px-1.5`}>
                                      {detection.label}
                                    </Badge>
                                    <span className="text-[10px] text-muted-foreground">
                                      {flag.sender_type === 'client' ? 'Client' : 'Agency'} · {format(new Date(flag.flagged_at), 'MMM d, HH:mm')}
                                    </span>
                                    {flag.reviewed && (
                                      <CheckCircle className="h-3 w-3 text-green-600" />
                                    )}
                                  </div>
                                  <p className="text-xs leading-relaxed break-words">
                                    {highlightDetectedValue(flag.message_text, flag.detected_value)}
                                  </p>
                                  <p className="text-[10px] text-red-600 mt-1 font-medium">
                                    Detected: <span className="bg-yellow-200 px-1">{flag.detected_value}</span>
                                  </p>
                                </div>
                                {!flag.reviewed && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 px-1.5 text-[10px] flex-shrink-0"
                                    disabled={markingReviewed.has(flag.id)}
                                    onClick={() => markAsReviewed(flag.id)}
                                  >
                                    {markingReviewed.has(flag.id) ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <CheckCircle className="h-3 w-3" />
                                    )}
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
