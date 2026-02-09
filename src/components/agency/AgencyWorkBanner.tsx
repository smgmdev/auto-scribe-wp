import agencyWorkBanner from '@/assets/agency-work-banner.jpg';
import { Button } from '@/components/ui/button';

interface AgencyWorkBannerProps {
  onApplyClick?: () => void;
  isPending?: boolean;
  onMyApplicationsClick?: () => void;
}

export function AgencyWorkBanner({ onApplyClick, isPending, onMyApplicationsClick }: AgencyWorkBannerProps) {
  return (
    <section className="relative h-[300px] md:h-[400px] overflow-hidden rounded-b-[40px] mb-0">
        <img 
          src={agencyWorkBanner} 
          alt="Go PRO with Arcana Mace" 
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center px-4 md:px-0 gap-6">
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white drop-shadow-lg text-center">
            Go PRO with Arcana Mace.
          </h2>
          {isPending ? (
            <Button 
              onClick={onMyApplicationsClick}
              className="bg-[#0066CC] hover:bg-[#0055AA] text-white px-8 py-3 text-base font-medium"
            >
              My Applications
            </Button>
          ) : (
            <Button 
              onClick={onApplyClick}
              className="bg-[#0066CC] hover:bg-[#0055AA] text-white px-8 py-3 text-base font-medium"
            >
              Start Today
            </Button>
          )}
        </div>
    </section>
  );
}
