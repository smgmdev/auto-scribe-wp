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
  const [status, setStatus] = useState<'loading' | 'loaded' | 'blocked'>('loading');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const normalizedUrl = url.match(/^https?:\/\//) ? url : `https://${url}`;

  const clearTimers = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  };

  useEffect(() => {
    if (open) {
      setStatus('loading');
      
      // Fallback timeout - if nothing loads in 15s, show blocked
      timeoutRef.current = setTimeout(() => {
        setStatus('blocked');
      }, 15000);

      return () => clearTimers();
    }
  }, [open, normalizedUrl]);

  const handleRefresh = () => {
    setStatus('loading');
    clearTimers();
    timeoutRef.current = setTimeout(() => {
      setStatus('blocked');
    }, 15000);
    if (iframeRef.current) {
      iframeRef.current.src = '';
      setTimeout(() => {
        if (iframeRef.current) iframeRef.current.src = normalizedUrl;
      }, 100);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen);
    if (!newOpen) {
      setStatus('loading');
      clearTimers();
    }
  };

  const handleIframeLoad = () => {
    clearTimers();
    
    // Check if content is accessible - if YES, it's likely a browser error page (blocked)
    // If we get cross-origin error, the external site actually loaded
    setTimeout(() => {
      try {
        const iframe = iframeRef.current;
        if (!iframe) {
          setStatus('loaded');
          return;
        }

        // Try to access content - this throws for successfully loaded cross-origin sites
        const iframeDoc = iframe.contentDocument;
        const iframeWindow = iframe.contentWindow;
        
        if (iframeDoc && iframeWindow) {
          // If we CAN access the document, it's same-origin = browser error page
          // Real external sites would throw cross-origin error
          setStatus('blocked');
          return;
        }
        
        setStatus('loaded');
      } catch (e) {
        // Cross-origin error = external site loaded successfully (can't access but that's expected)
        setStatus('loaded');
      }
    }, 500);
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
                disabled={status === 'loading'}
                className="h-7 w-7 p-0 hover:bg-black hover:text-white disabled:opacity-100"
              >
                <RefreshCw className={`h-4 w-4 ${status === 'loading' ? 'animate-spin' : ''}`} />
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
        <div className="w-full h-[80vh] relative bg-muted">
          {status === 'loading' && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted z-50">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Loading...</p>
              </div>
            </div>
          )}
          {status === 'blocked' && (
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
            className={`w-full h-full border-0 ${status !== 'loaded' ? 'invisible' : ''}`}
            title="WebView"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            onLoad={handleIframeLoad}
            onError={() => { setStatus('blocked'); clearTimers(); }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
