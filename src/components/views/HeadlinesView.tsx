import { useState } from 'react';
import { Newspaper, RefreshCw, ExternalLink, ArrowRight, Clock } from 'lucide-react';
import { WebViewDialog } from '@/components/ui/WebViewDialog';
import { useAppStore } from '@/stores/appStore';
import { useUserSettings } from '@/hooks/useUserSettings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
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
  // Russia
  'moscow-times': 'bg-blue-500/10 text-blue-600 border-blue-500/30',
  'rt-russia': 'bg-green-600/10 text-green-700 border-green-600/30',
  'tass': 'bg-sky-500/10 text-sky-600 border-sky-500/30',
  // Ukraine
  'kyiv-independent': 'bg-yellow-500/10 text-yellow-700 border-yellow-500/30',
  'ukrainska-pravda': 'bg-blue-600/10 text-blue-700 border-blue-600/30',
  // Arabian
  'al-jazeera': 'bg-amber-600/10 text-amber-700 border-amber-600/30',
  'gulf-news': 'bg-cyan-500/10 text-cyan-600 border-cyan-500/30',
  'arab-news': 'bg-lime-500/10 text-lime-700 border-lime-500/30',
  // Asia local
  'scmp': 'bg-orange-600/10 text-orange-700 border-orange-600/30',
  'channel-news-asia': 'bg-red-600/10 text-red-700 border-red-600/30',
  'straits-times': 'bg-indigo-500/10 text-indigo-600 border-indigo-500/30',
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
  // Russia
  'moscow-times': 'Moscow Times',
  'rt-russia': 'RT',
  'tass': 'TASS',
  // Ukraine
  'kyiv-independent': 'Kyiv Independent',
  'ukrainska-pravda': 'Ukrainska Pravda',
  // Arabian
  'al-jazeera': 'Al Jazeera',
  'gulf-news': 'Gulf News',
  'arab-news': 'Arab News',
  // Asia local
  'scmp': 'South China Morning Post',
  'channel-news-asia': 'Channel News Asia',
  'straits-times': 'Straits Times',
};

type SourceType = 'euronews' | 'bloomberg' | 'fortune' | 'bloomberg-middleeast' | 'bloomberg-asia' | 'bloomberg-latest' | 'fortune-latest' | 'euronews-latest' | 'euronews-economy' | 'nikkei-asia' | 'cnn-middleeast' | 'moscow-times' | 'rt-russia' | 'tass' | 'kyiv-independent' | 'ukrainska-pravda' | 'al-jazeera' | 'gulf-news' | 'arab-news' | 'scmp' | 'channel-news-asia' | 'straits-times';

// Category to sources mapping
const categorySourcesMap: Record<string, SourceType[]> = {
  political: ['euronews', 'euronews-economy'],
  business: ['bloomberg', 'bloomberg-latest', 'fortune'],
  middleeast: ['bloomberg-middleeast', 'cnn-middleeast', 'al-jazeera', 'gulf-news', 'arab-news'],
  asia: ['bloomberg-asia', 'nikkei-asia', 'scmp', 'channel-news-asia', 'straits-times'],
  russia: ['moscow-times', 'rt-russia', 'tass'],
  ukraine: ['kyiv-independent', 'ukrainska-pravda'],
};

const allSources: SourceType[] = [
  'euronews', 'euronews-economy', 'bloomberg', 'bloomberg-latest', 'fortune',
  'bloomberg-middleeast', 'cnn-middleeast', 'al-jazeera', 'gulf-news', 'arab-news',
  'bloomberg-asia', 'nikkei-asia', 'scmp', 'channel-news-asia', 'straits-times',
  'moscow-times', 'rt-russia', 'tass', 'kyiv-independent', 'ukrainska-pravda',
];

export function HeadlinesView() {
  const { 
    setSelectedHeadline, 
    setCurrentView, 
    setHeadlines, 
    headlines,
  } = useAppStore();
  const { settings, toggleSource, isLoading: settingsLoading } = useUserSettings();
  
  const [isScanning, setIsScanning] = useState(false);
  const [displayedHeadlines, setDisplayedHeadlines] = useState<Headline[]>(headlines);
  const [activeTab, setActiveTab] = useState('political');
  const [webViewUrl, setWebViewUrl] = useState<string | null>(null);
  const [webViewTitle, setWebViewTitle] = useState('');

  const handleScan = async () => {
    if (settings.selectedSources.length === 0) {
      toast.error('Please select at least one news source to scan');
      return;
    }

    setIsScanning(true);
    
    try {
      console.log('[HeadlinesView] Invoking scan-headlines with sources:', settings.selectedSources);
      const { data, error } = await supabase.functions.invoke('scan-headlines', {
        body: { sources: settings.selectedSources }
      });

      console.log('[HeadlinesView] Response:', { data, error });

      if (error) {
        console.error('[HeadlinesView] Function error details:', JSON.stringify(error));
        throw error;
      }

      if (data?.success && data?.headlines) {
        const parsedHeadlines = data.headlines.map((h: any) => ({
          ...h,
          publishedAt: new Date(h.publishedAt)
        }));
        setDisplayedHeadlines(parsedHeadlines);
        setHeadlines(parsedHeadlines);
        toast.success(`Found ${parsedHeadlines.length} headlines from ${settings.selectedSources.length} source(s)`);
      } else {
        throw new Error(data?.error || 'Failed to scan headlines');
      }
    } catch (error) {
      console.error('Error scanning headlines:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to scan headlines');
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
        className="border-white/40 data-[state=checked]:bg-accent data-[state=checked]:border-accent"
        disabled={settingsLoading}
      />
      <span className={`text-sm font-medium transition-colors ${
        settings.selectedSources.includes(source) 
          ? 'text-white' 
          : 'text-white/60'
      }`}>
        {sourceLabels[source]}
      </span>
    </label>
  );

  return (
    <div className="animate-fade-in bg-white min-h-[calc(100vh-56px)] lg:min-h-screen -m-4 lg:-m-8 p-4 lg:p-8 overflow-x-hidden">
      <div className="max-w-[980px] mx-auto space-y-0 overflow-x-hidden">
      {/* Header */}
      <div className="mb-0 md:mb-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-4xl font-bold text-foreground">
              Sources
            </h1>
            <p className="mt-2 text-muted-foreground">
              Scan news sources for trending stories to write about
            </p>
          </div>
          
          <Button 
            onClick={handleScan}
            disabled={isScanning || settings.selectedSources.length === 0 || settingsLoading}
            className="hidden md:inline-flex bg-black text-white border border-black shadow-none transition-all duration-300 hover:bg-transparent hover:text-black hover:border-black hover:shadow-none"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isScanning ? 'animate-spin' : ''}`} />
            {isScanning ? 'Scanning...' : 'Scan Headlines'}
          </Button>
        </div>
        <Button 
          onClick={handleScan}
          disabled={isScanning || settings.selectedSources.length === 0 || settingsLoading}
          className="md:hidden w-full mt-4 bg-black text-white border border-black shadow-none transition-all duration-300 hover:bg-transparent hover:text-black hover:border-black hover:shadow-none"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isScanning ? 'animate-spin' : ''}`} />
          {isScanning ? 'Scanning...' : 'Scan Headlines'}
        </Button>
      </div>

      {/* Source Filters with Tabs */}
      <Card className="bg-foreground text-white border-foreground">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-white/60 flex items-center justify-between">
            <span>Active Sources</span>
            <Badge variant="secondary" className="text-xs bg-[#f1a239] text-black border-[#f1a239]">
              {settings.selectedSources.length} selected
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="overflow-x-auto scrollbar-hide mb-4">
              <TabsList className="inline-flex w-auto md:grid md:grid-cols-6 md:w-full p-0 h-auto bg-white/10">
                <TabsTrigger value="political" className="py-2 px-6 data-[state=active]:bg-white data-[state=active]:text-foreground text-white/60 bg-transparent whitespace-nowrap">Political</TabsTrigger>
                <TabsTrigger value="business" className="py-2 px-6 data-[state=active]:bg-white data-[state=active]:text-foreground text-white/60 bg-transparent whitespace-nowrap">Business</TabsTrigger>
                <TabsTrigger value="middleeast" className="py-2 px-6 data-[state=active]:bg-white data-[state=active]:text-foreground text-white/60 bg-transparent whitespace-nowrap">Middle East</TabsTrigger>
                <TabsTrigger value="asia" className="py-2 px-6 data-[state=active]:bg-white data-[state=active]:text-foreground text-white/60 bg-transparent whitespace-nowrap">Asia</TabsTrigger>
                <TabsTrigger value="russia" className="py-2 px-6 data-[state=active]:bg-white data-[state=active]:text-foreground text-white/60 bg-transparent whitespace-nowrap">Russia</TabsTrigger>
                <TabsTrigger value="ukraine" className="py-2 px-6 data-[state=active]:bg-white data-[state=active]:text-foreground text-white/60 bg-transparent whitespace-nowrap">Ukraine</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="political" className="space-y-3">
              <p className="text-xs text-white/50 mb-3">Political & Current Affairs</p>
              <div className="flex flex-wrap gap-6">
                {categorySourcesMap.political.map(renderSourceCheckbox)}
              </div>
            </TabsContent>

            <TabsContent value="business" className="space-y-3">
              <p className="text-xs text-white/50 mb-3">Business & Finance</p>
              <div className="flex flex-wrap gap-6">
                {categorySourcesMap.business.map(renderSourceCheckbox)}
              </div>
            </TabsContent>

            <TabsContent value="middleeast" className="space-y-3">
              <p className="text-xs text-white/50 mb-3">Middle East News</p>
              <div className="flex flex-wrap gap-6">
                {categorySourcesMap.middleeast.map(renderSourceCheckbox)}
              </div>
            </TabsContent>

            <TabsContent value="asia" className="space-y-3">
              <p className="text-xs text-white/50 mb-3">Asia Pacific</p>
              <div className="flex flex-wrap gap-6">
                {categorySourcesMap.asia.map(renderSourceCheckbox)}
              </div>
            </TabsContent>

            <TabsContent value="russia" className="space-y-3">
              <p className="text-xs text-white/50 mb-3">Russia News</p>
              <div className="flex flex-wrap gap-6">
                {categorySourcesMap.russia.map(renderSourceCheckbox)}
              </div>
            </TabsContent>

            <TabsContent value="ukraine" className="space-y-3">
              <p className="text-xs text-white/50 mb-3">Ukraine News</p>
              <div className="flex flex-wrap gap-6">
                {categorySourcesMap.ukraine.map(renderSourceCheckbox)}
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
            <div className="flex flex-col-reverse md:flex-row md:items-center md:justify-between gap-2 text-sm text-white bg-foreground p-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span>Last 24 hours headlines</span>
              </div>
              <div className="flex gap-2 flex-wrap">
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
                <CardContent className="p-4 md:p-6">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
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
                      <div className="hidden md:flex items-center flex-shrink-0">
                        <Button 
                          variant="default"
                          className="h-9 bg-foreground text-white border border-foreground hover:bg-transparent hover:text-foreground transition-all duration-300 text-sm"
                          onClick={(e) => { e.stopPropagation(); setWebViewUrl(headline.url); setWebViewTitle(headline.title); }}
                          title={headline.url}
                        >
                          View
                          <ExternalLink className="h-4 w-4 ml-1" />
                        </Button>
                        <Button 
                          variant="default"
                          className="group/btn h-9 bg-foreground text-white border border-foreground hover:bg-transparent hover:text-foreground transition-all duration-300 text-sm -ml-px"
                          onClick={(e) => { e.stopPropagation(); handleSelectHeadline(headline); }}
                        >
                          Use Source
                          <ArrowRight className="h-4 w-4 ml-0 max-w-0 opacity-0 group-hover/btn:ml-1 group-hover/btn:max-w-[16px] group-hover/btn:opacity-100 transition-all duration-300" />
                        </Button>
                      </div>
                    </div>
                    <h3 className="text-lg md:text-xl font-semibold text-foreground group-hover:text-accent transition-colors">
                      {headline.title}
                    </h3>
                    {headline.summary && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {headline.summary}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground/70 truncate">
                      {headline.url}
                    </p>
                    <div className="flex md:hidden items-center pt-2">
                      <Button 
                        variant="default"
                        className="flex-1 h-9 bg-foreground text-white border border-foreground hover:bg-transparent hover:text-foreground transition-all duration-300"
                        onClick={(e) => { e.stopPropagation(); setWebViewUrl(headline.url); setWebViewTitle(headline.title); }}
                      >
                        View
                        <ExternalLink className="h-4 w-4 ml-1" />
                      </Button>
                      <Button 
                        variant="default"
                        className="group/btn flex-1 h-9 bg-foreground text-white border border-foreground hover:bg-transparent hover:text-foreground transition-all duration-300"
                        onClick={() => handleSelectHeadline(headline)}
                      >
                        Use Source
                        <ArrowRight className="h-4 w-4 ml-0 max-w-0 opacity-0 group-hover/btn:ml-1 group-hover/btn:max-w-[16px] group-hover/btn:opacity-100 transition-all duration-300" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </>
        )}
      </div>

      <WebViewDialog
        open={!!webViewUrl}
        onOpenChange={(open) => !open && setWebViewUrl(null)}
        url={webViewUrl || ''}
        title={webViewTitle}
        isWebsite
      />
      </div>
    </div>
  );
}
