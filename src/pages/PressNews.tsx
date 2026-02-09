import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, User, Loader2, SlidersHorizontal, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Footer } from '@/components/layout/Footer';
import { SearchModal } from '@/components/search/SearchModal';
import { useAuth } from '@/hooks/useAuth';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import amlogo from '@/assets/amlogo.png';
import amblack from '@/assets/amblack.png';

interface PressRelease {
  id: string;
  title: string;
  content: string;
  category: string;
  image_url: string | null;
  published_at: string | null;
  created_at: string;
}

const months = ['All Months', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ITEMS_PER_PAGE = 20;

export default function PressNews() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState('All Topics');
  const [selectedYear, setSelectedYear] = useState('All Years');
  const [selectedMonth, setSelectedMonth] = useState('All Months');
  const [pressReleases, setPressReleases] = useState<PressRelease[]>([]);
  const [availableCategories, setAvailableCategories] = useState<string[]>(['All Topics']);
  const [availableYears, setAvailableYears] = useState<string[]>(['All Years']);
  const [loading, setLoading] = useState(true);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Check if any filters are active
  const hasActiveFilters = selectedTopic !== 'All Topics' || selectedYear !== 'All Years' || selectedMonth !== 'All Months';
  
  const resetFilters = () => {
    setSelectedTopic('All Topics');
    setSelectedYear('All Years');
    setSelectedMonth('All Months');
    setCurrentPage(1);
  };

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedTopic, selectedYear, selectedMonth]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch published press releases
        const { data: releasesData, error: releasesError } = await supabase
          .from('press_releases')
          .select('id, title, content, category, image_url, published_at, created_at')
          .eq('published', true)
          .order('published_at', { ascending: false });

        if (releasesError) throw releasesError;

        const releases = releasesData || [];
        setPressReleases(releases);

        // Extract unique categories from published releases
        const uniqueCategories = [...new Set(releases.map(r => r.category))].sort();
        setAvailableCategories(['All Topics', ...uniqueCategories]);

        // Extract unique years from published releases
        const uniqueYears = [...new Set(releases.map(r => {
          const date = new Date(r.published_at || r.created_at);
          return date.getFullYear().toString();
        }))].sort((a, b) => parseInt(b) - parseInt(a)); // Sort descending
        setAvailableYears(['All Years', ...uniqueYears]);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Filter press releases
  const filteredReleases = useMemo(() => {
    return pressReleases.filter(release => {
      const releaseDate = new Date(release.published_at || release.created_at);
      const releaseYear = releaseDate.getFullYear().toString();
      const releaseMonth = format(releaseDate, 'MMMM');
      
      const topicMatch = selectedTopic === 'All Topics' || 
        release.category.toLowerCase() === selectedTopic.toLowerCase();
      const yearMatch = selectedYear === 'All Years' || releaseYear === selectedYear;
      const monthMatch = selectedMonth === 'All Months' || releaseMonth === selectedMonth;
      
      return topicMatch && yearMatch && monthMatch;
    });
  }, [pressReleases, selectedTopic, selectedYear, selectedMonth]);

  // Pagination
  const totalItems = filteredReleases.length;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalItems);
  const paginatedReleases = filteredReleases.slice(startIndex, endIndex);

  // Group by month/year (for paginated results)
  const groupedReleases = useMemo(() => {
    return paginatedReleases.reduce((acc, release) => {
      const date = new Date(release.published_at || release.created_at);
      const key = format(date, 'MMMM yyyy');
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(release);
      return acc;
    }, {} as Record<string, PressRelease[]>);
  }, [paginatedReleases]);

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(prev => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="h-screen overflow-y-auto bg-white">
      {/* Header - Apple-style centered */}
      <header className="fixed top-0 left-0 right-0 z-50 w-full bg-white/90 backdrop-blur-sm">
        <div className="max-w-[980px] mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <button 
            onClick={() => navigate('/')}
            className="flex items-center gap-3"
          >
            <img src={amblack} alt="Arcana Mace" className="h-10 w-10" />
            <span className="text-lg font-semibold text-foreground">Arcana Mace</span>
          </button>
          
          {/* Search Trigger - Desktop */}
          <div className="hidden md:flex flex-1 max-w-xl mx-8">
            <button
              onClick={() => setSearchOpen(true)}
              className="w-full flex items-center gap-3 px-4 py-2 rounded-lg bg-muted/50 border border-border text-muted-foreground hover:bg-muted transition-colors text-left"
            >
              <Search className="h-4 w-4" />
              <span>Search media outlets...</span>
            </button>
          </div>
          
          {/* Right side buttons */}
          <div className="flex items-center gap-2">
            {/* Mobile Search Icon */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden hover:bg-black hover:text-white"
              onClick={() => setSearchOpen(true)}
            >
              <Search className="h-5 w-5" />
            </Button>
            
            {user ? (
              <Button 
                onClick={() => navigate('/dashboard')}
                className="bg-black text-white hover:bg-transparent hover:text-black transition-all duration-200 border border-transparent hover:border-black"
              >
                <User className="h-4 w-4" />
                Account
              </Button>
            ) : (
              <Button 
                onClick={() => navigate('/auth')}
                className="bg-foreground text-background hover:bg-transparent hover:text-foreground border border-foreground transition-all duration-300"
              >
                Sign In
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Spacer for fixed header */}
      <div className="h-16" />

      {/* Newsroom Sub-header - in normal flow, will scroll away */}
      <div className="border-b border-border bg-white">
        <div className="max-w-[980px] mx-auto px-4 md:px-6 h-12 flex items-center">
          <h1 className="text-xl font-semibold text-foreground">Newsroom</h1>
        </div>
      </div>

      {/* Filter Bar - native CSS sticky positioning for smooth behavior */}
      <div 
        className="sticky top-16 z-40 border-b border-border/50 bg-[#f5f5f7]"
      >
        <div className="max-w-[980px] mx-auto px-4 md:px-6 py-3">
          {/* Mobile Filter Button */}
          <div className="md:hidden">
            <Sheet open={mobileFilterOpen} onOpenChange={setMobileFilterOpen}>
              <SheetTrigger asChild>
                <button className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <SlidersHorizontal className="h-4 w-4" />
                  <span>Filter</span>
                  {hasActiveFilters && (
                    <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-[10px] text-background">
                      {[selectedTopic !== 'All Topics', selectedYear !== 'All Years', selectedMonth !== 'All Months'].filter(Boolean).length}
                    </span>
                  )}
                </button>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-auto max-h-[80vh] rounded-t-2xl">
                <SheetHeader className="flex flex-row items-center justify-between border-b pb-4">
                  <SheetTitle className="text-lg font-semibold">Filter</SheetTitle>
                  {hasActiveFilters && (
                    <button 
                      onClick={resetFilters}
                      className="text-sm text-[#06c] font-medium"
                    >
                      Reset
                    </button>
                  )}
                </SheetHeader>
                <div className="py-6 space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Topic</label>
                    <Select value={selectedTopic} onValueChange={setSelectedTopic}>
                      <SelectTrigger className="w-full bg-white">
                        <SelectValue placeholder="All Topics" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableCategories.map(topic => (
                          <SelectItem key={topic} value={topic}>{topic}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Year</label>
                    <Select value={selectedYear} onValueChange={setSelectedYear}>
                      <SelectTrigger className="w-full bg-white">
                        <SelectValue placeholder="All Years" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableYears.map(year => (
                          <SelectItem key={year} value={year}>{year}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Month</label>
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                      <SelectTrigger className="w-full bg-white">
                        <SelectValue placeholder="All Months" />
                      </SelectTrigger>
                      <SelectContent>
                        {months.map(month => (
                          <SelectItem key={month} value={month}>{month}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="border-t pt-4 pb-2">
                  <Button 
                    onClick={() => setMobileFilterOpen(false)}
                    className="w-full bg-foreground text-background hover:bg-foreground/90"
                  >
                    Done
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>

          {/* Desktop Filters */}
          <div className="hidden md:flex items-center gap-4">
            <span className="text-sm text-muted-foreground font-medium">Filter</span>
              
            <Select value={selectedTopic} onValueChange={setSelectedTopic}>
              <SelectTrigger className="w-[160px] bg-white">
                <SelectValue placeholder="All Topics" />
              </SelectTrigger>
              <SelectContent>
                {availableCategories.map(topic => (
                  <SelectItem key={topic} value={topic}>{topic}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-[130px] bg-white">
                <SelectValue placeholder="All Years" />
              </SelectTrigger>
              <SelectContent>
                {availableYears.map(year => (
                  <SelectItem key={year} value={year}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-[140px] bg-white">
                <SelectValue placeholder="All Months" />
              </SelectTrigger>
              <SelectContent>
                {months.map(month => (
                  <SelectItem key={month} value={month}>{month}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="min-h-screen">
        <div className="max-w-[980px] mx-auto px-4 md:px-6 py-8">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : Object.keys(groupedReleases).length === 0 ? (
            <div className="text-center py-16">
              <p className="text-muted-foreground">No press releases found matching your filters.</p>
            </div>
          ) : (
            <>
              {Object.entries(groupedReleases).map(([monthYear, releases], groupIndex, groupArray) => (
                <div key={monthYear} className="mb-12">
                  <h2 className="text-2xl md:text-3xl font-semibold text-foreground mb-8">{monthYear}</h2>
                  
                  <div className="space-y-0">
                    {releases.map((release, releaseIndex) => {
                      const isLastInGroup = releaseIndex === releases.length - 1;
                      const isLastGroup = groupIndex === groupArray.length - 1;
                      const isLastItem = isLastInGroup && isLastGroup;
                      
                      return (
                        <article 
                          key={release.id}
                          onClick={() => navigate(`/press/${release.id}`)}
                          className={`group border-t border-border py-5 cursor-pointer hover:bg-muted/20 transition-colors -mx-4 md:-mx-6 px-4 md:px-6 ${isLastItem ? 'border-b' : ''}`}
                        >
                          <div className="flex gap-8 items-center">
                            {/* Image or Logo placeholder */}
                            <div className="hidden sm:block w-[200px] h-[134px] flex-shrink-0 rounded-xl overflow-hidden bg-muted">
                              {release.image_url ? (
                                <img 
                                  src={release.image_url} 
                                  alt={release.title}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-muted">
                                  <img src={amlogo} alt="Arcana Mace" className="h-12 w-auto opacity-50" />
                                </div>
                              )}
                            </div>
                            
                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <span className="text-[13px] font-bold text-muted-foreground uppercase">
                                {release.category}
                              </span>
                              <h3 className="text-xl md:text-2xl font-bold text-foreground mt-0.5 leading-tight">
                                {release.title}
                              </h3>
                              <p className="text-sm font-bold text-muted-foreground mt-1">
                                {format(new Date(release.published_at || release.created_at), 'MMMM d, yyyy')}
                              </p>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Apple-style Pagination */}
              {totalItems > 0 && (
                <div className="flex items-center justify-center py-12 mt-4">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={handlePrevPage}
                      disabled={currentPage === 1}
                      className={`p-1.5 transition-colors ${
                        currentPage === 1 
                          ? 'text-muted-foreground/30 cursor-not-allowed' 
                          : 'text-[#06c] hover:text-[#06c]/70'
                      }`}
                      aria-label="Previous page"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    
                    <span className="text-sm text-muted-foreground px-2">
                      {startIndex + 1}-{endIndex} of {totalItems} results
                    </span>
                    
                    <button
                      onClick={handleNextPage}
                      disabled={currentPage >= totalPages}
                      className={`p-1.5 transition-colors ${
                        currentPage >= totalPages 
                          ? 'text-muted-foreground/30 cursor-not-allowed' 
                          : 'text-[#06c] hover:text-[#06c]/70'
                      }`}
                      aria-label="Next page"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <Footer narrow />
      <SearchModal open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
