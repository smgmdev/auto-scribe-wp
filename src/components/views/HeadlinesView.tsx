import { useState } from 'react';
import { Newspaper, RefreshCw, ExternalLink, ArrowRight, Clock } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { Headline } from '@/types';

const sourceColors = {
  euronews: 'bg-headline-business/10 text-headline-business border-headline-business/30',
  bloomberg: 'bg-headline-financial/10 text-headline-financial border-headline-financial/30',
  'bloomberg-middleeast': 'bg-amber-500/10 text-amber-600 border-amber-500/30',
  'bloomberg-asia': 'bg-red-500/10 text-red-600 border-red-500/30',
  fortune: 'bg-headline-crypto/10 text-headline-crypto border-headline-crypto/30',
};

const sourceLabels = {
  euronews: 'Euronews',
  bloomberg: 'Bloomberg (US Global)',
  'bloomberg-middleeast': 'Bloomberg Middle East',
  'bloomberg-asia': 'Bloomberg Asia',
  fortune: 'Fortune',
};

type SourceType = 'euronews' | 'bloomberg' | 'fortune' | 'bloomberg-middleeast' | 'bloomberg-asia';

export function HeadlinesView() {
  const { 
    aiSettings, 
    setSelectedHeadline, 
    setCurrentView, 
    setHeadlines, 
    headlines,
    toggleSource 
  } = useAppStore();
  const { toast } = useToast();
  const [isScanning, setIsScanning] = useState(false);
  const [displayedHeadlines, setDisplayedHeadlines] = useState<Headline[]>(headlines);

  const handleScan = async () => {
    if (aiSettings.selectedSources.length === 0) {
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
        body: { sources: aiSettings.selectedSources }
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
          description: `Found ${parsedHeadlines.length} headlines from ${aiSettings.selectedSources.length} source(s)`,
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
    h => aiSettings.selectedSources.includes(h.source)
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

  const mainSources: SourceType[] = ['euronews', 'bloomberg', 'fortune'];
  const bloombergSubSources: SourceType[] = ['bloomberg-middleeast', 'bloomberg-asia'];
  const allSources: SourceType[] = [...mainSources, ...bloombergSubSources];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-4xl font-bold text-foreground">
            Headlines
          </h1>
          <p className="mt-2 text-muted-foreground">
            Scan news sources for trending stories to write about
          </p>
        </div>
        
        <Button 
          variant="accent" 
          onClick={handleScan}
          disabled={isScanning || aiSettings.selectedSources.length === 0}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isScanning ? 'animate-spin' : ''}`} />
          {isScanning ? 'Scanning...' : 'Scan Headlines'}
        </Button>
      </div>

      {/* Source Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
            <span>Active Sources</span>
            <Badge variant="secondary" className="text-xs">
              {aiSettings.selectedSources.length} selected
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Main sources */}
          <div className="flex gap-6">
            {mainSources.map((source) => (
              <label 
                key={source}
                className="flex items-center gap-2 cursor-pointer group"
              >
                <Checkbox 
                  checked={aiSettings.selectedSources.includes(source)}
                  onCheckedChange={() => handleToggleSource(source)}
                  className="data-[state=checked]:bg-accent data-[state=checked]:border-accent"
                />
                <span className={`text-sm font-medium transition-colors ${
                  aiSettings.selectedSources.includes(source) 
                    ? 'text-foreground' 
                    : 'text-muted-foreground'
                }`}>
                  {sourceLabels[source]}.com
                </span>
              </label>
            ))}
          </div>
          
          {/* Bloomberg sub-sources */}
          <div className="border-l-2 border-headline-financial/30 pl-4 ml-6">
            <p className="text-xs text-muted-foreground mb-2">Bloomberg Regions</p>
            <div className="flex gap-6">
              {bloombergSubSources.map((source) => (
                <label 
                  key={source}
                  className="flex items-center gap-2 cursor-pointer group"
                >
                  <Checkbox 
                    checked={aiSettings.selectedSources.includes(source)}
                    onCheckedChange={() => handleToggleSource(source)}
                    className="data-[state=checked]:bg-accent data-[state=checked]:border-accent"
                  />
                  <span className={`text-sm font-medium transition-colors ${
                    aiSettings.selectedSources.includes(source) 
                      ? 'text-foreground' 
                      : 'text-muted-foreground'
                  }`}>
                    {sourceLabels[source]}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Headlines List */}
      <div className="space-y-4">
        {filteredHeadlines.length === 0 ? (
          <Card className="border-dashed border-2">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Newspaper className="h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 font-display text-xl font-semibold">No headlines found</h3>
              <p className="mt-2 text-sm text-muted-foreground text-center max-w-sm">
                {aiSettings.selectedSources.length === 0 
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
                    <h3 className="font-display text-xl font-semibold text-foreground group-hover:text-accent transition-colors">
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
                      className="p-2 rounded-md hover:bg-muted transition-colors"
                      onClick={(e) => e.stopPropagation()}
                      title={headline.url}
                    >
                      <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-accent" />
                    </a>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
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