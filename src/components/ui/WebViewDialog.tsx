import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RefreshCw, ExternalLink, X, Loader2, AlertCircle } from 'lucide-react';

interface WebViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  title?: string;
}

export function WebViewDialog({ open, onOpenChange, url, title = 'Website' }: WebViewDialogProps) {
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const normalizedUrl = url.match(/^https?:\/\//) ? url : `https://${url}`;

  useEffect(() => {
    if (open) {
      setLoading(true);
      setBlocked(false);
      
      // Timeout to detect if iframe is blocked
      timeoutRef.current = setTimeout(() => {
        setBlocked(true);
        setLoading(false);
      }, 10000);

      return () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      };
    }
  }, [open, normalizedUrl]);

  const handleRefresh = () => {
    setLoading(true);
    setBlocked(false);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setBlocked(true);
      setLoading(false);
    }, 10000);
    if (iframeRef.current) iframeRef.current.src = normalizedUrl;
  };

  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen);
    if (!newOpen) {
      setLoading(true);
      setBlocked(false);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    }
  };

  const handleIframeLoad = () => {
    // Clear the timeout since something loaded
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    
    // Try to detect if the iframe is actually accessible
    try {
      const iframe = iframeRef.current;
      if (iframe) {
        // This will throw an error for cross-origin frames that loaded successfully
        // But blocked frames might not throw - they just have no content
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        
        // If we can access the document and it's empty/blocked, show blocked message
        if (iframeDoc && (iframeDoc.body?.innerHTML === '' || iframeDoc.documentElement?.innerHTML === '<head></head><body></body>')) {
          setBlocked(true);
          setLoading(false);
          return;
        }
      }
    } catch (e) {
      // Cross-origin error means the site loaded successfully (just can't access content)
      // This is actually good - means the site is displaying
    }
    
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[90vw] w-[90vw] max-h-[90vh] p-0 pt-2 gap-2 [&>button]:hidden overflow-hidden z-[300]" overlayClassName="bg-black/50 z-[299]">
        <DialogHeader className="px-3 pb-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                onClick={handleRefresh}
                variant="ghost"
                size="sm"
                disabled={loading}
                className="h-7 w-7 p-0 hover:bg-black hover:text-white disabled:opacity-100"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              <DialogTitle className="text-sm truncate max-w-[60vw]">{title}</DialogTitle>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => window.open(normalizedUrl, '_blank')}
                variant="outline"
                size="sm"
                className="hover:bg-black hover:text-white h-7 text-xs"
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                Open in New Tab
              </Button>
              <Button
                onClick={() => onOpenChange(false)}
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 hover:bg-black hover:text-white"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>
        <div className="w-full h-[80vh] relative">
          {loading && !blocked && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted z-50">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Loading...</p>
              </div>
            </div>
          )}
          {blocked && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted z-50">
              <div className="flex flex-col items-center gap-4 text-center px-6">
                <AlertCircle className="h-12 w-12 text-muted-foreground" />
                <div>
                  <p className="text-foreground font-medium mb-1">Page not accessible</p>
                  <p className="text-sm text-muted-foreground max-w-md">
                    This page is not accessible through Arcana Mace terminal view.
                  </p>
                </div>
                <Button
                  onClick={() => window.open(normalizedUrl, '_blank')}
                  variant="outline"
                  className="hover:bg-black hover:text-white"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open in New Tab
                </Button>
              </div>
            </div>
          )}
          <iframe
            ref={iframeRef}
            src={normalizedUrl}
            className={`w-full h-full border-0 ${blocked ? 'hidden' : ''}`}
            title="WebView"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            onLoad={handleIframeLoad}
            onError={() => { setBlocked(true); setLoading(false); }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
