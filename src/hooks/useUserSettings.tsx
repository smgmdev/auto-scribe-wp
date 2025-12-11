import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

type SourceType = 'euronews' | 'bloomberg' | 'fortune' | 'bloomberg-middleeast' | 'bloomberg-asia' | 'bloomberg-latest' | 'fortune-latest' | 'euronews-latest' | 'euronews-economy' | 'nikkei-asia' | 'cnn-middleeast';

export interface UserSettings {
  selectedSources: SourceType[];
  defaultTone: string;
  autoPublish: boolean;
  targetSites: string[];
}

const defaultSettings: UserSettings = {
  selectedSources: ['euronews', 'bloomberg', 'fortune'],
  defaultTone: 'neutral',
  autoPublish: false,
  targetSites: [],
};

export function useUserSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch settings from database
  useEffect(() => {
    if (!user) {
      setSettings(defaultSettings);
      setIsLoading(false);
      return;
    }

    const fetchSettings = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching user settings:', error);
        setIsLoading(false);
        return;
      }

      if (data) {
        setSettings({
          selectedSources: (data.selected_sources || defaultSettings.selectedSources) as SourceType[],
          defaultTone: data.default_tone || defaultSettings.defaultTone,
          autoPublish: data.auto_publish ?? defaultSettings.autoPublish,
          targetSites: data.target_sites || defaultSettings.targetSites,
        });
      } else {
        // Create default settings for new user
        const { error: insertError } = await supabase
          .from('user_settings')
          .insert({
            user_id: user.id,
            selected_sources: defaultSettings.selectedSources,
            default_tone: defaultSettings.defaultTone,
            auto_publish: defaultSettings.autoPublish,
            target_sites: defaultSettings.targetSites,
          });

        if (insertError) {
          console.error('Error creating user settings:', insertError);
        }
      }

      setIsLoading(false);
    };

    fetchSettings();
  }, [user]);

  // Update settings in database
  const updateSettings = useCallback(async (newSettings: Partial<UserSettings>) => {
    if (!user) return;

    const updatedSettings = { ...settings, ...newSettings };
    setSettings(updatedSettings);

    const { error } = await supabase
      .from('user_settings')
      .update({
        selected_sources: updatedSettings.selectedSources,
        default_tone: updatedSettings.defaultTone,
        auto_publish: updatedSettings.autoPublish,
        target_sites: updatedSettings.targetSites,
      })
      .eq('user_id', user.id);

    if (error) {
      console.error('Error updating user settings:', error);
    }
  }, [user, settings]);

  // Toggle a source
  const toggleSource = useCallback((source: SourceType) => {
    const currentSources = settings.selectedSources;
    const newSources = currentSources.includes(source)
      ? currentSources.filter(s => s !== source)
      : [...currentSources, source];
    
    updateSettings({ selectedSources: newSources });
  }, [settings.selectedSources, updateSettings]);

  return {
    settings,
    isLoading,
    updateSettings,
    toggleSource,
  };
}
