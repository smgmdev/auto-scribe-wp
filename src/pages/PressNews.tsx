import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, User, ChevronDown } from 'lucide-react';
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
import amlogo from '@/assets/amlogo.png';

// Sample press releases data
const pressReleases = [
  {
    id: 1,
    category: 'PRESS RELEASE',
    title: 'Arcana Mace Launches New AI-Powered Content Generation',
    date: 'January 28, 2026',
    month: 'January',
    year: '2026',
    image: null,
  },
  {
    id: 2,
    category: 'UPDATE',
    title: 'Introducing Enhanced Media Buying Features for Global Publishers',
    date: 'January 15, 2026',
    month: 'January',
    year: '2026',
    image: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=400&h=300&fit=crop',
  },
  {
    id: 3,
    category: 'ANNOUNCEMENT',
    title: 'Arcana Mace Expands to MENA Region with New Agency Partnerships',
    date: 'December 20, 2025',
    month: 'December',
    year: '2025',
    image: 'https://images.unsplash.com/photo-1586339949916-3e9457bef6d3?w=400&h=300&fit=crop',
  },
  {
    id: 4,
    category: 'PRESS RELEASE',
    title: 'Platform Surpasses 1,000 Media Sites Milestone',
    date: 'December 10, 2025',
    month: 'December',
    year: '2025',
    image: null,
  },
  {
    id: 5,
    category: 'UPDATE',
    title: 'New Self-Publishing Tools Now Available for All Users',
    date: 'November 25, 2025',
    month: 'November',
    year: '2025',
    image: 'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=400&h=300&fit=crop',
  },
  {
    id: 6,
    category: 'ANNOUNCEMENT',
    title: 'Arcana Mace Partners with Leading Crypto Publications',
    date: 'November 15, 2025',
    month: 'November',
    year: '2025',
    image: 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=400&h=300&fit=crop',
  },
  {
    id: 7,
    category: 'PRESS RELEASE',
    title: 'Q3 2025 Results: Record Growth in Media Placements',
    date: 'October 30, 2025',
    month: 'October',
    year: '2025',
    image: null,
  },
  {
    id: 8,
    category: 'UPDATE',
    title: 'Enhanced WordPress Integration for Seamless Publishing',
    date: 'October 15, 2025',
    month: 'October',
    year: '2025',
    image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400&h=300&fit=crop',
  },
];

const topics = ['All Topics', 'Press Release', 'Update', 'Announcement', 'Company News', 'Product'];
const years = ['All Years', '2026', '2025', '2024', '2023'];
const months = ['All Months', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function PressNews() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState('All Topics');
  const [selectedYear, setSelectedYear] = useState('All Years');
  const [selectedMonth, setSelectedMonth] = useState('All Months');

  // Filter press releases
  const filteredReleases = pressReleases.filter(release => {
    const topicMatch = selectedTopic === 'All Topics' || 
      release.category.toLowerCase().includes(selectedTopic.toLowerCase().replace(' ', '_'));
    const yearMatch = selectedYear === 'All Years' || release.year === selectedYear;
    const monthMatch = selectedMonth === 'All Months' || release.month === selectedMonth;
    return topicMatch && yearMatch && monthMatch;
  });

  // Group by month/year
  const groupedReleases = filteredReleases.reduce((acc, release) => {
    const key = `${release.month} ${release.year}`;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(release);
    return acc;
  }, {} as Record<string, typeof pressReleases>);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <button 
            onClick={() => navigate('/')}
            className="flex items-center gap-2"
          >
            <img src={amlogo} alt="Arcana Mace" className="h-7 w-auto" />
          </button>
          
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSearchOpen(true)}
              className="text-muted-foreground hover:text-foreground"
            >
              <Search className="h-5 w-5" />
            </Button>
            
            {user ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/dashboard', { state: { targetView: 'account' } })}
                className="text-muted-foreground hover:text-foreground"
              >
                <User className="h-5 w-5" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/auth')}
                className="text-muted-foreground hover:text-foreground"
              >
                Sign In
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Newsroom Sub-header */}
      <div className="border-b border-border bg-background">
        <div className="container mx-auto px-4 h-12 flex items-center">
          <h1 className="text-xl font-semibold text-foreground">Newsroom</h1>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-muted/30 border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-sm text-muted-foreground font-medium">Filter</span>
            
            <Select value={selectedTopic} onValueChange={setSelectedTopic}>
              <SelectTrigger className="w-[160px] bg-background">
                <SelectValue placeholder="All Topics" />
              </SelectTrigger>
              <SelectContent>
                {topics.map(topic => (
                  <SelectItem key={topic} value={topic}>{topic}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-[130px] bg-background">
                <SelectValue placeholder="All Years" />
              </SelectTrigger>
              <SelectContent>
                {years.map(year => (
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
      <main className="flex-1">
        <div className="container mx-auto px-4 py-8">
          {Object.keys(groupedReleases).length === 0 ? (
            <div className="text-center py-16">
              <p className="text-muted-foreground">No press releases found matching your filters.</p>
            </div>
          ) : (
            Object.entries(groupedReleases).map(([monthYear, releases]) => (
              <div key={monthYear} className="mb-12">
                <h2 className="text-2xl md:text-3xl font-semibold text-foreground mb-8">{monthYear}</h2>
                
                <div className="space-y-0">
                  {releases.map((release, index) => (
                    <article 
                      key={release.id}
                      className="group border-t border-border py-8 cursor-pointer hover:bg-muted/20 transition-colors -mx-4 px-4"
                    >
                      <div className="flex gap-6 items-start">
                        {/* Image or Logo placeholder */}
                        <div className="hidden sm:block w-[200px] h-[133px] flex-shrink-0 rounded-lg overflow-hidden bg-muted">
                          {release.image ? (
                            <img 
                              src={release.image} 
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
                            {release.date}
                          </p>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))
          )}

          {/* Pagination placeholder */}
          {filteredReleases.length > 0 && (
            <div className="flex justify-center pt-8 border-t border-border">
              <nav className="flex items-center gap-2">
                <Button variant="ghost" size="sm" disabled className="text-muted-foreground">
                  Previous
                </Button>
                <Button variant="ghost" size="sm" className="text-[#06c] font-medium">
                  1
                </Button>
                <Button variant="ghost" size="sm" className="text-muted-foreground">
                  2
                </Button>
                <Button variant="ghost" size="sm" className="text-muted-foreground">
                  3
                </Button>
                <Button variant="ghost" size="sm" className="text-muted-foreground">
                  Next
                </Button>
              </nav>
            </div>
          )}
        </div>
      </main>

      <Footer />
      <SearchModal open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
