import { useState } from 'react';
import { Save, Info } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import type { ArticleTone } from '@/types';

const sources = ['euronews', 'bloomberg', 'fortune'] as const;
const tones: { value: ArticleTone; label: string }[] = [
  { value: 'neutral', label: 'Neutral' },
  { value: 'professional', label: 'Professional Corporate' },
  { value: 'journalist', label: 'Journalist' },
  { value: 'inspiring', label: 'Inspiring' },
  { value: 'aggressive', label: 'Aggressive' },
  { value: 'powerful', label: 'Powerful' },
  { value: 'important', label: 'Important' },
];

export function SettingsView() {
  const { aiSettings, updateAISettings, sites } = useAppStore();
  const { toast } = useToast();
  
  const [localSettings, setLocalSettings] = useState(aiSettings);

  const handleSourceToggle = (source: typeof sources[number]) => {
    const newSources = localSettings.selectedSources.includes(source)
      ? localSettings.selectedSources.filter(s => s !== source)
      : [...localSettings.selectedSources, source];
    setLocalSettings({ ...localSettings, selectedSources: newSources });
  };

  const handleSiteToggle = (siteId: string) => {
    const newSites = localSettings.targetSites.includes(siteId)
      ? localSettings.targetSites.filter(s => s !== siteId)
      : [...localSettings.targetSites, siteId];
    setLocalSettings({ ...localSettings, targetSites: newSites });
  };

  const handleSave = () => {
    updateAISettings(localSettings);
    toast({
      title: "Settings saved",
      description: "Your AI publishing settings have been updated",
    });
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-4xl font-bold text-foreground">
            Settings
          </h1>
          <p className="mt-2 text-muted-foreground">
            Configure AI article generation and publishing preferences
          </p>
        </div>
        <Button variant="accent" onClick={handleSave}>
          <Save className="mr-2 h-4 w-4" />
          Save Settings
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* News Sources */}
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-xl">News Sources</CardTitle>
            <CardDescription>
              Select which sources to scan for daily headlines
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {sources.map((source) => (
              <label 
                key={source}
                className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors"
              >
                <div>
                  <p className="font-medium capitalize">{source}.com</p>
                  <p className="text-sm text-muted-foreground">
                    {source === 'euronews' && 'European news and current affairs'}
                    {source === 'bloomberg' && 'Business, markets, and financial news'}
                    {source === 'fortune' && 'Business leaders and market insights'}
                  </p>
                </div>
                <Checkbox 
                  checked={localSettings.selectedSources.includes(source)}
                  onCheckedChange={() => handleSourceToggle(source)}
                  className="data-[state=checked]:bg-accent data-[state=checked]:border-accent"
                />
              </label>
            ))}
          </CardContent>
        </Card>

        {/* Default Tone */}
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-xl">Default Article Tone</CardTitle>
            <CardDescription>
              Set the default tone for AI-generated articles
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select 
              value={localSettings.defaultTone}
              onValueChange={(value: ArticleTone) => 
                setLocalSettings({ ...localSettings, defaultTone: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tones.map((tone) => (
                  <SelectItem key={tone.value} value={tone.value}>
                    {tone.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="rounded-lg bg-muted/50 p-4">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium">About Article Tones</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    The tone setting influences the writing style and vocabulary used by the AI. 
                    Political articles focus on policy analysis, while financial content emphasizes 
                    market data and economic indicators.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Auto-Publish */}
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-xl">Auto-Publish</CardTitle>
            <CardDescription>
              Automatically publish generated articles
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 rounded-lg border border-border">
              <div>
                <p className="font-medium">Enable Auto-Publish</p>
                <p className="text-sm text-muted-foreground">
                  Automatically publish articles after AI generation
                </p>
              </div>
              <Switch
                checked={localSettings.autoPublish}
                onCheckedChange={(checked) => 
                  setLocalSettings({ ...localSettings, autoPublish: checked })
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* Target Sites */}
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-xl">Default Target Sites</CardTitle>
            <CardDescription>
              Select default sites for publishing
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sites.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No WordPress sites connected. Add sites in the WP Sites section.
              </p>
            ) : (
              <div className="space-y-3">
                {sites.map((site) => (
                  <label 
                    key={site.id}
                    className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors"
                  >
                    <div>
                      <p className="font-medium">{site.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {site.url}
                      </p>
                    </div>
                    <Checkbox 
                      checked={localSettings.targetSites.includes(site.id)}
                      onCheckedChange={() => handleSiteToggle(site.id)}
                      className="data-[state=checked]:bg-accent data-[state=checked]:border-accent"
                    />
                  </label>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
