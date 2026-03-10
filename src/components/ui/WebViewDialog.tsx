import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2, AlertCircle, Download, ExternalLink, Monitor, Tablet, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { DraggablePopup } from '@/components/ui/DraggablePopup';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type ViewportMode = 'fullscreen' | 'tablet' | 'mobile';

const VIEWPORT_SIZES: Record<ViewportMode, { width: number; label: string }> = {
  fullscreen: { width: 0, label: 'Fullscreen' },     // 0 = 100% of screen
  tablet: { width: 768, label: 'Tablet (768px)' },
  mobile: { width: 375, label: 'Mobile (375px)' },
};

interface WebViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  title?: string;
  downloadUrl?: string;
  downloadName?: string;
  /** When true, show "New Tab" button instead of "Download" */
  isWebsite?: boolean;
}

export function WebViewDialog({ open, onOpenChange, url, title = 'Website', downloadUrl, downloadName, isWebsite = false }: WebViewDialogProps) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'blocked'>('loading');
  const [viewportMode, setViewportMode] = useState<ViewportMode>('fullscreen');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      timeoutRef.current = setTimeout(() => {
        if (!loadedRef.current) setStatus('blocked');
      }, 15000);
      return () => clearTimers();
    }
  }, [open, normalizedUrl]);

  const handleRefresh = () => {
    setStatus('loading');
    loadedRef.current = false;
    clearTimers();
    timeoutRef.current = setTimeout(() => {
      if (!loadedRef.current) setStatus('blocked');
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
    if (loadedRef.current) return;
    clearTimers();
    loadedRef.current = true;
    setTimeout(() => setStatus('loaded'), 300);
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
      toast.success(`Download started: ${fileName}`);
    } catch (error) {
      window.open(urlToDownload, '_blank');
    }
  };

  const viewportWidth = VIEWPORT_SIZES[viewportMode].width;

  const titleBar = (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-2 px-3">
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
      <div className="flex items-center gap-1.5">
        {isWebsite && (
          <TooltipProvider delayDuration={200}>
            <div className="flex items-center gap-0.5 border rounded-md p-0.5 bg-muted/30">
              {([
                { mode: 'fullscreen' as ViewportMode, icon: Monitor },
                { mode: 'tablet' as ViewportMode, icon: Tablet },
                { mode: 'mobile' as ViewportMode, icon: Smartphone },
              ]).map(({ mode, icon: Icon }) => (
                <Tooltip key={mode}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setViewportMode(mode)}
                      className={`h-6 w-6 p-0 ${viewportMode === mode ? 'bg-foreground text-background' : 'hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black'}`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {VIEWPORT_SIZES[mode].label}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </TooltipProvider>
        )}
        {isWebsite ? (
          <Button
            onClick={() => window.open(normalizedUrl, '_blank')}
            variant="outline"
            size="sm"
            className="flex-1 sm:flex-none hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black h-7 text-xs"
          >
            <ExternalLink className="h-3 w-3 mr-1" />
            New Tab
          </Button>
        ) : (downloadUrl || url) && (
          <Button
            onClick={handleDownload}
            variant="outline"
            size="sm"
            className="flex-1 sm:flex-none hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black h-7 text-xs"
          >
            <Download className="h-3 w-3 mr-1" />
            Download
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <DraggablePopup
      open={open}
      onOpenChange={handleOpenChange}
      width={viewportMode === 'fullscreen' ? window.innerWidth : Math.min(960, VIEWPORT_SIZES[viewportMode].width + 48)}
      maxHeight={viewportMode === 'fullscreen' ? '100vh' : '90vh'}
      zIndex={300}
      title={titleBar}
      bodyClassName="p-0 !p-0"
      className={viewportMode === 'fullscreen' ? '!rounded-none !inset-0 !transform-none !top-0 !left-0 !w-screen !h-screen !max-h-screen' : ''}
    >
      <div className={`w-full relative bg-muted flex justify-center ${viewportMode === 'fullscreen' ? 'h-[calc(100vh-44px)]' : 'h-[60vh] sm:h-[70vh]'}`}>
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
          className={`h-full border-0 transition-all duration-300 ${status === 'loaded' ? 'opacity-100' : 'opacity-0'} ${viewportWidth > 0 ? 'border-x border-border shadow-inner' : ''}`}
          style={{ width: viewportWidth > 0 ? `${viewportWidth}px` : '100%' }}
          title="WebView"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          onLoad={handleIframeLoad}
          onError={() => { setStatus('blocked'); clearTimers(); }}
        />
      </div>
    </DraggablePopup>
  );
}
