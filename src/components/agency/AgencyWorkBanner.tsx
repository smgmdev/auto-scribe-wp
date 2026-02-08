import agencyWorkBanner from '@/assets/agency-work-banner.jpg';

export function AgencyWorkBanner() {
  return (
    <div className="px-4 lg:px-0 my-8">
      <section className="relative h-[300px] md:h-[400px] overflow-hidden rounded-[40px] md:rounded-b-[40px] md:rounded-t-none">
          <img 
            src={agencyWorkBanner} 
            alt="Go PRO with Arcana Mace" 
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white drop-shadow-lg">
              Go PRO with Arcana Mace.
            </h2>
          </div>
      </section>
    </div>
  );
}
