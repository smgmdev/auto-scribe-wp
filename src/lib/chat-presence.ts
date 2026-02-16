import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';

// Sound enabled state - shared reference updated by appStore
let _soundEnabled = true;

export const setSoundEnabled = (enabled: boolean) => {
  _soundEnabled = enabled;
};

export const isSoundEnabled = () => _soundEnabled;

// Sound player singleton with dedup to prevent double plays
let audioInstance: HTMLAudioElement | null = null;
let lastPlayedAt = 0;
// Track recently played message keys to prevent exact duplicates
// Key format: "requestId:messageSnippet" to uniquely identify each message
const recentlyPlayedKeys = new Map<string, number>();

export const playMessageSound = (requestId?: string, messageSnippet?: string) => {
  if (!_soundEnabled) return;
  const now = Date.now();
  
  // Build a unique key for this specific message (not just the request)
  // This allows multiple messages to the same request to each play a sound
  const dedupKey = requestId 
    ? `${requestId}:${(messageSnippet || '').substring(0, 30)}` 
    : null;
  
  // Per-message dedup: 1.5s window catches exact duplicate broadcasts
  // (e.g., same broadcast received twice due to network retry)
  if (dedupKey) {
    const lastPlayed = recentlyPlayedKeys.get(dedupKey);
    if (lastPlayed && now - lastPlayed < 1500) {
      console.log('[Sound] Debounced (same message) -', now - lastPlayed, 'ms ago, key:', dedupKey);
      return;
    }
    recentlyPlayedKeys.set(dedupKey, now);
    // Cleanup old entries
    if (recentlyPlayedKeys.size > 50) {
      for (const [key, time] of recentlyPlayedKeys) {
        if (now - time > 5000) recentlyPlayedKeys.delete(key);
      }
    }
  }
  
  // Global debounce: 300ms minimum between any two sounds to prevent overlap
  if (now - lastPlayedAt < 300) {
    console.log('[Sound] Debounced (global) -', now - lastPlayedAt, 'ms ago');
    return;
  }
  
  lastPlayedAt = now;
  console.log('[Sound] Playing message sound, key:', dedupKey);
  try {
    if (!audioInstance) {
      audioInstance = new Audio('/sounds/new-message.mp3?v=2');
      audioInstance.volume = 0.5;
    }
    audioInstance.currentTime = 0;
    audioInstance.play().catch(err => {
      console.log('Could not play sound:', err);
    });
  } catch (error) {
    console.log('Error playing sound:', error);
  }
};

interface PresenceState {
  odditional_key?: string;
  [key: string]: any;
}

// Track presence for a specific chat/request
export class ChatPresenceTracker {
  private channel: RealtimeChannel | null = null;
  private requestId: string;
  private userId: string;
  private userType: 'agency' | 'client' | 'admin';
  private onlineUsers: Set<string> = new Set();
  private onPresenceChange?: (onlineUsers: string[]) => void;
  private agencyPayoutId?: string;

  constructor(
    requestId: string, 
    userId: string, 
    userType: 'agency' | 'client' | 'admin',
    onPresenceChange?: (onlineUsers: string[]) => void,
    agencyPayoutId?: string
  ) {
    this.requestId = requestId;
    this.userId = userId;
    this.userType = userType;
    this.onPresenceChange = onPresenceChange;
    this.agencyPayoutId = agencyPayoutId;
  }

  async join() {
    // Use presence-{requestId} for consistency with admin chat
    const channelName = `presence-${this.requestId}`;
    
    this.channel = supabase.channel(channelName, {
      config: {
        presence: { key: this.userId },
      },
    });

    this.channel
      .on('presence', { event: 'sync' }, () => {
        const state = this.channel?.presenceState() || {};
        this.onlineUsers.clear();
        const now = Date.now();
        Object.entries(state).forEach(([key, presences]: [string, any[]]) => {
          // Only consider users with a recent online_at timestamp (within 2 minutes)
          const isRecent = presences.some((p: any) => {
            if (!p.online_at) return false;
            const onlineAt = new Date(p.online_at).getTime();
            return now - onlineAt < 2 * 60 * 1000; // 2 minutes
          });
          if (isRecent) {
            this.onlineUsers.add(key);
          }
        });
        this.onPresenceChange?.(Array.from(this.onlineUsers));
      })
      .on('presence', { event: 'join' }, ({ key }) => {
        if (key) {
          this.onlineUsers.add(key);
          this.onPresenceChange?.(Array.from(this.onlineUsers));
        }
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        if (key) {
          this.onlineUsers.delete(key);
          this.onPresenceChange?.(Array.from(this.onlineUsers));
        }
      });

    await this.channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        const now = new Date().toISOString();
        
        // Update last_online_at when joining to mark user as active
        if (this.userType === 'client') {
          await supabase
            .from('profiles')
            .update({ last_online_at: now })
            .eq('id', this.userId);
        } else if (this.userType === 'agency' && this.agencyPayoutId) {
          await supabase
            .from('agency_payouts')
            .update({ last_online_at: now })
            .eq('id', this.agencyPayoutId);
        }
        
        await this.channel?.track({
          user_id: this.userId,
          user_type: this.userType,
          online_at: now,
        });
      }
    });

    return this;
  }

  isCounterpartyOnline(): boolean {
    // Check if there's someone else online besides current user
    return this.onlineUsers.size > 1 || 
           (this.onlineUsers.size === 1 && !this.onlineUsers.has(this.userId));
  }

  getOnlineUsers(): string[] {
    return Array.from(this.onlineUsers);
  }

  async leave() {
    const now = new Date().toISOString();
    
    // Update last_online_at in database based on user type
    if (this.userType === 'client') {
      await supabase
        .from('profiles')
        .update({ last_online_at: now })
        .eq('id', this.userId);
    } else if (this.userType === 'agency' && this.agencyPayoutId) {
      await supabase
        .from('agency_payouts')
        .update({ last_online_at: now })
        .eq('id', this.agencyPayoutId);
    }
    
    if (this.channel) {
      await this.channel.untrack();
      await supabase.removeChannel(this.channel);
      this.channel = null;
    }
    this.onlineUsers.clear();
  }
}

// Global presence tracker for active chat
let activePresenceTracker: ChatPresenceTracker | null = null;

export const getActivePresenceTracker = () => activePresenceTracker;

export const setActivePresenceTracker = (tracker: ChatPresenceTracker | null) => {
  activePresenceTracker = tracker;
};
