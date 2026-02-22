import { Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { usePWAInstall } from '@/hooks/usePWAInstall';

export function PWAInstallButtons() {
  const { canInstall, isInstalled, isIOS, promptInstall } = usePWAInstall();

  if (isInstalled) return null;

  return (
    <div className="w-full">
      <div className="max-w-[980px] mx-auto px-4 md:px-6 pt-6">
        <div className="flex flex-col md:flex-row items-start justify-start gap-0">
        {/* Android / Chrome install */}
        <button
          onClick={() => {
            if (canInstall) {
              promptInstall();
            } else {
              toast.info('Open this site in Chrome on your Android device, then tap "Add to Home Screen" from the browser menu.');
            }
          }}
          className="inline-flex items-center gap-2 bg-black text-[#f2a547] px-5 py-3 rounded-lg text-sm font-semibold hover:text-white transition-colors"
        >
          <Smartphone className="w-5 h-5" />
          {canInstall ? 'Install App on Android' : 'Download & Install on Android'}
        </button>
        {/* iOS install */}
        <button
          onClick={() => {
            if (isIOS) {
              toast.info(
                'Tap the Share button at the bottom of Safari, then tap "Add to Home Screen".',
                { duration: 6000 }
              );
            } else {
              toast.info('Open this site in Safari on your iPhone, tap the Share button, then "Add to Home Screen".');
            }
          }}
          className="inline-flex items-center gap-2 bg-black text-[#f2a547] px-5 py-3 rounded-lg text-sm font-semibold hover:text-white transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11Z"/></svg>
          Download & Install on iOS
        </button>
        </div>
      </div>
    </div>
  );
}
