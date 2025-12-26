import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { WordPressSite, SEOPlugin } from '@/types';

// Full site data for admins (includes credentials)
interface DbSite {
  id: string;
  name: string;
  url: string;
  username: string;
  app_password: string;
  seo_plugin: string;
  favicon: string | null;
  connected: boolean;
  created_at: string;
  updated_at: string;
  agency: string | null;
}

// Public site data from RPC function (no credentials)
interface PublicSite {
  id: string;
  name: string;
  url: string;
  seo_plugin: string;
  favicon: string | null;
  connected: boolean;
  agency: string | null;
}

const mapDbSiteToSite = (dbSite: DbSite): WordPressSite => ({
  id: dbSite.id,
  name: dbSite.name,
  url: dbSite.url,
  username: dbSite.username,
  applicationPassword: dbSite.app_password,
  seoPlugin: dbSite.seo_plugin as SEOPlugin,
  favicon: dbSite.favicon || undefined,
  connected: dbSite.connected,
  agency: dbSite.agency || undefined,
});

const mapPublicSiteToSite = (site: PublicSite): WordPressSite => ({
  id: site.id,
  name: site.name,
  url: site.url,
  username: '', // Not exposed to regular users
  applicationPassword: '', // Not exposed to regular users
  seoPlugin: site.seo_plugin as SEOPlugin,
  favicon: site.favicon || undefined,
  connected: site.connected,
  agency: site.agency || undefined,
});

export function useSites() {
  const [sites, setSites] = useState<WordPressSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isAdmin, loading: authLoading } = useAuth();
  const [hasFetched, setHasFetched] = useState(false);
  const [lastIsAdmin, setLastIsAdmin] = useState<boolean | null>(null);

  const fetchSites = useCallback(async () => {
    console.log('[useSites] fetchSites called, isAdmin:', isAdmin);
    setLoading(true);
    setError(null);
    
    if (isAdmin) {
      // Admins get full access to credentials via direct table query
      // Only fetch connected sites for Instant Publishing library
      const { data, error: fetchError } = await supabase
        .from('wordpress_sites')
        .select('*')
        .eq('connected', true)
        .order('created_at', { ascending: true });

      if (fetchError) {
        console.error('Error fetching sites:', fetchError);
        setError(fetchError.message);
        setSites([]);
      } else {
        console.log('[useSites] Admin sites fetched:', data?.length);
        setSites((data as DbSite[]).map(mapDbSiteToSite));
      }
    } else {
      // Regular users get public site data only via secure RPC function
      const { data, error: fetchError } = await supabase
        .rpc('get_public_sites');

      if (fetchError) {
        console.error('Error fetching sites:', fetchError);
        setError(fetchError.message);
        setSites([]);
      } else {
        console.log('[useSites] Public sites fetched:', data?.length);
        setSites((data as PublicSite[]).map(mapPublicSiteToSite));
      }
    }
    setLoading(false);
    setHasFetched(true);
  }, [isAdmin]);

  useEffect(() => {
    // Wait for auth to load before fetching
    if (authLoading) {
      console.log('[useSites] Auth still loading, waiting...');
      return;
    }
    
    // Fetch on first load after auth is ready
    if (!hasFetched) {
      console.log('[useSites] Initial fetch, isAdmin:', isAdmin);
      setLastIsAdmin(isAdmin);
      fetchSites();
      return;
    }
    
    // Refetch if isAdmin status changes
    if (lastIsAdmin !== isAdmin) {
      console.log('[useSites] isAdmin changed from', lastIsAdmin, 'to', isAdmin, ', refetching');
      setLastIsAdmin(isAdmin);
      fetchSites();
    }
  }, [fetchSites, authLoading, isAdmin, lastIsAdmin, hasFetched]);

  // Real-time subscription for wordpress_sites changes
  useEffect(() => {
    if (authLoading) return;

    const channel = supabase
      .channel('wordpress-sites-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'wordpress_sites'
        },
        (payload) => {
          console.log('[useSites] Real-time update:', payload.eventType);
          // Refetch sites when any change occurs
          fetchSites();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [authLoading, fetchSites]);

  const addSite = async (site: Omit<WordPressSite, 'id' | 'connected'>) => {
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(site.url)}&sz=64`;
    
    const { data, error: insertError } = await supabase
      .from('wordpress_sites')
      .insert({
        name: site.name,
        url: site.url,
        username: site.username,
        app_password: site.applicationPassword,
        seo_plugin: site.seoPlugin,
        favicon: faviconUrl,
        connected: true,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error adding site:', insertError);
      throw insertError;
    }

    const newSite = mapDbSiteToSite(data as DbSite);
    setSites(prev => [...prev, newSite]);
    return newSite;
  };

  const updateSite = async (id: string, updates: Partial<WordPressSite>) => {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.url !== undefined) dbUpdates.url = updates.url;
    if (updates.username !== undefined) dbUpdates.username = updates.username;
    if (updates.applicationPassword !== undefined) dbUpdates.app_password = updates.applicationPassword;
    if (updates.seoPlugin !== undefined) dbUpdates.seo_plugin = updates.seoPlugin;
    if (updates.favicon !== undefined) dbUpdates.favicon = updates.favicon;
    if (updates.connected !== undefined) dbUpdates.connected = updates.connected;

    const { error: updateError } = await supabase
      .from('wordpress_sites')
      .update(dbUpdates)
      .eq('id', id);

    if (updateError) {
      console.error('Error updating site:', updateError);
      throw updateError;
    }

    setSites(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const removeSite = async (id: string) => {
    const { error: deleteError } = await supabase
      .from('wordpress_sites')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error removing site:', deleteError);
      throw deleteError;
    }

    setSites(prev => prev.filter(s => s.id !== id));
  };

  return {
    sites,
    loading,
    error,
    addSite,
    updateSite,
    removeSite,
    refetchSites: fetchSites,
  };
}
