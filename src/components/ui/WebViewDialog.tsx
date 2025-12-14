import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RefreshCw, ExternalLink, X, Loader2 } from 'lucide-react';

interface WebViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  title?: string;
}

export function WebViewDialog({ open, onOpenChange, url, title = 'Website' }: WebViewDialogProps) {
  const [loading, setLoading] = useState(true);

  const handleRefresh = () => {
    setLoading(true);
    const iframe = document.querySelector('iframe[title="WebView"]') as HTMLIFrameElement;
    if (iframe) iframe.src = iframe.src;
  };

  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen);
    if (!newOpen) setLoading(true);
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
                onClick={() => window.open(url, '_blank')}
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
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted z-50">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Loading...</p>
              </div>
            </div>
          )}
          <iframe
            src={url}
            className="w-full h-full border-0"
            title="WebView"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            onLoad={() => setLoading(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
