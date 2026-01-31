import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, User, Loader2 } from 'lucide-react';
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
  // No state needed - using native CSS sticky positioning

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

  // Group by month/year
  const groupedReleases = useMemo(() => {
    return filteredReleases.reduce((acc, release) => {
      const date = new Date(release.published_at || release.created_at);
      const key = format(date, 'MMMM yyyy');
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(release);
      return acc;
    }, {} as Record<string, PressRelease[]>);
  }, [filteredReleases]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header - same as homepage */}
      <header className="fixed top-0 left-0 right-0 z-50 w-full border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
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
      <div className="border-b border-border bg-background">
        <div className="container mx-auto px-4 h-12 flex items-center">
          <h1 className="text-xl font-semibold text-foreground">Newsroom</h1>
        </div>
      </div>

      {/* Filter Bar - native CSS sticky positioning for smooth behavior */}
      <div 
        className="sticky top-16 z-40 border-b border-border bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/80"
      >
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-sm text-muted-foreground font-medium">Filter</span>
              
            <Select value={selectedTopic} onValueChange={setSelectedTopic}>
              <SelectTrigger className="w-[160px] bg-background">
                <SelectValue placeholder="All Topics" />
              </SelectTrigger>
              <SelectContent>
                {availableCategories.map(topic => (
                  <SelectItem key={topic} value={topic}>{topic}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-[130px] bg-background">
                <SelectValue placeholder="All Years" />
              </SelectTrigger>
              <SelectContent>
                {availableYears.map(year => (
                  <SelectItem key={year} value={year}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-[140px] bg-background">
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
        <div className="container mx-auto px-4 py-8">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : Object.keys(groupedReleases).length === 0 ? (
            <div className="text-center py-16">
              <p className="text-muted-foreground">No press releases found matching your filters.</p>
            </div>
          ) : (
            Object.entries(groupedReleases).map(([monthYear, releases]) => (
              <div key={monthYear} className="mb-12">
                <h2 className="text-2xl md:text-3xl font-semibold text-foreground mb-8">{monthYear}</h2>
                
                <div className="space-y-0">
                  {releases.map((release) => (
                    <article 
                      key={release.id}
                      onClick={() => navigate(`/press/${release.id}`)}
                      className="group border-t border-border py-8 cursor-pointer hover:bg-muted/20 transition-colors -mx-4 px-4"
                    >
                      <div className="flex gap-6 items-start">
                        {/* Image or Logo placeholder */}
                        <div className="hidden sm:block w-[200px] h-[133px] flex-shrink-0 rounded-lg overflow-hidden bg-muted">
                          {release.image_url ? (
                            <img 
                              src={release.image_url} 
                              alt={release.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-muted">
                              <img src={amlogo} alt="Arcana Mace" className="h-12 w-auto opacity-50" />
                            </div>
                          )}
                        </div>
                        
                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            {release.category}
                          </span>
                          <h3 className="text-lg md:text-xl font-semibold text-foreground mt-1 group-hover:text-[#06c] transition-colors">
                            {release.title}
                          </h3>
                          <p className="text-sm text-muted-foreground mt-2">
                            {format(new Date(release.published_at || release.created_at), 'MMMM d, yyyy')}
                          </p>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      <Footer />
      <SearchModal open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
