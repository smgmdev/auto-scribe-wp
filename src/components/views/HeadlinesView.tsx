import { useState } from 'react';
import { Newspaper, RefreshCw, ExternalLink, ArrowRight, Clock } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useUserSettings } from '@/hooks/useUserSettings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { Headline } from '@/types';

const sourceColors: Record<string, string> = {
  euronews: 'bg-headline-business/10 text-headline-business border-headline-business/30',
  'euronews-latest': 'bg-teal-500/10 text-teal-600 border-teal-500/30',
  'euronews-economy': 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
  bloomberg: 'bg-headline-financial/10 text-headline-financial border-headline-financial/30',
  'bloomberg-middleeast': 'bg-amber-500/10 text-amber-600 border-amber-500/30',
  'bloomberg-asia': 'bg-red-500/10 text-red-600 border-red-500/30',
  'bloomberg-latest': 'bg-purple-500/10 text-purple-600 border-purple-500/30',
  fortune: 'bg-headline-crypto/10 text-headline-crypto border-headline-crypto/30',
  'fortune-latest': 'bg-pink-500/10 text-pink-600 border-pink-500/30',
  'nikkei-asia': 'bg-rose-500/10 text-rose-600 border-rose-500/30',
  'cnn-middleeast': 'bg-orange-500/10 text-orange-600 border-orange-500/30',
};

const sourceLabels: Record<string, string> = {
  euronews: 'Euronews',
  'euronews-latest': 'Euronews Latest',
  'euronews-economy': 'Euronews Economy',
  bloomberg: 'Bloomberg (US Global)',
  'bloomberg-middleeast': 'Bloomberg Middle East',
  'bloomberg-asia': 'Bloomberg Asia',
  'bloomberg-latest': 'Bloomberg Latest',
  fortune: 'Fortune',
  'fortune-latest': 'Fortune Latest',
  'nikkei-asia': 'NIKKEI Asia',
  'cnn-middleeast': 'CNN Middle East',
};

type SourceType = 'euronews' | 'bloomberg' | 'fortune' | 'bloomberg-middleeast' | 'bloomberg-asia' | 'bloomberg-latest' | 'fortune-latest' | 'euronews-latest' | 'euronews-economy' | 'nikkei-asia' | 'cnn-middleeast';

// Category to sources mapping
const categorySourcesMap: Record<string, SourceType[]> = {
  political: ['euronews', 'euronews-economy'],
  business: ['bloomberg', 'bloomberg-latest', 'fortune'],
  middleeast: ['bloomberg-middleeast', 'cnn-middleeast'],
  asia: ['bloomberg-asia', 'nikkei-asia'],
};

const allSources: SourceType[] = [
  'euronews', 'euronews-economy', 'bloomberg', 'bloomberg-latest', 'fortune',
  'bloomberg-middleeast', 'cnn-middleeast', 'bloomberg-asia', 'nikkei-asia'
];

export function HeadlinesView() {
  const { 
    setSelectedHeadline, 
    setCurrentView, 
    setHeadlines, 
    headlines,
  } = useAppStore();
  const { settings, toggleSource, isLoading: settingsLoading } = useUserSettings();
  const { toast } = useToast();
  const [isScanning, setIsScanning] = useState(false);
  const [displayedHeadlines, setDisplayedHeadlines] = useState<Headline[]>(headlines);
  const [activeTab, setActiveTab] = useState('political');

  const handleScan = async () => {
    if (settings.selectedSources.length === 0) {
      toast({
        title: "No sources selected",
        description: "Please select at least one news source to scan",
        variant: "destructive",
      });
      return;
    }

    setIsScanning(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('scan-headlines', {
        body: { sources: settings.selectedSources }
      });

      if (error) {
        throw error;
      }

      if (data?.success && data?.headlines) {
        const parsedHeadlines = data.headlines.map((h: any) => ({
          ...h,
          publishedAt: new Date(h.publishedAt)
        }));
        setDisplayedHeadlines(parsedHeadlines);
        setHeadlines(parsedHeadlines);
        toast({
          title: "Headlines scanned",
          description: `Found ${parsedHeadlines.length} headlines from ${settings.selectedSources.length} source(s)`,
        });
      } else {
        throw new Error(data?.error || 'Failed to scan headlines');
      }
    } catch (error) {
      console.error('Error scanning headlines:', error);
      toast({
        title: "Scan failed",
        description: error instanceof Error ? error.message : "Failed to scan headlines",
        variant: "destructive",
      });
    } finally {
      setIsScanning(false);
    }
  };

  const handleSelectHeadline = (headline: Headline) => {
    setSelectedHeadline(headline);
    setCurrentView('compose');
  };

  const handleToggleSource = (source: SourceType) => {
    toggleSource(source);
  };

  const filteredHeadlines = displayedHeadlines.filter(
    h => settings.selectedSources.includes(h.source)
  );

  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - new Date(date).getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffHours >= 24) {
      return `${Math.floor(diffHours / 24)}d ago`;
    } else if (diffHours >= 1) {
      return `${diffHours}h ago`;
    } else if (diffMins >= 1) {
      return `${diffMins}m ago`;
    }
    return 'Just now';
  };

  const renderSourceCheckbox = (source: SourceType) => (
    <label 
      key={source}
      className="flex items-center gap-2 cursor-pointer group"
    >
      <Checkbox 
        checked={settings.selectedSources.includes(source)}
        onCheckedChange={() => handleToggleSource(source)}
        className="data-[state=checked]:bg-accent data-[state=checked]:border-accent"
        disabled={settingsLoading}
      />
      <span className={`text-sm font-medium transition-colors ${
        settings.selectedSources.includes(source) 
          ? 'text-foreground' 
          : 'text-muted-foreground'
      }`}>
        {sourceLabels[source]}
      </span>
    </label>
  );

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-foreground">
            Sources
          </h1>
          <p className="mt-2 text-muted-foreground">
            Scan news sources for trending stories to write about
          </p>
        </div>
        
        <Button 
          variant="accent" 
          onClick={handleScan}
          disabled={isScanning || settings.selectedSources.length === 0 || settingsLoading}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isScanning ? 'animate-spin' : ''}`} />
          {isScanning ? 'Scanning...' : 'Scan Headlines'}
        </Button>
      </div>

      {/* Source Filters with Tabs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
            <span>Active Sources</span>
            <Badge variant="secondary" className="text-xs">
              {settings.selectedSources.length} selected
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4 mb-4">
              <TabsTrigger value="political">Political</TabsTrigger>
              <TabsTrigger value="business">Business</TabsTrigger>
              <TabsTrigger value="middleeast">Middle East</TabsTrigger>
              <TabsTrigger value="asia">Asia</TabsTrigger>
            </TabsList>

            <TabsContent value="political" className="space-y-3">
              <p className="text-xs text-muted-foreground mb-3">Political & Current Affairs</p>
              <div className="flex flex-wrap gap-6">
                {categorySourcesMap.political.map(renderSourceCheckbox)}
              </div>
            </TabsContent>

            <TabsContent value="business" className="space-y-3">
              <p className="text-xs text-muted-foreground mb-3">Business & Finance</p>
              <div className="flex flex-wrap gap-6">
                {categorySourcesMap.business.map(renderSourceCheckbox)}
              </div>
            </TabsContent>

            <TabsContent value="middleeast" className="space-y-3">
              <p className="text-xs text-muted-foreground mb-3">Middle East News</p>
              <div className="flex flex-wrap gap-6">
                {categorySourcesMap.middleeast.map(renderSourceCheckbox)}
              </div>
            </TabsContent>

            <TabsContent value="asia" className="space-y-3">
              <p className="text-xs text-muted-foreground mb-3">Asia Pacific</p>
              <div className="flex flex-wrap gap-6">
                {categorySourcesMap.asia.map(renderSourceCheckbox)}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Headlines List */}
      <div className="space-y-4">
        {filteredHeadlines.length === 0 ? (
          <Card className="border-dashed border-2">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Newspaper className="h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-xl font-semibold">No headlines found</h3>
              <p className="mt-2 text-sm text-muted-foreground text-center max-w-sm">
                {settings.selectedSources.length === 0 
                  ? "Select at least one source, then click 'Scan Headlines'"
                  : "Click 'Scan Headlines' to fetch the latest news from your selected sources"
                }
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span>Last 24 hours headlines</span>
              </div>
              <div className="flex gap-3 flex-wrap">
                {allSources.map(source => {
                  const count = filteredHeadlines.filter(h => h.source === source).length;
                  if (count === 0) return null;
                  return (
                    <Badge key={source} variant="outline" className={sourceColors[source]}>
                      {sourceLabels[source]}: {count}
                    </Badge>
                  );
                })}
              </div>
            </div>
            {filteredHeadlines.map((headline, index) => (
              <Card 
                key={headline.id}
                className="group hover:shadow-md transition-all duration-300 cursor-pointer"
                style={{ animationDelay: `${index * 50}ms` }}
                onClick={() => handleSelectHeadline(headline)}
              >
                <CardContent className="flex items-start justify-between p-6">
                  <div className="flex-1 pr-4">
                    <div className="flex items-center gap-3 mb-2">
                      <Badge 
                        variant="outline" 
                        className={sourceColors[headline.source]}
                      >
                        {sourceLabels[headline.source]}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatTimeAgo(headline.publishedAt)}
                      </span>
                    </div>
                    <h3 className="text-xl font-semibold text-foreground group-hover:text-accent transition-colors">
                      {headline.title}
                    </h3>
                    {headline.summary && (
                      <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                        {headline.summary}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground/70 truncate max-w-md">
                      {headline.url}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <a 
                      href={headline.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-md hover:bg-[hsl(var(--icon-hover))] transition-colors"
                      onClick={(e) => e.stopPropagation()}
                      title={headline.url}
                    >
                      <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-white" />
                    </a>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[hsl(var(--icon-hover))] hover:text-white"
                    >
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
