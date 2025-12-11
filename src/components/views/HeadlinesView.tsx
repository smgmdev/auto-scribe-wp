import { useState } from 'react';
import { Newspaper, RefreshCw, ExternalLink, ArrowRight } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import type { Headline } from '@/types';

const mockHeadlines: Headline[] = [
  {
    id: '1',
    title: 'European Central Bank Signals Rate Cut Amid Economic Uncertainty',
    source: 'euronews',
    url: 'https://euronews.com/example',
    publishedAt: new Date(),
    summary: 'ECB officials hint at potential interest rate reductions as inflation pressures ease.',
  },
  {
    id: '2',
    title: 'Tech Giants Report Record Quarterly Earnings Despite Market Volatility',
    source: 'bloomberg',
    url: 'https://bloomberg.com/example',
    publishedAt: new Date(),
    summary: 'Major technology companies exceed analyst expectations in latest earnings reports.',
  },
  {
    id: '3',
    title: 'Cryptocurrency Market Sees Renewed Institutional Interest',
    source: 'fortune',
    url: 'https://fortune.com/example',
    publishedAt: new Date(),
    summary: 'Wall Street firms increase digital asset allocations amid regulatory clarity.',
  },
  {
    id: '4',
    title: 'Real Estate Markets Show Signs of Recovery in Major Cities',
    source: 'bloomberg',
    url: 'https://bloomberg.com/example2',
    publishedAt: new Date(),
    summary: 'Housing prices stabilize as mortgage rates begin to moderate.',
  },
  {
    id: '5',
    title: 'Global Supply Chain Disruptions Expected to Continue Through Year',
    source: 'euronews',
    url: 'https://euronews.com/example2',
    publishedAt: new Date(),
    summary: 'Manufacturing delays persist as companies adapt logistics strategies.',
  },
];

const sourceColors = {
  euronews: 'bg-headline-business/10 text-headline-business border-headline-business/30',
  bloomberg: 'bg-headline-financial/10 text-headline-financial border-headline-financial/30',
  fortune: 'bg-headline-crypto/10 text-headline-crypto border-headline-crypto/30',
};

export function HeadlinesView() {
  const { aiSettings, setSelectedHeadline, setCurrentView, setHeadlines, headlines } = useAppStore();
  const [isScanning, setIsScanning] = useState(false);
  const [displayedHeadlines, setDisplayedHeadlines] = useState<Headline[]>(mockHeadlines);

  const handleScan = () => {
    setIsScanning(true);
    // Simulate scanning delay
    setTimeout(() => {
      setDisplayedHeadlines(mockHeadlines);
      setHeadlines(mockHeadlines);
      setIsScanning(false);
    }, 2000);
  };

  const handleSelectHeadline = (headline: Headline) => {
    setSelectedHeadline(headline);
    setCurrentView('compose');
  };

  const filteredHeadlines = displayedHeadlines.filter(
    h => aiSettings.selectedSources.includes(h.source)
  );

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
          disabled={isScanning}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isScanning ? 'animate-spin' : ''}`} />
          {isScanning ? 'Scanning...' : 'Scan Headlines'}
        </Button>
      </div>

      {/* Source Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Active Sources
          </CardTitle>
        </CardHeader>
        <CardContent className="flex gap-4">
          {(['euronews', 'bloomberg', 'fortune'] as const).map((source) => (
            <label 
              key={source}
              className="flex items-center gap-2 cursor-pointer"
            >
              <Checkbox 
                checked={aiSettings.selectedSources.includes(source)}
                className="data-[state=checked]:bg-accent data-[state=checked]:border-accent"
              />
              <span className="text-sm capitalize">{source}.com</span>
            </label>
          ))}
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
                Click "Scan Headlines" to fetch the latest news from your selected sources
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredHeadlines.map((headline, index) => (
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
                      {headline.source}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(headline.publishedAt).toLocaleDateString()}
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
                </div>
                <div className="flex items-center gap-2">
                  <a 
                    href={headline.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-md hover:bg-muted transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
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
          ))
        )}
      </div>
    </div>
  );
}
