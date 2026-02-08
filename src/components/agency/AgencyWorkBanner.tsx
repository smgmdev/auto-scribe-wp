import agencyWorkBanner from '@/assets/agency-work-banner.jpg';

export function AgencyWorkBanner() {
  return (
    <div className="w-screen -ml-[calc((100vw-100%)/2)] relative">
      <section className="relative h-[300px] md:h-[400px] overflow-hidden">
        <img 
          src={agencyWorkBanner} 
          alt="Agency on Arcana Mace" 
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white drop-shadow-lg">
            Agency on Arcana Mace.
          </h2>
        </div>
      </section>
      {/* White overlay with rounded top corners */}
      <div className="absolute bottom-0 left-0 right-0 h-10 bg-white rounded-t-[40px]" />
    </div>
  );
}
