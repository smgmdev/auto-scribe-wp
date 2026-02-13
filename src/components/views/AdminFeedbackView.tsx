import { useState, useEffect, useCallback } from 'react';
import { MessageSquareText, Search, Loader2, CheckCircle, Clock, AlertCircle, Paperclip, ExternalLink, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useAppStore } from '@/stores/appStore';
import { WebViewDialog } from '@/components/ui/WebViewDialog';

interface BugReport {
  id: string;
  user_id: string | null;
  reporter_email: string;
  subject: string;
  category: string;
  description: string;
  steps_to_reproduce: string | null;
  attachment_url: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Clock; color: string }> = {
  open: { label: 'Open', icon: AlertCircle, color: 'bg-orange-600' },
  in_progress: { label: 'In Progress', icon: Clock, color: 'bg-blue-600' },
  resolved: { label: 'Resolved', icon: CheckCircle, color: 'bg-green-600' },
  closed: { label: 'Closed', icon: CheckCircle, color: 'bg-muted-foreground' },
};

const CATEGORY_LABELS: Record<string, string> = {
  bug: 'Bug',
  ui: 'UI Issue',
  performance: 'Performance',
  feature: 'Feature Request',
  other: 'Other',
};

export function AdminFeedbackView() {
  const [reports, setReports] = useState<BugReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'open' | 'all' | 'resolved'>('open');
  const [updatingStatus, setUpdatingStatus] = useState<Set<string>>(new Set());
  const { setUnreadBugReportsCount } = useAppStore();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState('');

  // Reset unread count when viewing this page
  useEffect(() => {
    setUnreadBugReportsCount(0);
  }, [setUnreadBugReportsCount]);

  const [isManualRefresh, setIsManualRefresh] = useState(false);

  const fetchReports = useCallback(async (manual = false) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('bug_reports')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReports(data || []);
      if (manual) {
        toast.success('Reports refreshed');
      }
    } catch (err) {
      console.error('Error fetching bug reports:', err);
      toast.error('Failed to load bug reports');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const updateStatus = async (reportId: string, newStatus: string) => {
    setUpdatingStatus(prev => new Set(prev).add(reportId));
    try {
      const { error } = await supabase
        .from('bug_reports')
        .update({ status: newStatus })
        .eq('id', reportId);

      if (error) throw error;
      setReports(prev => prev.map(r => r.id === reportId ? { ...r, status: newStatus } : r));
      toast.success(`Report marked as ${newStatus}`);
    } catch (err) {
      console.error('Error updating status:', err);
      toast.error('Failed to update status');
    } finally {
      setUpdatingStatus(prev => { const next = new Set(prev); next.delete(reportId); return next; });
    }
  };

  const filteredReports = reports.filter(r => {
    if (activeTab === 'open' && (r.status === 'resolved' || r.status === 'closed')) return false;
    if (activeTab === 'resolved' && r.status !== 'resolved' && r.status !== 'closed') return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        r.subject.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.reporter_email.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const openCount = reports.filter(r => r.status === 'open' || r.status === 'in_progress').length;
  const resolvedCount = reports.filter(r => r.status === 'resolved' || r.status === 'closed').length;

  return (
    <div className="bg-white -m-4 lg:-m-8 min-h-[calc(100vh-56px)] lg:min-h-screen">
      <div className="max-w-[980px] mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <h1 className="text-4xl font-bold text-foreground">Feedback</h1>
            {openCount > 0 && (
              <span className="min-w-[24px] h-[24px] px-1.5 text-xs font-medium bg-destructive text-destructive-foreground rounded-full flex items-center justify-center">{openCount}</span>
            )}
          </div>
          <Button
            onClick={() => fetchReports(true)}
            disabled={loading}
            size="sm"
            className="w-full md:w-auto border border-foreground shadow-none transition-all duration-300 hover:bg-transparent hover:text-foreground hover:shadow-none"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Refresh
          </Button>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="w-full md:grid md:grid-cols-3 justify-start overflow-x-auto scrollbar-hide flex-nowrap h-auto gap-0 bg-foreground text-background">
            <TabsTrigger value="open" className="whitespace-nowrap flex-shrink-0 data-[state=active]:bg-background data-[state=active]:text-foreground">
              Open ({openCount})
            </TabsTrigger>
            <TabsTrigger value="all" className="whitespace-nowrap flex-shrink-0 data-[state=active]:bg-background data-[state=active]:text-foreground">
              All ({reports.length})
            </TabsTrigger>
            <TabsTrigger value="resolved" className="whitespace-nowrap flex-shrink-0 data-[state=active]:bg-background data-[state=active]:text-foreground">
              Resolved ({resolvedCount})
            </TabsTrigger>
          </TabsList>

          {/* Search */}
          <div className="mt-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white" />
              <Input
                placeholder="Search reports by subject, email, category..."
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
            ) : filteredReports.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <MessageSquareText className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">
                  {activeTab === 'open' 
                    ? 'No open bug reports.' 
                    : 'No bug reports found.'}
                </p>
              </div>
            ) : (
              <div className="space-y-0">
                {filteredReports.map((report) => {
                  const statusConfig = STATUS_CONFIG[report.status] || STATUS_CONFIG.open;
                  const StatusIcon = statusConfig.icon;
                  
                  return (
                    <Card key={report.id} className={cn(
                      "border-b last:border-b-0 border-x-0 border-t-0 shadow-none",
                      (report.status === 'open') && "border-l-2 border-l-orange-500"
                    )}>
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-0.5">
                              <p className="text-xs font-semibold truncate">{report.subject}</p>
                              <Badge className={cn("text-[9px] px-1.5 py-0 h-4 text-white", statusConfig.color)}>
                                {statusConfig.label}
                              </Badge>
                            </div>
                            <p className="text-[10px] text-muted-foreground">
                              {report.reporter_email} · {CATEGORY_LABELS[report.category] || report.category} · {format(new Date(report.created_at), 'MMM d, yyyy HH:mm')}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {report.attachment_url && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-[10px] h-6 px-2 hover:bg-foreground hover:text-background"
                                onClick={() => {
                                  setPreviewTitle(report.subject);
                                  setPreviewUrl(report.attachment_url);
                                }}
                              >
                                <Paperclip className="h-3 w-3 mr-1" />
                                File
                              </Button>
                            )}
                            {report.status === 'open' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-[10px] h-6 px-2 hover:bg-foreground hover:text-background"
                                disabled={updatingStatus.has(report.id)}
                                onClick={() => updateStatus(report.id, 'resolved')}
                              >
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Resolve
                              </Button>
                            )}
                            {report.status === 'resolved' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-[10px] h-6 px-2 hover:bg-foreground hover:text-background"
                                disabled={updatingStatus.has(report.id)}
                                onClick={() => updateStatus(report.id, 'open')}
                              >
                                Reopen
                              </Button>
                            )}
                          </div>
                        </div>

                        <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{report.description}</p>
                        
                        {report.steps_to_reproduce && (
                          <p className="text-[10px] text-muted-foreground/70 mt-1 italic line-clamp-1">
                            Steps: {report.steps_to_reproduce}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <WebViewDialog
          open={!!previewUrl}
          onOpenChange={(open) => { if (!open) setPreviewUrl(null); }}
          url={previewUrl || ''}
          title={previewTitle}
        />
      </div>
    </div>
  );
}
