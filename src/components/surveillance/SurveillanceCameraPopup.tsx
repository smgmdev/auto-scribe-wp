import { useAppStore } from '@/stores/appStore';
import { DraggablePopup } from '@/components/ui/DraggablePopup';

export function SurveillanceCameraPopup() {
  const activeCameraRegion = useAppStore((s) => s.activeCameraRegion);
  const closeCameraFeed = useAppStore((s) => s.closeCameraFeed);

  if (!activeCameraRegion) return null;

  return (
    <DraggablePopup
      open={!!activeCameraRegion}
      onOpenChange={(open) => { if (!open) closeCameraFeed(); }}
      width={520}
      maxHeight="75vh"
      zIndex={200}
      className="!bg-[#0d1220]/95 !border-white/10 !text-white !rounded-lg !p-0 [&>div:last-child]:!border-white/5 [&>div:last-child]:!py-2 [&>div:last-child]:!px-3"
      headerClassName="!bg-[#0d1220] !border-white/5"
      bodyClassName="!p-0"
      headerContent={
        <div className="flex items-center gap-2 pl-2">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
          </span>
          <span className="text-sm font-bold text-white">{activeCameraRegion.label}</span>
          <span className="text-xs text-gray-500">Live Webcams</span>
        </div>
      }
      footer={
        <div className="flex items-center justify-start w-full text-[10px] text-gray-500 -my-1">
          Close: <kbd className="ml-1 px-1 py-0 bg-white/5 border border-white/10 rounded text-[10px] text-gray-400">ESC</kbd>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-px bg-white/5">
        {activeCameraRegion.feeds.map(feed => (
          <div key={feed.embedId} className="relative bg-black">
            <div className="absolute top-1 left-1.5 z-10 flex items-center gap-1 bg-black/70 px-1.5 py-0.5 rounded-sm">
              <span className="relative flex h-1 w-1">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1 w-1 bg-red-500" />
              </span>
              <span className="text-[8px] font-medium text-gray-300 uppercase tracking-wider">{feed.label}</span>
            </div>
            <div className="w-full relative overflow-hidden" style={{ aspectRatio: '16/9' }}>
              <iframe
                src={`https://www.youtube.com/embed/${feed.embedId}?autoplay=1&mute=1&rel=0&modestbranding=1&controls=0&showinfo=0&iv_load_policy=3&disablekb=1&fs=0&playsinline=1`}
                className="absolute border-0"
                style={{ top: '-60px', left: '-2px', right: '-2px', width: 'calc(100% + 4px)', height: 'calc(100% + 120px)' }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title={feed.label}
              />
            </div>
          </div>
        ))}
      </div>
    </DraggablePopup>
  );
}
