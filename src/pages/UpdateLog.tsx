import { useState, useMemo } from 'react';
import { SEOHead } from '@/components/SEOHead';
import { useNavigate } from 'react-router-dom';
import { Search, User, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Footer } from '@/components/layout/Footer';
import { PWAInstallButtons } from '@/components/layout/PWAInstallButtons';
import { useAuth } from '@/hooks/useAuth';
import { SearchModal } from '@/components/search/SearchModal';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import amblack from '@/assets/amblack.png';
import { HeaderLogo } from '@/components/ui/HeaderLogo';

const updates = [
  {
    date: 'March 12, 2026',
    title: 'Trade Intelligence & Globe Enhancements',
    changes: [
      'Added Trade Overview panel to country profiles — view GDP, trade balance, top export/import products, key trading partners, and trade agreements for any country on the surveillance globe',
      'Trade data is AI-generated from publicly available sources including UN Comtrade, World Bank, and OEC datasets',
      'Products and Partners tabs allow toggling between commodity breakdowns and partner country rankings with category-colored badges',
      'Trade Agreements section lists active free trade agreements and economic partnerships',
      'Key Insights section highlights notable trade patterns and economic trends for each country',
      'Arms Trade Data (SIPRI) now stays open during data refresh — previously the popup would close when refreshing arms transfer records',
      'Fixed country label rendering on the 3D surveillance globe — labels are now crisp and sharp at all zoom levels instead of appearing blurry when zooming in or out',
      'Improved label scaling using native font rendering with dynamic camera-distance-based transforms for GPU-accelerated smoothness',
    ],
  },
  {
    date: 'March 10, 2026',
    title: 'Article Editor & Content Display Fixes',
    changes: [
      'Fixed an issue where articles with certain metadata configurations were not appearing in the Articles view after refresh',
      'SEO settings, categories, and tags now load correctly for all connected sites when editing published articles — previously some sites failed to fetch due to unnecessary client-side credential checks',
      'Improved article filtering logic to properly handle articles without source metadata, ensuring all user-created content is always visible',
    ],
  },
  {
    date: 'March 9, 2026',
    title: 'Session Stability & Market Signals Refinements',
    changes: [
      'Added proactive session health monitor — the app now detects silent auth token failures (caused by backgrounded tabs or network interruptions) and automatically recovers or prompts re-login instead of silently breaking',
      'Session recovery on tab focus — returning to the app after extended inactivity now triggers an immediate health check with automatic token refresh',
      'Renamed "Alpha Signals" to "Market Signals" across the Arcana Precision intelligence platform for clearer terminology',
      'Renamed "Geopolitical Alpha" to "Geopolitical Market Data" for consistent naming',
      'Updated Generate Market Signals button styling to match the Generate New Assessment button with consistent colors, font, and hover behavior',
      'Market Signals tab bar now uses the same accent color as the Generate button for visual consistency across the panel',
      'Matched Market Signals panel header height to the Threat Forecast tabs for aligned, uniform panel layouts',
      'Moved the Signal History icon inline with the Market Signals title for a cleaner, more compact header layout',
      'Removed subtitle text from the Market Signals panel header for a streamlined appearance',
      'Removed decorative icon from Signal History title and empty state for a cleaner minimal look',
    ],
  },
  {
    date: 'March 8, 2026',
    title: 'Arcana Precision — Geopolitical Market Data Engine',
    changes: [
      'Launched Geopolitical Market Data (Alpha Signals) panel inside Arcana Precision — AI-powered investment signal generation based on real-time surveillance intelligence',
      'Market Signals analyzes surveillance scans, missile alerts, danger zones, and tension trends to produce specific tradeable asset recommendations with confidence scores and timeframes',
      'Each signal includes asset ticker, direction (long/short/hedge), conviction level, catalyst event, transmission mechanism, risk/reward assessment, and what the market is currently under-pricing',
      'Tail Risks tab surfaces low-probability Black Swan scenarios with estimated probability, market impact, and recommended hedges',
      'Sector Heat Map tab provides a sector-by-sector geopolitical exposure outlook (bullish/neutral/bearish) with key drivers',
      'Signal History allows viewing and managing previously generated signals with timestamps and delete functionality',
      'Added Signal History persistence — generated market signals are saved to the database and can be reviewed later',
    ],
  },
  {
    date: 'March 7, 2026',
    title: 'Arcana Precision — Threat Forecast & Conflict Simulator',
    changes: [
      'Added Threat Forecast panel to Arcana Precision — AI-generated geopolitical risk assessments analyzing hotspot regions, timeline predictions, and escalation drivers',
      'Threat Forecast includes three tabs: Hotspots (regions ranked by risk score with trend indicators), Timeline (predictions with probability and trigger conditions), and Escalation (drivers with severity ratings and de-escalation requirements)',
      'Forecast History allows reviewing past assessments with full data preservation and delete capability',
      'Launched Conflict Simulator — select any two countries to generate a detailed AI-simulated geopolitical conflict analysis covering military balance, economic impact, cyber capabilities, alliance dynamics, and civilian risk',
      'Conflict simulation results include phase-by-phase scenario breakdown with probability scores and key turning points',
      'Nuclear Escalation Ladder visualization added for conflict scenarios involving nuclear-capable nations',
      'Country Risk Profile deep-dive — click any country on the surveillance globe to generate an AI-powered comprehensive risk assessment',
    ],
  },
  {
    date: 'March 6, 2026',
    title: 'Surveillance Globe & Real-Time Threat Monitoring',
    changes: [
      'Enhanced surveillance globe with interactive country markers showing real-time threat levels (safe, caution, danger) based on latest scan data',
      'Missile trajectory visualization on the 3D globe — active missile alerts display animated arc trajectories between origin and destination countries',
      'Country popup on globe click shows threat score, summary, and recent events for any monitored nation',
      'Surveillance camera popup displays detailed country intelligence with event timeline when selecting a country from the globe',
      'Earthquake and satellite tracking overlays added to the surveillance globe for environmental monitoring',
      'Fixed globe rendering performance on lower-end devices with optimized geometry and reduced particle counts',
      'Improved mobile touch interactions on the surveillance globe with smoother rotation and zoom controls',
    ],
  },
  {
    date: 'March 5, 2026',
    title: 'Mace AI Voice — Smarter Publishing & Conversation Flow',
    changes: [
      'Mace AI now publishes articles instantly when a topic and target site are identified — the previous confirmation step ("should I go ahead?") has been removed for a faster voice-to-publish experience',
      'Improved voice site name matching — Mace AI now uses fuzzy matching with normalization and word-overlap detection to accurately resolve spoken site names, even with partial or imprecise pronunciation',
      'Added hallucination safeguard — Mace AI can no longer claim an article was published unless the publishing tool was actually executed, preventing false success messages',
      'Continuous conversation flow — the microphone now automatically re-activates 800ms after Mace finishes speaking, allowing natural back-and-forth without tapping the mic button each time',
      'User interruption support — tap the voice icon while Mace is speaking to interrupt and say something new; the AI receives context that it was interrupted for a smoother conversational experience',
      'Improved reliability on Safari and iOS — microphone capture, audio playback, and AudioContext management have been hardened for consistent behavior across all browsers',
      'Publishing flow now enforces strict timeouts (30s for article generation, 45s for publishing) to prevent the assistant from getting stuck during multi-stage workflows',
      'After a successful publication or failure, the voice assistant returns to an idle "Tap to continue" state for a clean restart',
    ],
  },
  {
    date: 'March 5, 2026',
    title: 'Quick Nav, Alert Sound Fix & Header Loading',
    changes: [
      'Quick Nav expanded panel now opens on mobile dashboard — tapping the QUICK NAV toggle with the dropdown arrow reveals the full mega menu on responsive screens',
      'Added ChevronDown dropdown arrow to the mobile dashboard QUICK NAV bar for visual toggle indication',
      'Fixed header/sub-header desync when opening Quick Nav — all elements now animate in perfect sync at 300ms using unified CSS transition overrides',
      'Removed the gap between the expanded Quick Nav panel and the "Get Credits" banner on the desktop dashboard',
      'Added a dark grey bottom border to the expanded Quick Nav area to visually separate it from page content below',
      'Quick Nav expanded panel can now be closed by pressing the Escape key',
      'Added loading spinner to the Arcana Mace logo across all page headers and the dashboard sidebar — a spinning indicator displays while the logo image loads, then fades in smoothly',
      'Alert popup sounds now stop immediately on the first dismiss — previously, sounds could continue playing after rapidly closing multiple alert popups with Enter or Escape',
    ],
  },
  {
    date: 'March 5, 2026',
    title: 'Quick Nav Mega Menu Redesign',
    changes: [
      'Redesigned the Quick Nav expanded area into a Bloomberg-style mega menu with a multi-column link grid covering Media Buying, For Clients, For Business, and Arcana Mace sections',
      'Added three horizontal info cards below the link grid — Arcana Mace overview with logo, Account management, and Support quick links',
      'Navigation links now feature a blue hover state with a sliding arrow icon for improved interactivity',
      'Media Products keyboard shortcut hint (Ctrl+K / ⌘K) is now visible on mobile devices',
      'Quick Nav dropdown is now accessible on 404 pages, helping users navigate back to valid routes',
      'Expanded area is now scrollable when content exceeds the viewport height, constrained to max-height: calc(100vh - 28px)',
      'Mobile responsive layout updated — link columns display in a single column on small screens, info cards stack vertically above the links',
      'Reduced link spacing for a more compact, scannable layout across all columns',
      '"How It Works" renamed to "How Arcana Mace Works" for brand clarity',
    ],
  },
  {
    date: 'March 3, 2026',
    title: 'Mace AI Telegram Bot — Voice, Chat & Publishing',
    changes: [
      'Mace AI is now available on Telegram — link your account from Account Settings under "Link with Mace AI" to access the full voice and text assistant directly in Telegram',
      'Real-time account linking with instant UI status update — once verification is complete, the "Telegram linked" badge appears automatically without refreshing',
      'Conversational chat mode powered by Perplexity Sonar with infinite session history — ask Mace anything and get web-grounded, contextual answers',
      'Voice message support via ElevenLabs Scribe transcription — speak your prompts naturally and Mace processes them for both casual chat and article generation',
      'Full article publishing workflow from Telegram — provide a topic, select a target site, and Mace researches, writes, and publishes a complete article',
      'AI-powered content review analyzes structure, tone, and quality before publishing — if issues are detected, Mace provides a mandatory edited version with a professional title and human-like narrative hook',
      'Featured image upload support for published articles — send a JPG or PNG image (horizontal recommended) to accompany your article',
      'Strict role alternation enforced in conversation history to maintain reliable multi-turn interactions with the AI backend',
      'Users can unlink the Telegram bot directly from Account Settings, clearing the connection and terminating the bot session',
    ],
  },
  {
    date: 'March 3, 2026',
    title: 'Threat Alert Popups — Source Timestamps & UI Improvements',
    changes: [
      'Alert popups now display the original source publication time instead of the system detection time — giving a more accurate picture of when the threat event actually occurred',
      'Falls back to the detection timestamp if the original source time is unavailable',
      'Origin and destination country names are now bolded in alert popups for quicker readability',
      'Repositioned the "+N more alerts queued" badge to the very bottom of the screen on mobile devices so it no longer overlaps with alert content',
      'Improved alert popup container layout on mobile with proper flex column spacing and bottom-anchored queue indicator',
    ],
  },
  {
    date: 'March 2, 2026',
    title: 'Arcana Precision — Intelligence Platform',
    changes: [
      'Launched Arcana Precision (/arcana-precision) — a dedicated intelligence platform designed for governments, semi-government agencies, and enterprises requiring mission-critical surveillance and analytics capabilities',
      'Arcana Precision landing page features scroll-animated sections showcasing real-time missile surveillance, deep data analytics, global coverage, and security infrastructure',
      'Added Interest in Arcana Precision contact form with full name, email, mobile number, and organization type fields — accessible globally from any page via the app store',
      'Contact form includes slider puzzle CAPTCHA verification to prevent automated bot submissions',
      'Form submissions are stored in the database and trigger an email notification to the business team via Resend',
      'Added Arcana Precision help article to the Help Center covering platform capabilities and contact information',
      'Updated site map page and sitemap.xml with Arcana Precision entries',
      'Arcana Precision now listed under "For Business" in the footer navigation alongside Agency Account and Industries',
    ],
  },
  {
    date: 'March 1, 2026',
    title: 'Password Reset Flow & Page Consistency',
    changes: [
      'Improved password reset flow reliability — clicking the reset link from your email now correctly opens the Set New Password form without session errors',
      'Set New Password page redesigned to match the Auth page layout with consistent header, sub-header, container width, and footer styling',
      'Quick Nav banner is now hidden on the Set New Password page for a cleaner, distraction-free experience matching the sign-in page',
    ],
  },
  {
    date: 'March 1, 2026',
    title: 'Mace AI Landing Page & Publishing Experience',
    changes: [
      'Updated Mace AI landing page hero copy for clarity — "Publish your article to media in under 30 seconds—without touching the keyboard or writing a single word. Just use a voice command."',
      'Updated Mace AI page SEO title to "Mace AI - Publish Articles by Voice Command" with a matching meta description for improved search visibility',
      'Try Now button on the Mace AI landing page now correctly redirects to the Mace AI voice assistant after login or signup',
      'Mace AI identity responses hardcoded for consistency — Mace now responds with verified answers when asked about its creator, platform operator, or underlying AI models',
      'Mace Articles view redesigned with larger square logos, tighter card layout, and a cleaner centered loading spinner replacing the previous skeleton placeholders',
      'Mace Settings category badges now align to the right side of each site row for a cleaner, more scannable layout',
    ],
  },
  {
    date: 'February 28, 2026',
    title: 'Mace AI — Voice-Powered Article Publishing',
    changes: [
      'Introducing Mace AI — a voice-first AI assistant built directly into Arcana Mace that lets you publish articles using natural speech commands in under 30 seconds',
      'Speak a topic and a target site, and Mace AI will research, write, format, and publish a complete article to your chosen Local Media Library site — no keyboard required',
      'Mace AI is powered by advanced language models (Google Gemini 2.5 Flash) delivering fast, context-aware article generation with strong instruction-following capabilities',
      'Real-time web research integration via Perplexity AI ensures articles are grounded in the latest available information, not just static training data',
      'Two-phase publishing architecture: Phase 1 generates the full article content, Phase 2 handles the publication to WordPress — optimized for speed by skipping image and SEO generation steps',
      'Voice input is processed through ElevenLabs Scribe for high-accuracy speech-to-text transcription, supporting natural conversational commands',
      'Intelligent silence detection with a 1.5-second timeout triggers processing only after actual speech is detected, preventing premature or accidental submissions',
      'Speculative prefetch system begins warming up AI connections 500ms before expected input, reducing perceived latency between speaking and response',
      'Comprehensive status indicators guide users through each stage: "Researching topic...", "Writing article...", "Publishing to [site name]...", and "Finalizing..."',
      'Mace AI maintains full conversation context across exchanges, allowing follow-up instructions like "now publish the same topic on another site"',
      'Error resilience: previous error messages are automatically filtered from conversation context to prevent cascading failures in multi-turn interactions',
      '60-second safety timer provides a comprehensive state reset — clearing all refs, timers, and re-warming the voice connection — if the system enters an unexpected state',
      'Published article links are displayed inline after successful publication, styled for quick access with blue highlight and no underline',
      'Dedicated Mace AI landing page (/mace-ai) featuring an Apple-inspired design with scroll-animated sections, 3D orbital ring animation, and a cinematic rotating tagline with electric lightning effects',
      'Voice-command demo section on the landing page showcases the "Hey Mace, publish an article..." interaction with animated red and blue waveform visualizations',
      'Mace AI section now appears directly after Instant Publishing in the sidebar navigation for both regular users and administrators',
      'Updated Mace AI FAQ to reference Local Media Library sites instead of WordPress sites, reflecting the platform\'s unified media terminology',
    ],
  },
  {
    date: 'February 27, 2026',
    title: 'Payment Gateway Migration & Help Center Updates',
    changes: [
      'Migrated credit purchase flow to Stripe — all new credit top-ups are now processed through Stripe Checkout with support for Visa, Mastercard, American Express, Apple Pay, and Google Pay',
      'Updated Help Center articles to reflect new Stripe payment integration, including Credits & Pricing and Getting Started sections',
      'Legacy payment records are preserved in transaction history and labeled accordingly for full audit trail continuity',
      'Compact credit purchase dialog with refined input fields and order summary for a cleaner checkout experience',
    ],
  },
  {
    date: 'February 26, 2026',
    title: 'Real-Time Dashboard & Messaging Reliability',
    changes: [
      'Latest Global Articles section on the account dashboard now updates in real-time — newly published articles appear instantly without requiring a page refresh',
      'Real-time subscription listens for inserts, updates, and deletions on published articles so the dashboard always reflects the current state',
      'Fixed a messaging widget issue where sound notifications were not playing on one side of the conversation — both clients and agencies now reliably hear incoming message alerts',
      'Resolved an asymmetric notification bug caused by incorrect identity matching when an agency user received messages from another party',
      'Standardized notification trigger logic across broadcast and database insert handlers to ensure consistent behavior regardless of how the message is delivered',
      'Improved fallback notification logic so sound alerts still fire during the brief window after a session refresh when local chat lists have not fully loaded yet',
    ],
  },
  {
    date: 'February 25, 2026',
    title: 'Messaging Widget Stability & Session Recovery',
    changes: [
      'Fixed a critical issue where the messaging widget would become stuck and stop showing new messages after a session refresh or reconnection',
      'Resolved a stale-closure bug in the chat list panel that caused background data fetches to use an outdated agency ID, resulting in empty responses and a frozen widget',
      'Agency identity is now tracked via a ref-backed value so real-time event handlers and heartbeat timers always use the latest session data',
      'Improved self-healing heartbeat mechanism to correctly recover the messaging widget when real-time channels temporarily disconnect',
      'Enhanced window focus and visibility change handlers to immediately re-sync the message list when returning to the app after being in the background',
      'Sound notification fallback now correctly triggers for incoming messages even when the local engagement and service request lists have not finished loading',
    ],
  },
  {
    date: 'February 24, 2026',
    title: 'Media Buying Page & Layout Refinements',
    changes: [
      'Increased the number of publication logos displayed in the Media Buying page network grid — now showing 49 logos on desktop (7×7) and 40 logos on mobile (4×10) for better coverage of available publications',
      'Full-width separator lines now consistently appear above the PWA download buttons on the AI Article Generation, Self Publishing, and Changelog pages for a cleaner visual break',
      'Improved visual consistency of the download/install button row across all public-facing pages',
    ],
  },
  {
    date: 'February 23, 2026',
    title: 'Explore Network Grid & Help Center Updates',
    changes: [
      'Added real-time synchronization to the Explore Network publication grid on the landing page — new media sites, updates, and removals now appear instantly without page refresh',
      'The Explore Network grid now listens for INSERT, UPDATE, and DELETE events on media sites for a live, always-current display of available publications',
      'Added a new Media Buying help article to the Help Center covering how media buying works, available publications, service requests & briefs, delivery times, quality guarantees, and order management',
      'Help Center Media Buying article includes detailed guidance on express, standard, and extended delivery timeframes with tips on communicating with agencies about timelines',
      'Added separator line above the download buttons row on the Self Publishing page matching the AI Article Generation page layout',
      'Improved page layout consistency across all public-facing product pages with unified section spacing and divider styling',
    ],
  },
  {
    date: 'February 22, 2026',
    title: 'PWA Buttons Alignment & Page Layout Consistency',
    changes: [
      'Fixed PWA download/install buttons alignment on the About, How It Works, Self Publishing, Media Buying, AI Article Generation, and Help Center pages — buttons now consistently align to the left matching the landing page layout',
      'Added explicit left-alignment overrides to the PWAInstallButtons component to prevent parent flex containers from centering the buttons',
      'Wrapped PWA button container in a full-width wrapper to isolate it from inherited text-center and flex-center styles on certain pages',
    ],
  },
  {
    date: 'February 21, 2026',
    title: 'Chat Window Enhancements & Popup Improvements',
    changes: [
      'Improved floating chat window drag behavior with smoother repositioning and boundary constraints',
      'Chat windows now remember their position within the viewport after minimizing and restoring',
      'Fixed an issue where dragging a chat window near the screen edge could cause it to become unreachable',
      'Updated popup stack z-index management to correctly layer multiple open chat windows and dialogs',
      'Improved chat message rendering performance for threads with hundreds of messages',
    ],
  },
  {
    date: 'February 20, 2026',
    title: 'Credit Display & Wallet Tooltip Refinements',
    changes: [
      'Redesigned the credit balance display in the sidebar with a cleaner layout showing available vs locked credits',
      'Updated wallet tooltip to display a detailed breakdown of credit balance, pending withdrawals, and locked order credits',
      'Added available credits tooltip content showing usable balance after subtracting all locks and holds',
      'Improved credit calculation logic to correctly exclude withdrawal_locked and withdrawal_completed transactions from the available balance',
      'Credit display now updates in real-time when transactions are added or modified',
    ],
  },
  {
    date: 'February 19, 2026',
    title: 'Session Security & Login Flow Hardening',
    changes: [
      'Improved active session detection to automatically clear stale sessions older than 35 minutes without recent activity',
      'Added cross-check against auth sessions to detect and clear orphaned profile sessions from environment rebuilds or technical logouts',
      'Session expiry warning dialog now shows remaining time and allows users to extend their session before automatic logout',
      'Login attempt capture now records IP address for security monitoring and suspicious activity detection',
      'Fixed edge case where concurrent logins from different tabs could create conflicting session states',
    ],
  },
  {
    date: 'February 18, 2026',
    title: 'Agency Media Submissions & Site Management',
    changes: [
      'Improved media site submission flow for agencies with clearer form validation and error messaging',
      'Added WordPress site submission status tracking with pending, approved, and rejected states visible to the submitting agency',
      'Agencies can now mark rejected submissions as read to dismiss notification badges',
      'Updated site management view with improved loading states and empty state messaging',
      'Added favicon auto-detection for newly connected WordPress sites during the submission review process',
      'Improved Google Sheets URL validation in the media site bulk submission form',
    ],
  },
  {
    date: 'February 17, 2026',
    title: 'Support Icon & Footer Safe Area',
    changes: [
      'Updated the Support menu icon in the sidebar to a new MessageCircleQuestion design for better clarity',
      'Added safe area inset padding to the global footer for proper spacing on devices with home indicators and notches',
      'Updated viewport meta tag with viewport-fit=cover to support full-screen rendering on modern mobile devices',
      'Footer bottom padding now dynamically adjusts using env(safe-area-inset-bottom) for consistent spacing across all devices',
    ],
  },
  {
    date: 'February 16, 2026',
    title: 'Chat System & Real-Time Messaging Improvements',
    changes: [
      'Redesigned floating chat windows with improved message bubbles and timestamp display',
      'Added unread message count badges on minimized chat windows with real-time updates',
      'Chat messages now auto-scroll to the latest message when new messages arrive',
      'Improved chat presence detection showing when agencies or clients were last online',
      'Added sound notification toggle for incoming chat messages with persistent user preference',
      'Fixed chat window z-index layering issues when multiple chats are open simultaneously',
      'Improved message input area with auto-resize textarea that grows with content',
      'Added typing indicator animation while composing messages',
    ],
  },
  {
    date: 'February 15, 2026',
    title: 'About Page, Popups & Slider Enhancements',
    changes: [
      'Redesigned the About page "Choose how you top up" section with updated copy covering card payments and offline invoice options',
      'Updated the "Global coverage. Local access." section with a dynamic video background for a more immersive visual experience',
      'Added new background image to the "Control your distribution" section on the About page',
      'Agency Details popup is now fully draggable on desktop with a grip handle, matching the behavior of other popups in the platform',
      'Agency Details popup transitions to fullscreen on mobile devices with proper scroll locking and touch-friendly layout',
      'Added spinning loader indicator on the AI Article Generation slider while featured images are loading',
      'Images in the slider now fade in smoothly once loaded instead of appearing abruptly',
      'Improved popup stack management to prevent overlapping dialogs and ensure proper focus trapping',
    ],
  },
  {
    date: 'February 14, 2026',
    title: 'Client Requests & Footer Improvements',
    changes: [
      'Redesigned Refresh button in Client Requests with black background, white text, and transparent hover state',
      'Updated search input field with black background, white text, and translucent placeholder styling',
      'Enabled real-time search filtering by media site name across Active Orders, Open Disputes, Completed, and Cancelled tabs',
      'Search results update instantly as you type with case-insensitive matching',
      'Aligned global footer links to the left under the copyright text on tablet-sized viewports',
      'Footer links now stack vertically on mobile and tablet, switching to horizontal layout only on desktop',
      'Added "Changelog" link to the footer navigation across all pages',
      'Improved footer link spacing and wrapping behavior on screens between 768px and 1024px',
    ],
  },
  {
    date: 'February 13, 2026',
    title: 'Dashboard Dark Theme & Visual Overhaul',
    changes: [
      'Redesigned the entire dashboard with a dark theme for improved readability and reduced eye strain',
      'Updated stat cards, buttons, navigation, and article sections with a cohesive new color scheme',
      'Added orange (#f2a547) accent color for interactive elements, active states, and call-to-action buttons',
      'Improved contrast ratios across all dashboard components for better accessibility',
      'Refined sidebar navigation styling to match the new dark aesthetic',
      'Updated credit display and transaction history with new visual hierarchy',
      'Redesigned the compose view editor toolbar with dark theme consistent styling',
      'Updated all dialog backgrounds and borders to match the new dark color palette',
    ],
  },
  {
    date: 'February 12, 2026',
    title: 'Changelog & Footer Updates',
    changes: [
      'Added Changelog page accessible from the footer on all pages',
      'Changelog entries displayed in an expandable accordion layout with smooth open/close animations',
      'Redesigned footer link layout with improved wrapping on mobile devices',
      'Updated footer navigation order across landing and dashboard views',
    ],
  },
  {
    date: 'February 11, 2026',
    title: 'Global Library Refinements',
    changes: [
      'Removed duplicate border lines under subcategory navigation tabs',
      'Improved media site card hover states with smoother transitions',
      'Fixed favicon display issues for certain agency-managed sites',
      'Added logo hover overlay on media site cards in the network view',
      'Improved site card loading skeleton with pulsing animation for better perceived performance',
      'Fixed media site price display rounding inconsistencies in the library grid',
      'Added "No results" empty state message when category filters return zero matches',
    ],
  },
  {
    date: 'February 10, 2026',
    title: 'Search & Navigation Improvements',
    changes: [
      'Unified search modal across all pages with consistent behavior and styling',
      'Improved category and subcategory navigation in the Global Media Library',
      'Added horizontal scroll support for mobile category tabs with smooth touch gestures',
      'Introduced keyboard shortcuts for quick search access (Cmd/Ctrl + K)',
      'Enhanced search results with site favicons, pricing, and publishing time indicators',
      'Fixed search not clearing properly when navigating between pages',
      'Search modal now closes automatically when a result is selected',
      'Added recent search history that persists across sessions',
    ],
  },
  {
    date: 'February 9, 2026',
    title: 'Order Flow & Credit Locking',
    changes: [
      'Implemented credit locking when placing an order to prevent double-spending',
      'Added automatic credit release when orders are cancelled or rejected',
      'Improved order status notifications with real-time updates',
      'Fixed edge case where credits were deducted but order creation failed',
      'Added order number generation with unique identifiers for tracking',
      'Improved order confirmation dialog with detailed cost breakdown showing platform fees',
      'Credits are now validated server-side before order creation to prevent race conditions',
    ],
  },
  {
    date: 'February 8, 2026',
    title: 'Mobile Responsiveness Pass',
    changes: [
      'Optimized all dashboard views for mobile with zero-spacing compact layouts',
      'Fixed dialog scrolling issues on small screens with max-height 90vh',
      'Improved button sizing and touch targets for mobile users',
      'Adjusted sidebar collapse behavior for tablet-sized screens',
      'Fixed horizontal overflow issues on the compose view editor on narrow screens',
      'Improved table layouts in order history to scroll horizontally on small devices',
      'Added pull-to-refresh gesture support on mobile dashboard views',
      'Fixed bottom navigation overlapping content on devices with gesture navigation bars',
    ],
  },
  {
    date: 'February 7, 2026',
    title: 'Credit Purchase & Payment Flow',
    changes: [
      'Added Stripe payment integration for credit purchases',
      'Implemented credit pack selection with visual comparison of pack sizes and savings',
      'Added payment success page with animated confirmation and credit balance update',
      'Payment cancellation page now includes a retry button to return to the checkout flow',
      'Added USDT cryptocurrency payment option for credit purchases',
      'Improved checkout session error handling with user-friendly retry messages',
      'Credit balance updates in real-time across all views after successful purchase',
    ],
  },
  {
    date: 'February 6, 2026',
    title: 'Press & Newsroom Section',
    changes: [
      'Launched public Newsroom page with press releases and company announcements',
      'Added press release detail pages with rich text content and media contacts',
      'Implemented category filtering for press releases',
      'Press release cards display publication date, category badge, and preview image',
      'Added share functionality on press release detail pages',
      'Newsroom page accessible from the main navigation and footer links',
    ],
  },
  {
    date: 'February 5, 2026',
    title: 'Agency Onboarding & Verification',
    changes: [
      'Enhanced agency verification workflow with multi-step document review',
      'Improved payout tracking and withdrawal process with real-time status updates',
      'Added agency summary dashboard with key metrics including total earnings, pending payouts, and active orders',
      'Introduced custom verification form for agencies requiring bank or crypto payout methods',
      'Added agency downgrade notifications with detailed reason explanations',
      'Improved media site submission flow with Google Sheets integration for bulk uploads',
      'Agency profile now displays country flag, media niches, and website link',
      'Added withdrawal request form with bank transfer and USDT payout options',
    ],
  },
  {
    date: 'February 4, 2026',
    title: 'WordPress Integration Improvements',
    changes: [
      'Added WordPress site submission form for agencies to connect their blogs',
      'Implemented automatic favicon fetching for connected WordPress sites',
      'Added SEO plugin detection (All in One SEO, RankMath) during site connection',
      'Improved app password validation and connection testing with detailed error messages',
      'Added category and tag syncing from WordPress to the platform',
      'WordPress publish retry logic with exponential backoff for handling 503/502/504 errors',
      'Featured image upload to WordPress media library with automatic attachment to posts',
      'SEO metadata (focus keyword, meta description) automatically applied during publishing based on detected plugin',
    ],
  },
  {
    date: 'February 3, 2026',
    title: 'Credit System & Payments',
    changes: [
      'Added multiple credit pack options with tiered pricing',
      'Implemented Stripe Checkout for secure credit purchases',
      'Added payment success and cancellation pages with proper redirect handling',
      'Introduced credit transaction history with detailed descriptions and timestamps',
      'Credit balance displayed in the sidebar with real-time updates',
      'Transaction history shows purchase, deduction, refund, and bonus credit types',
      'Added credit cost indicators on media site cards in the Global Library',
    ],
  },
  {
    date: 'February 2, 2026',
    title: 'Help Center Launch',
    changes: [
      'Published comprehensive Help Center with nine topic categories',
      'Added articles covering Getting Started, Publishing, Media Buying, AI Generation, and more',
      'Implemented breadcrumb navigation for help article pages',
      'Added quick links from dashboard to relevant help topics',
      'Help articles include step-by-step guides with visual callouts',
      'Added "For Agencies" help section with onboarding and payout documentation',
      'Help Center search filters articles by title and content keywords',
    ],
  },
  {
    date: 'February 1, 2026',
    title: 'Bug Report System',
    changes: [
      'Added Bug Report page accessible from the footer with a video background hero section',
      'Implemented categorized bug reporting form with subject, description, and steps to reproduce',
      'File attachment support for screenshots and screen recordings up to 10MB',
      'Introduced status tracking for reported bugs (Open, In Progress, Resolved)',
      'Bug report form validates required fields before submission',
      'Confirmation toast notification displayed after successful bug report submission',
    ],
  },
  {
    date: 'January 31, 2026',
    title: 'Account Security & PIN System',
    changes: [
      'Added optional PIN-based security for sensitive account actions',
      'Implemented PIN verification dialog for withdrawals and account changes',
      'Added login attempt tracking with IP-based monitoring for suspicious activity',
      'Introduced email verification flow with token-based confirmation',
      'PIN setup and management available in Account Settings with enable/disable toggle',
      'Session expiry warning dialog with countdown timer and option to extend session',
    ],
  },
  {
    date: 'January 30, 2026',
    title: 'Dispute Resolution System',
    changes: [
      'Added dispute creation flow for completed orders with reason selection',
      'Added resolution workflow with outcome tracking and detailed notes',
      'Introduced automatic credit refund on dispute resolution in client favor',
      'Dispute status visible in the order details view with timeline indicators',
      'Dispute notifications appear in the client requests section with unread badges',
    ],
  },
  {
    date: 'January 29, 2026',
    title: 'Delivery & Completion Flow',
    changes: [
      'Added delivery URL and notes submission for agencies completing orders',
      'Implemented delivery deadline tracking with countdown indicators',
      'Added automatic order completion after delivery confirmation',
      'Introduced delivery status badges across order management views',
      'Delivery URL opens in an in-app web viewer with refresh, new tab, and download options',
      'Delivery notes support multi-line text with formatting preserved',
    ],
  },
  {
    date: 'January 28, 2026',
    title: 'AI Article Generation',
    changes: [
      'Introduced AI-powered article generation from curated headline sources',
      'Added tone selection (Neutral, Professional, Journalist, Inspiring, Aggressive, Powerful, Important) with customization options',
      'Integrated automatic publishing to connected WordPress sites with SEO metadata',
      'Added featured image fetching and automatic media upload to WordPress',
      'Added auto-publish scheduling with configurable intervals per source',
      'Implemented tag generation and category mapping for published articles',
      'AI-generated articles include focus keyword and meta description for SEO optimization',
      'Source headline linking allows tracing generated content back to original news',
      'Article preview with word count indicator before publishing',
    ],
  },
  {
    date: 'January 27, 2026',
    title: 'Service Request System',
    changes: [
      'Built service request submission form with media site selection and description',
      'Added request lifecycle management (Pending, Accepted, In Progress, Completed, Cancelled)',
      'Implemented agency-side request inbox with unread indicators and real-time updates',
      'Added special terms and requirements field for custom order instructions',
      'Service request cards display media site favicon, name, price, and current status',
      'Real-time chat thread attached to each service request for client-agency communication',
      'Request cancellation with reason field and automatic credit release',
    ],
  },
  {
    date: 'January 26, 2026',
    title: 'Media Buying Marketplace',
    changes: [
      'Launched Global Media Library with categorized media outlets across Business, Crypto, Tech, Campaign, Politics, MENA, and China',
      'Added site detail dialogs with pricing, publishing time, word limits, image limits, and format information',
      'Implemented subcategory filtering with tab-based navigation and active state indicators',
      'Added Google Index status and publication format indicators for each site',
      'Media site cards display favicon, agency name, price, and category at a glance',
      'Site tags with color-coded labels for quick identification of site features',
      'Added "About" section on site detail dialogs with editorial guidelines and requirements',
    ],
  },
  {
    date: 'January 25, 2026',
    title: 'Self-Publishing Features',
    changes: [
      'Added rich text article editor with TipTap integration supporting headings, bold, italic, lists, and links',
      'Implemented article drafts with auto-save functionality to prevent content loss',
      'Added WordPress publishing with category, tag, and featured image support',
      'Introduced article management view with status filtering (Draft, Published) and search',
      'Text alignment options (left, center, right, justify) in the editor toolbar',
      'Featured image upload with title, caption, alt text, and description fields for SEO',
      'Article editor supports paste from clipboard with formatting preservation',
    ],
  },
  {
    date: 'January 24, 2026',
    title: 'Chat & Communication System',
    changes: [
      'Launched real-time chat system for service request communication between clients and agencies',
      'Added new message sound notifications with browser notification support',
      'Introduced chat message security scanning for contact information detection',
      'Added chat presence indicators showing online/offline status',
      'Minimized chat windows persist across page navigation with unread count badges',
      'Chat windows support drag-to-reposition on desktop for flexible workspace layout',
      'Message timestamps display relative time (e.g., "2 minutes ago") with full date on hover',
      'Chat input supports multi-line messages with Shift+Enter for line breaks',
    ],
  },
  {
    date: 'January 22, 2026',
    title: 'Agency Onboarding Flow',
    changes: [
      'Built agency application form with document upload and business verification',
      'Added multi-niche selection for agency media specializations',
      'Added automated welcome and status notification emails for agencies',
      'Introduced agency profile with logo, description, and country display',
      'Agency application requires incorporation document upload for verification',
      'WhatsApp phone number field with country code validation for agency communication',
      'Application status tracking with visual progress indicators',
    ],
  },
  {
    date: 'January 21, 2026',
    title: 'Authentication & User Accounts',
    changes: [
      'Implemented email/password authentication with secure session management',
      'Added email verification requirement before account activation',
      'Built user profile system with username and WhatsApp contact fields',
      'Added protected routes with automatic redirect to login for unauthenticated users',
      'Session persistence across browser tabs with automatic token refresh',
      'Password strength requirements enforced during signup',
      'Login form with error messaging for invalid credentials and unverified accounts',
    ],
  },
  {
    date: 'January 20, 2026',
    title: 'Platform Launch',
    changes: [
      'Initial release of the Arcana Mace platform',
      'Landing page with product overview, feature highlights, and call-to-action sections',
      'Informational pages: How It Works, Self-Publishing, Media Buying, AI Article Generation',
      'Legal pages: Terms of Service, Privacy Policy, Do Not Sell, User Guidelines',
      'Responsive design with mobile-first approach across all pages',
      'System Status page for monitoring platform health',
      'Site Map for comprehensive navigation overview',
      'Dark-themed design language with consistent typography and spacing across all public pages',
      'Animated hero sections with video backgrounds on key landing pages',
    ],
  },
];

export default function UpdateLog() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredUpdates = useMemo(() => {
    if (!searchQuery.trim()) return updates;
    const q = searchQuery.toLowerCase();
    return updates.filter(update =>
      update.title.toLowerCase().includes(q) ||
      update.date.toLowerCase().includes(q) ||
      update.changes.some(c => c.toLowerCase().includes(q))
    );
  }, [searchQuery]);

  return (
    <>
    <SEOHead title="Changelog" description="Stay up to date with the latest features, improvements, and fixes on Arcana Mace." />
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="fixed top-[28px] left-0 right-0 z-50 w-full bg-black/90 backdrop-blur-sm border-b border-white/10">
        <div className="max-w-[980px] mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
            <HeaderLogo src={amblack} invert />
            <span className="text-lg font-semibold text-white">Arcana Mace</span>
          </div>
          
          {/* Search Trigger - Desktop */}
          <div className="hidden md:flex flex-1 max-w-xl mx-8">
            <button
              onClick={() => setShowSearchModal(true)}
              className="w-full flex items-center gap-3 px-4 py-2 rounded-none bg-white/10 border border-white/20 text-white/60 hover:bg-white/15 transition-colors text-left"
            >
              <Search className="h-4 w-4" />
              <span>Search media outlets...</span>
            </button>
          </div>
          
          {/* Right side buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden hover:bg-white/10 text-white hover:text-white"
              onClick={() => setShowSearchModal(true)}
            >
              <Search className="h-5 w-5" />
            </Button>
            
            {user ? (
              <Button 
                onClick={() => navigate('/account')}
                className="rounded-none bg-white text-black hover:bg-transparent hover:text-white transition-all duration-200 border border-transparent hover:border-white"
              >
                <User className="h-4 w-4" />
                Account
              </Button>
            ) : (
              <Button 
                onClick={() => navigate('/auth')}
                className="rounded-none bg-white text-black hover:bg-transparent hover:text-white border border-white transition-all duration-300"
              >
                Sign In
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Search Modal */}
      <SearchModal open={showSearchModal} onOpenChange={setShowSearchModal} />

      {/* Content */}
      <main className="max-w-[980px] mx-auto px-4 md:px-6 py-12 pt-[140px]">
        {/* Title Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-semibold text-white mb-4">
            Changelog
          </h1>
          <p className="text-white/50 border-b border-white/10 pb-8">
            Last update: March 9, 2026
          </p>
        </div>

        {/* Introduction */}
        <div className="mb-0">
          <p className="text-white/50 leading-relaxed mb-4">
            A chronological list of platform updates, improvements, and new features shipped to Arcana Mace.
          </p>
          <p className="text-white/50 leading-relaxed">
            We regularly release updates to improve performance, introduce new capabilities, and refine the user experience across publishing, media buying, and agency management. Each entry below details the changes included in that release.
          </p>
          <div className="mt-6">
            <input
              type="text"
              placeholder="Search updates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 text-sm rounded-none bg-black border border-white/20 text-white placeholder:text-white/40 focus:outline-none focus:border-white/50 transition-colors"
            />
          </div>
        </div>

        {/* Updates as Accordion */}
        <Accordion type="multiple" className="w-full">
          {filteredUpdates.map((update, i) => (
            <AccordionItem key={i} value={`item-${i}`} className="border-t border-white/10">
              <AccordionTrigger className="text-lg md:text-xl font-semibold text-white hover:no-underline py-3 group [&>svg]:hidden text-left w-full hover:text-[#06c] data-[state=open]:text-[#06c] transition-colors">
                <span className="flex items-center justify-between w-full gap-3 text-left">
                  <span className="text-left">
                    {update.title}
                    <span className="block text-sm font-normal text-white/40 mt-1">{update.date}</span>
                  </span>
                  <Plus className="h-5 w-5 flex-shrink-0 text-white/40 transition-all duration-300 group-hover:text-[#06c] group-data-[state=open]:rotate-45 group-data-[state=open]:text-[#06c]" />
                </span>
              </AccordionTrigger>
              <AccordionContent className="text-white/50 leading-relaxed pb-6">
                <ul className="list-none space-y-3">
                  {update.changes.map((change, j) => (
                    <li key={j} className="flex items-start gap-2">
                      <span className="mt-2 h-1.5 w-1.5 rounded-full bg-white/30 flex-shrink-0" />
                      {change}
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </main>

      <div className="border-t border-[#424245]" />
      <div className="bg-black">
        <PWAInstallButtons />
      </div>
      <Footer narrow dark />
    </div>
    </>
  );
}
