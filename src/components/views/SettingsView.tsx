import { useState, useEffect } from 'react';
import { useSites } from '@/hooks/useSites';
import { useUserSettings } from '@/hooks/useUserSettings';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast as sonnerToast } from 'sonner';
import type { ArticleTone } from '@/types';

type SourceType = 'euronews' | 'bloomberg' | 'fortune' | 'bloomberg-middleeast' | 'bloomberg-asia' | 'bloomberg-latest' | 'fortune-latest' | 'euronews-latest' | 'euronews-economy' | 'nikkei-asia' | 'cnn-middleeast';

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

const categorySourcesMap: Record<string, SourceType[]> = {
  political: ['euronews', 'euronews-economy'],
  business: ['bloomberg', 'bloomberg-latest', 'fortune'],
  middleeast: ['bloomberg-middleeast', 'cnn-middleeast'],
  asia: ['bloomberg-asia', 'nikkei-asia'],
};

const tones: {
  value: ArticleTone;
  label: string;
}[] = [
  { value: 'neutral', label: 'Neutral' },
  { value: 'professional', label: 'Professional Corporate' },
  { value: 'journalist', label: 'Journalist' },
  { value: 'inspiring', label: 'Inspiring' },
  { value: 'aggressive', label: 'Aggressive' },
  { value: 'powerful', label: 'Powerful' },
  { value: 'important', label: 'Important' }
];

export function SettingsView() {
  const { settings, updateSettings, isLoading, toggleSource } = useUserSettings();
  const { sites } = useSites();
  
  const [localSettings, setLocalSettings] = useState(settings);
  const [isSaving, setIsSaving] = useState(false);
  const [activeSourceTab, setActiveSourceTab] = useState('political');

  // Sync local settings when settings load from DB
  useEffect(() => {
    if (!isLoading) {
      setLocalSettings(settings);
    }
  }, [settings, isLoading]);

  const handleSourceToggle = (source: SourceType) => {
    const newSources = localSettings.selectedSources.includes(source)
      ? localSettings.selectedSources.filter(s => s !== source)
      : [...localSettings.selectedSources, source];
    setLocalSettings({
      ...localSettings,
      selectedSources: newSources
    });
  };

  const handleSiteToggle = (siteId: string) => {
    const newSites = localSettings.targetSites.includes(siteId)
      ? localSettings.targetSites.filter(s => s !== siteId)
      : [...localSettings.targetSites, siteId];
    setLocalSettings({
      ...localSettings,
      targetSites: newSites
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateSettings(localSettings);
      sonnerToast.success('Settings saved');
    } finally {
      setIsSaving(false);
    }
  };

  const renderSourceCheckbox = (source: SourceType) => (
    <label 
      key={source}
      className="flex items-center gap-2 cursor-pointer group"
    >
      <Checkbox 
        checked={localSettings.selectedSources.includes(source)}
        onCheckedChange={() => handleSourceToggle(source)}
        className="data-[state=checked]:bg-accent data-[state=checked]:border-accent"
      />
      <span className={`text-sm font-medium transition-colors ${
        localSettings.selectedSources.includes(source) 
          ? 'text-foreground' 
          : 'text-muted-foreground'
      }`}>
        {sourceLabels[source]}
      </span>
    </label>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in bg-white min-h-[calc(100vh-56px)] lg:min-h-screen -m-4 lg:-m-8 p-4 lg:p-8">
      <div className="max-w-[980px] mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-foreground">
            Settings
          </h1>
          <p className="mt-2 text-muted-foreground">
            Configure AI article generation and publishing preferences
          </p>
        </div>
        <Button 
          className="border border-transparent shadow-none transition-all duration-300 hover:bg-transparent hover:text-black hover:border-black hover:shadow-none" 
          onClick={handleSave} 
          disabled={isSaving}
        >
          {isSaving ? (
            <>
              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Saving...
            </>
          ) : (
            'Save Settings'
          )}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* News Sources */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl flex items-center justify-between">
              <span>News Sources</span>
              <Badge variant="secondary" className="text-xs">
                {localSettings.selectedSources.length} selected
              </Badge>
            </CardTitle>
            <CardDescription>
              Select which sources to scan for daily headlines
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeSourceTab} onValueChange={setActiveSourceTab}>
              <TabsList className="flex w-full gap-1 mb-4 h-auto p-1">
                <TabsTrigger value="political" className="flex-1 px-3 py-2 text-xs">Political</TabsTrigger>
                <TabsTrigger value="business" className="flex-1 px-3 py-2 text-xs">Business</TabsTrigger>
                <TabsTrigger value="middleeast" className="flex-1 px-3 py-2 text-xs">Mid East</TabsTrigger>
                <TabsTrigger value="asia" className="flex-1 px-3 py-2 text-xs">Asia</TabsTrigger>
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
                <p className="text-xs text-muted-foreground mb-3">Asia & Pacific</p>
                <div className="flex flex-wrap gap-6">
                  {categorySourcesMap.asia.map(renderSourceCheckbox)}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Default Tone */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Default Article Tone</CardTitle>
            <CardDescription>
              Set the default tone for AI-generated articles
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select
              value={localSettings.defaultTone}
              onValueChange={(value: ArticleTone) =>
                setLocalSettings({
                  ...localSettings,
                  defaultTone: value
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tones.map(tone => (
                  <SelectItem key={tone.value} value={tone.value}>
                    {tone.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="rounded-lg bg-muted/50 p-4">
              <div>
                <p className="text-sm font-medium">About Article Tones</p>
                <p className="text-sm text-muted-foreground mt-1">
                  The tone setting influences the writing style and vocabulary used by the AI.
                  Political articles focus on policy analysis, while financial content emphasizes
                  market data and economic indicators.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      </div>
    </div>
  );
}
