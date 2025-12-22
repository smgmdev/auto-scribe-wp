import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RefreshCw, X, Loader2, AlertCircle, Download } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface WebViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  title?: string;
  downloadUrl?: string;
  downloadName?: string;
}

export function WebViewDialog({ open, onOpenChange, url, title = 'Website', downloadUrl, downloadName }: WebViewDialogProps) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'blocked'>('loading');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const loadedRef = useRef<boolean>(false);

  const normalizedUrl = url.match(/^https?:\/\//) ? url : `https://${url}`;

  const clearTimers = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  };

  useEffect(() => {
    if (open) {
      setStatus('loading');
      loadedRef.current = false;
      
      clearTimers();
      // Fallback timeout - if nothing loads in 15s, show blocked
      timeoutRef.current = setTimeout(() => {
        if (!loadedRef.current) {
          setStatus('blocked');
        }
      }, 15000);

      return () => clearTimers();
    }
  }, [open, normalizedUrl]);

  const handleRefresh = () => {
    setStatus('loading');
    loadedRef.current = false;
    clearTimers();
    timeoutRef.current = setTimeout(() => {
      if (!loadedRef.current) {
        setStatus('blocked');
      }
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
      clearTimers();
      loadedRef.current = false;
    }
  };

  const handleIframeLoad = () => {
    // Only handle load once to prevent blinking from multiple load events
    if (loadedRef.current) return;
    
    clearTimers();
    loadedRef.current = true;
    
    // Small delay to let content render, then mark as loaded
    setTimeout(() => {
      setStatus('loaded');
    }, 300);
  };

  const handleDownload = async () => {
    const urlToDownload = downloadUrl || url;
    const fileName = downloadName || title || 'download';
    
    try {
      const response = await fetch(urlToDownload);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
      toast({ title: 'Download started', description: fileName });
    } catch (error) {
      // Fallback: open in new tab
      window.open(urlToDownload, '_blank');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[90vw] w-[90vw] max-h-[90vh] p-0 pt-2 gap-2 [&>button]:hidden overflow-hidden z-[300]" overlayClassName="bg-black/50 z-[299]">
        <DialogHeader className="px-3 pb-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Button
                onClick={handleRefresh}
                variant="ghost"
                size="sm"
                disabled={status === 'loading'}
                className="h-7 w-7 p-0 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black disabled:opacity-100 flex-shrink-0"
              >
                <RefreshCw className={`h-4 w-4 ${status === 'loading' ? 'animate-spin' : ''}`} />
              </Button>
              <span className="text-sm font-medium truncate">{title}</span>
            </div>
            <div className="flex items-center gap-2">
              {(downloadUrl || url) && (
                <Button
                  onClick={handleDownload}
                  variant="outline"
                  size="sm"
                  className="hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black h-7 text-xs"
                >
                  <Download className="h-3 w-3 mr-1" />
                  Download
                </Button>
              )}
              <Button
                onClick={() => onOpenChange(false)}
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
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
                  <p className="text-foreground font-medium mb-1">Preview not available</p>
                  <p className="text-sm text-muted-foreground max-w-md">
                    This file cannot be previewed. You can download it instead.
                  </p>
                </div>
                <Button
                  onClick={handleDownload}
                  variant="outline"
                  className="hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download File
                </Button>
              </div>
            </div>
          )}
          <iframe
            ref={iframeRef}
            key={normalizedUrl}
            src={normalizedUrl}
            className={`w-full h-full border-0 transition-opacity duration-300 ${status === 'loaded' ? 'opacity-100' : 'opacity-0'}`}
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