import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Clock, CheckCircle, XCircle, ExternalLink, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface AgencyApplication {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  whatsapp_phone: string;
  agency_name: string;
  country: string;
  agency_website: string;
  incorporation_document_url: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export function AdminApplicationsView() {
  const [applications, setApplications] = useState<AgencyApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedApp, setSelectedApp] = useState<AgencyApplication | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchApplications();
  }, []);

  const fetchApplications = async () => {
    try {
      const { data, error } = await supabase
        .from('agency_applications')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setApplications(data || []);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDecision = async (status: 'approved' | 'rejected') => {
    if (!selectedApp) return;

    setProcessing(true);
    try {
      // Update application status
      const { error: updateError } = await supabase
        .from('agency_applications')
        .update({
          status,
          admin_notes: adminNotes || null,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', selectedApp.id);

      if (updateError) throw updateError;

      // If approved, create agency_payout entry with user_id and send Stripe Connect invite
      if (status === 'approved') {
        // Create Stripe Connect account and agency_payout via edge function
        // Pre-fill as much data as possible from the application
        const response = await supabase.functions.invoke('create-connect-account', {
          body: {
            agency_name: selectedApp.agency_name,
            email: selectedApp.email,
            commission_percentage: 10,
            country: selectedApp.country,
            user_id: selectedApp.user_id,
            phone: selectedApp.whatsapp_phone,
            website: selectedApp.agency_website,
            representative_name: selectedApp.full_name
          }
        });

        if (response.error) {
          throw new Error(response.error.message);
        }

        if (response.data?.error) {
          throw new Error(response.data.error);
        }
      }

      toast({
        title: status === 'approved' ? 'Application Approved' : 'Application Rejected',
        description: status === 'approved' 
          ? 'Stripe Connect invite sent to user.'
          : 'The applicant has been notified.',
        className: status === 'approved' ? 'bg-green-600 text-white border-green-600' : undefined
      });

      setSelectedApp(null);
      setAdminNotes('');
      fetchApplications();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setProcessing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case 'approved':
        return <Badge className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getDocumentUrl = (path: string) => {
    const { data } = supabase.storage.from('agency-documents').getPublicUrl(path);
    return data.publicUrl;
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Agency Applications</h2>
        <p className="text-muted-foreground">Review and manage agency partnership requests</p>
      </div>

      {applications.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No applications yet
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {applications.map((app) => (
            <Card 
              key={app.id} 
              className="cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => {
                setSelectedApp(app);
                setAdminNotes(app.admin_notes || '');
              }}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium">{app.agency_name}</h3>
                    <p className="text-sm text-muted-foreground">{app.full_name} • {app.email}</p>
                    <p className="text-xs text-muted-foreground mt-1">{app.country}</p>
                  </div>
                  <div className="text-right">
                    {getStatusBadge(app.status)}
                    <p className="text-xs text-muted-foreground mt-2">
                      {format(new Date(app.created_at), 'MMM d, yyyy')}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!selectedApp} onOpenChange={() => setSelectedApp(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedApp?.agency_name}</DialogTitle>
          </DialogHeader>

          {selectedApp && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Full Name</p>
                  <p className="font-medium">{selectedApp.full_name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Email</p>
                  <p className="font-medium">{selectedApp.email}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">WhatsApp</p>
                  <p className="font-medium">{selectedApp.whatsapp_phone}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Country</p>
                  <p className="font-medium">{selectedApp.country}</p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" asChild>
                  <a href={selectedApp.agency_website} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-1" />
                    Website
                  </a>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={getDocumentUrl(selectedApp.incorporation_document_url)} target="_blank" rel="noopener noreferrer">
                    <FileText className="h-4 w-4 mr-1" />
                    View Document
                  </a>
                </Button>
              </div>

              {selectedApp.status === 'pending' && (
                <>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Admin Notes (optional)</p>
                    <Textarea
                      placeholder="Add notes visible to applicant..."
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      rows={3}
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      className="flex-1 bg-green-600 hover:bg-green-700"
                      onClick={() => handleDecision('approved')}
                      disabled={processing}
                    >
                      {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                      Approve
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1"
                      onClick={() => handleDecision('rejected')}
                      disabled={processing}
                    >
                      {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4 mr-1" />}
                      Reject
                    </Button>
                  </div>
                </>
              )}

              {selectedApp.status !== 'pending' && selectedApp.admin_notes && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Admin Notes</p>
                  <p className="text-sm">{selectedApp.admin_notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
