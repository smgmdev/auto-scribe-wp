import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';

// Sound player singleton
let audioInstance: HTMLAudioElement | null = null;

export const playMessageSound = () => {
  try {
    if (!audioInstance) {
      // Add cache-busting parameter to ensure latest sound file is loaded
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
  private userType: 'agency' | 'client';
  private onlineUsers: Set<string> = new Set();
  private onPresenceChange?: (onlineUsers: string[]) => void;

  constructor(
    requestId: string, 
    userId: string, 
    userType: 'agency' | 'client',
    onPresenceChange?: (onlineUsers: string[]) => void
  ) {
    this.requestId = requestId;
    this.userId = userId;
    this.userType = userType;
    this.onPresenceChange = onPresenceChange;
  }

  async join() {
    const channelName = `chat-presence:${this.requestId}`;
    
    this.channel = supabase.channel(channelName, {
      config: {
        presence: { key: this.userId },
      },
    });

    this.channel
      .on('presence', { event: 'sync' }, () => {
        const state = this.channel?.presenceState() || {};
        this.onlineUsers.clear();
        Object.keys(state).forEach(key => {
          this.onlineUsers.add(key);
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
        await this.channel?.track({
          user_id: this.userId,
          user_type: this.userType,
          online_at: new Date().toISOString(),
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
