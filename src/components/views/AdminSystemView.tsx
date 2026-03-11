import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { calculateTotalBalance, calculateWithdrawals, calculateAvailableCredits } from '@/lib/credit-calculations';
import { Terminal } from 'lucide-react';

// --- Types ---
interface UserRecord {
  id: string;
  email: string | null;
  username: string | null;
  email_verified: boolean;
  suspended: boolean;
  created_at: string;
  last_online_at: string | null;
  role: string;
  credits: number;
  orders: OrderRecord[];
  transactions: TransactionRecord[];
}

interface OrderRecord {
  id: string;
  order_number: string | null;
  status: string;
  amount_cents: number;
  created_at: string;
  media_site_name?: string;
}

interface TransactionRecord {
  id: string;
  amount: number;
  type: string;
  description: string | null;
  created_at: string;
}

interface TerminalLine {
  id: number;
  type: 'input' | 'output' | 'error' | 'info' | 'table' | 'html-preview';
  content: string;
  data?: UserRecord[];
  timestamp: string;
}

let lineId = Date.now();

type TerminalMode =
  | 'default'
  | 'marketing'
  | 'marketing-categories'
  | 'marketing-list'
  | 'marketing-import-category'
  | 'marketing-import'
  | 'marketing-import-sheet'
  | 'marketing-import-single'
  | 'send-menu'
  | 'send-confirm-test'
  | 'send-confirm-bulk'
  | 'generate-prompt'
  | 'generate-subject'
  | 'generate-preview'
  | 'generate-edit'
  | 'campaign-menu'
  | 'campaign-result'
  | 'continue-campaign';

export function AdminSystemView() {
  const now = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const [lines, setLines] = useState<TerminalLine[]>([
    { id: lineId++, type: 'info', content: 'System Terminal v1.0', timestamp: now() },
    { id: lineId++, type: 'info', content: '', timestamp: now() },
  ]);
  const [input, setInput] = useState('');
  const [processing, setProcessing] = useState(false);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [expandedTransactions, setExpandedTransactions] = useState<Set<string>>(new Set());
  const [terminalMode, setTerminalMode] = useState<TerminalMode>('default');
  const [marketingCategory, setMarketingCategory] = useState<string>('marketing_people');

  // Email compose state
  const [emailSubject, setEmailSubject] = useState('');
  const [emailHtml, setEmailHtml] = useState('');
  const [marketingListOffset, setMarketingListOffset] = useState(-1);
  const [emailPrompt, setEmailPrompt] = useState('');
  const [bulkTarget, setBulkTarget] = useState<'marketing_people' | 'agencies' | ''>('');

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeCampaignIdRef = useRef<string | null>(null);
  const pausedRef = useRef(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const setPauseState = async (paused: boolean) => {
    pausedRef.current = paused;
    setIsPaused(paused);
    // Persist to DB so other tabs/sessions see it
    await supabase
      .from('marketing_send_control' as any)
      .update({ paused, paused_at: paused ? new Date().toISOString() : null, updated_at: new Date().toISOString() } as any)
      .eq('id', 'global');
  };

  const togglePause = async () => {
    const newState = !pausedRef.current;
    await setPauseState(newState);
    if (newState) {
      addLine('info', '⏸️  Sending paused by admin. Press Resume to continue.');
    } else {
      addLine('info', '▶️  Sending resumed.');
    }
  };

  const checkDbPaused = async (): Promise<boolean> => {
    const { data } = await supabase
      .from('marketing_send_control' as any)
      .select('paused')
      .eq('id', 'global')
      .single();
    return !!(data as any)?.paused;
  };

  const waitWhilePaused = async () => {
    // Check DB state, not just local ref
    let dbPaused = await checkDbPaused();
    if (dbPaused) {
      pausedRef.current = true;
      setIsPaused(true);
    }
    while (dbPaused || pausedRef.current) {
      await new Promise(r => setTimeout(r, 2000));
      dbPaused = await checkDbPaused();
      if (!dbPaused && !pausedRef.current) break;
      if (!dbPaused) {
        pausedRef.current = false;
        setIsPaused(false);
        break;
      }
    }
  };

  const scrollToBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [lines, scrollToBottom]);

  const addLine = (type: TerminalLine['type'], content: string, data?: UserRecord[]) => {
    setLines(prev => [...prev, { id: lineId++, type, content, data, timestamp: now() }]);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fetchAllRows = async (table: string, selectStr: string, orderCol?: string, filterFn?: (q: any) => any): Promise<any[]> => {
    const pageSize = 1000;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allData: any[] = [];
    let from = 0;
    let hasMore = true;
    while (hasMore) {
      // @ts-ignore - dynamic table access
      let query = supabase.from(table).select(selectStr).range(from, from + pageSize - 1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (orderCol) query = (query as any).order(orderCol, { ascending: false });
      if (filterFn) query = filterFn(query);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (query as any);
      if (error) throw error;
      allData.push(...(data || []));
      hasMore = (data?.length || 0) === pageSize;
      from += pageSize;
    }
    return allData;
  };

  // --- /db command ---
  const fetchUsers = async () => {
    addLine('info', 'Fetching user database...');
    setProcessing(true);

    try {
      const profiles = await fetchAllRows('profiles', '*', 'created_at');
      addLine('info', `Loaded ${profiles.length} profiles, fetching related data...`);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [roles, credits, orders, transactions, activeOrders, pendingRequests, serviceMessages] = await Promise.all([
        fetchAllRows('user_roles', 'user_id, role'),
        fetchAllRows('user_credits', 'user_id, credits'),
        fetchAllRows('orders', 'id, user_id, order_number, status, amount_cents, created_at, media_site_id', 'created_at'),
        fetchAllRows('credit_transactions', 'id, user_id, amount, type, description, created_at', 'created_at'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fetchAllRows('orders', 'user_id, media_site_id, media_sites(price)', undefined, (q: any) => q.in('status', ['pending_payment', 'paid', 'accepted'])),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fetchAllRows('service_requests', 'id, user_id, media_site_id, media_sites(price)', undefined, (q: any) => q.in('status', ['pending', 'active'])),
        fetchAllRows('service_messages', 'request_id, message'),
      ]);

      const requestsWithOrderMsg = new Set<string>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      serviceMessages.forEach((m: any) => {
        if (m.message === 'CLIENT_ORDER_REQUEST') requestsWithOrderMsg.add(m.request_id);
      });

      const lockedFromOrdersMap = new Map<string, number>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      activeOrders.forEach((o: any) => {
        const price = o.media_sites?.price || 0;
        lockedFromOrdersMap.set(o.user_id, (lockedFromOrdersMap.get(o.user_id) || 0) + price);
      });

      const lockedFromRequestsMap = new Map<string, number>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pendingRequests.forEach((r: any) => {
        if (requestsWithOrderMsg.has(r.id)) {
          const price = r.media_sites?.price || 0;
          lockedFromRequestsMap.set(r.user_id, (lockedFromRequestsMap.get(r.user_id) || 0) + price);
        }
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mediaSiteIds = [...new Set(orders.map((o: any) => o.media_site_id))];
      let mediaSiteMap: Record<string, string> = {};
      if (mediaSiteIds.length > 0) {
        const { data: sites } = await supabase.from('media_sites').select('id, name').in('id', mediaSiteIds);
        if (sites) mediaSiteMap = Object.fromEntries(sites.map(s => [s.id, s.name]));
      }

      const rolesMap = new Map<string, string>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      roles.forEach((r: any) => rolesMap.set(r.user_id, r.role));

      const ordersMap = new Map<string, OrderRecord[]>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      orders.forEach((o: any) => {
        const list = ordersMap.get(o.user_id) || [];
        list.push({ id: o.id, order_number: o.order_number, status: o.status, amount_cents: o.amount_cents, created_at: o.created_at, media_site_name: mediaSiteMap[o.media_site_id] || 'Unknown' });
        ordersMap.set(o.user_id, list);
      });

      const txMap = new Map<string, TransactionRecord[]>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      transactions.forEach((t: any) => {
        const list = txMap.get(t.user_id) || [];
        list.push({ id: t.id, amount: t.amount, type: t.type, description: t.description, created_at: t.created_at });
        txMap.set(t.user_id, list);
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const userRecords: UserRecord[] = profiles.map((p: any) => {
        const userTxs = txMap.get(p.id) || [];
        const totalBalance = calculateTotalBalance(userTxs);
        const withdrawalInfo = calculateWithdrawals(userTxs);
        const creditsWithdrawn = withdrawalInfo.completed;
        const creditsInWithdrawals = withdrawalInfo.locked;
        const lockedFromOrders = lockedFromOrdersMap.get(p.id) || 0;
        const lockedFromRequests = lockedFromRequestsMap.get(p.id) || 0;
        const available = calculateAvailableCredits(totalBalance, lockedFromOrders, lockedFromRequests, creditsInWithdrawals, creditsWithdrawn);

        return {
          id: p.id, email: p.email, username: p.username, email_verified: p.email_verified,
          suspended: p.suspended, created_at: p.created_at, last_online_at: p.last_online_at,
          role: rolesMap.get(p.id) || 'user', credits: available,
          orders: ordersMap.get(p.id) || [], transactions: userTxs,
        };
      });

      addLine('output', `✓ Fetched ${userRecords.length} users from database`);
      addLine('table', '', userRecords);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      addLine('error', `✗ Error: ${error.message}`);
    } finally {
      setProcessing(false);
    }
  };

  // --- Marketing menu ---
  const showMarketingMenu = () => {
    setTerminalMode('marketing');
    addLine('info', '');
    addLine('info', '═══════════════════════════════════════');
    addLine('info', '  EMAIL MARKETING – stankevicius.co.uk');
    addLine('info', '═══════════════════════════════════════');
    addLine('info', '');

    (async () => {
      const { count: totalCount, error: totalErr } = await supabase
        .from('marketing_emails')
        .select('*', { count: 'exact', head: true });
      const total = totalErr ? '?' : (totalCount ?? 0);
      addLine('output', `  1. View email marketing list [${total} emails]`);
      addLine('output', '  2. Add new emails from Google Sheet');
      addLine('output', '  3. Send emails');
      addLine('info', '');
      addLine('info', 'Enter option number (0 to exit):');
    })();
  };

  const showCategoryMenu = (action: 'view' | 'import') => {
    const mode = action === 'view' ? 'marketing-categories' : 'marketing-import-category';
    setTerminalMode(mode);
    addLine('info', '');
    addLine('info', 'Select category:');
    addLine('info', '');

    (async () => {
      const { count: mpCount } = await supabase
        .from('marketing_emails')
        .select('*', { count: 'exact', head: true })
        .eq('category', 'marketing_people');
      const { count: agCount } = await supabase
        .from('marketing_emails')
        .select('*', { count: 'exact', head: true })
        .eq('category', 'agencies');
      addLine('output', `  1. Marketing People List [${mpCount ?? 0} emails]`);
      addLine('output', `  2. Agencies [${agCount ?? 0} emails]`);
      addLine('info', '');
      addLine('info', 'Enter option number (0 to go back):');
    })();
  };

  const handleMarketingList = async (category: string, offset = 0) => {
    setTerminalMode('marketing-list');
    setProcessing(true);
    const categoryLabel = category === 'marketing_people' ? 'Marketing People List' : 'Agencies';
    const pageSize = 1000;

    if (offset === 0) {
      addLine('info', `Fetching ${categoryLabel}...`);
    }

    try {
      // Get total count
      const { count: totalCount } = await supabase
        .from('marketing_emails')
        .select('*', { count: 'exact', head: true })
        .eq('category', category);

      const total = totalCount ?? 0;

      const { data, error } = await supabase
        .from('marketing_emails')
        .select('email, created_at')
        .eq('category', category)
        .order('created_at', { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (error) throw error;

      if (!data || data.length === 0) {
        if (offset === 0) {
          addLine('info', `No emails in ${categoryLabel}.`);
        } else {
          addLine('info', 'No more emails.');
        }
      } else {
        if (offset === 0) {
          addLine('info', '');
          addLine('info', `── ${categoryLabel} (${total}) ──`);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data.forEach((row: any, i: number) => {
          addLine('output', `  ${offset + i + 1}. ${row.email}`);
        });

        const loaded = offset + data.length;
        if (loaded < total) {
          setMarketingListOffset(loaded);
          addLine('info', '');
          addLine('info', `Showing ${loaded} of ${total}. Enter "more" to load next ${Math.min(pageSize, total - loaded)}, or 0 to go back.`);
        } else {
          setMarketingListOffset(-1);
          addLine('info', '');
          addLine('info', `All ${total} emails loaded. Enter 0 to go back.`);
        }
      }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      addLine('error', `✗ Error: ${err.message}`);
      addLine('info', 'Enter 0 to go back.');
    } finally {
      setProcessing(false);
    }
  };

  const handleMarketingImport = async (sheetUrl: string, category: string) => {
    setProcessing(true);
    addLine('info', '');
    addLine('info', '⏳ Importing emails from Google Sheet...');

    try {
      const { data, error } = await supabase.functions.invoke('import-marketing-emails', {
        body: { sheet_url: sheetUrl, category },
      });

      if (error) throw error;

      if (data?.error) {
        addLine('error', `✗ ${data.error}`);
      } else {
        const categoryLabel = category === 'marketing_people' ? 'Marketing People List' : 'Agencies';
        addLine('output', `✓ Import complete! (${categoryLabel})`);
        addLine('output', `  Total found: ${data.total_found}`);
        addLine('output', `  New added: ${data.added}`);
        addLine('output', `  Duplicates skipped: ${data.skipped}`);
      }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      addLine('error', `✗ Error: ${err.message}`);
    } finally {
      setProcessing(false);
      addLine('info', '');
      addLine('info', 'Enter 0 to go back.');
      setTerminalMode('marketing-import');
    }
  };

  const handleAddSingleEmail = async (email: string, category: string) => {
    setProcessing(true);
    addLine('info', `⏳ Adding ${email}...`);

    try {
      const { error } = await supabase
        .from('marketing_emails')
        .upsert({ email, category }, { onConflict: 'email', ignoreDuplicates: true });

      if (error) throw error;

      const categoryLabel = category === 'marketing_people' ? 'Marketing People List' : 'Agencies';
      addLine('output', `✓ Added ${email} to ${categoryLabel}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      if (err.message?.includes('duplicate') || err.code === '23505') {
        addLine('info', `ℹ ${email} already exists in the list.`);
      } else {
        addLine('error', `✗ Error: ${err.message}`);
      }
    } finally {
      setProcessing(false);
      addLine('info', '');
      addLine('info', 'Enter another email, or 0 to go back.');
    }
  };


  const showSendMenu = (clearEmail = false) => {
    setTerminalMode('send-menu');
    if (clearEmail) {
      setEmailSubject('');
      setEmailHtml('');
      setEmailPrompt('');
    }
    setBulkTarget('');
    addLine('info', '');
    addLine('info', '── SEND EMAILS ──');
    if (emailHtml && emailSubject && !clearEmail) {
      addLine('output', `  ✉ Last email ready: "${emailSubject}"`);
      addLine('info', '');
    }
    addLine('output', '  1. Send test email to business@stankeviciusmgm.com');
    addLine('output', '  2. Send bulk to Marketing People List');
    addLine('output', '  3. Send bulk to Agencies');
    addLine('output', '  4. Generate email with AI');
    addLine('output', '  5. Campaign overview');
    if (emailHtml && emailSubject && !clearEmail) {
      addLine('output', '  6. Clear saved email');
    }
    addLine('info', '');
    addLine('info', 'Enter option number (0 to go back):');
  };

  const showCampaignMenu = () => {
    setTerminalMode('campaign-menu');
    addLine('info', '');
    addLine('info', '── CAMPAIGN OVERVIEW ──');
    addLine('output', '  1. View lists (recipient counts)');
    addLine('output', '  2. View already sent');
    addLine('output', '  3. View unsent');
    addLine('output', '  4. View email template');
    addLine('info', '');
    addLine('info', 'Enter option number (0 to go back):');
  };

  const handleCampaignLists = async () => {
    setProcessing(true);
    addLine('info', '⏳ Fetching list counts...');
    try {
      const { count: mpCount } = await supabase
        .from('marketing_emails')
        .select('*', { count: 'exact', head: true })
        .eq('category', 'marketing_people');
      const { count: agCount } = await supabase
        .from('marketing_emails')
        .select('*', { count: 'exact', head: true })
        .eq('category', 'agencies');
      addLine('info', '');
      addLine('info', '── RECIPIENT LISTS ──');
      addLine('output', `  Marketing People: ${mpCount ?? 0} emails`);
      addLine('output', `  Agencies: ${agCount ?? 0} emails`);
      addLine('output', `  Total: ${(mpCount ?? 0) + (agCount ?? 0)} emails`);
    } catch (err: any) {
      addLine('error', `✗ Error: ${err.message}`);
    } finally {
      setProcessing(false);
      addLine('info', '');
      addLine('info', 'Enter 0 to go back.');
      setTerminalMode('campaign-result');
    }
  };

  const handleCampaignSent = async () => {
    setProcessing(true);
    addLine('info', '⏳ Fetching sent campaigns...');
    try {
      // Get distinct campaigns with counts
      const { data: sends, error } = await supabase
        .from('marketing_email_sends')
        .select('campaign_id, email, sent_at')
        .order('sent_at', { ascending: false })
        .limit(1000);
      if (error) throw error;

      if (!sends || sends.length === 0) {
        addLine('info', '');
        addLine('output', '  No emails have been sent yet.');
      } else {
        // Group by campaign
        const campaigns = new Map<string, { count: number; lastSent: string }>();
        for (const s of sends) {
          const existing = campaigns.get(s.campaign_id);
          if (existing) {
            existing.count++;
            if (s.sent_at > existing.lastSent) existing.lastSent = s.sent_at;
          } else {
            campaigns.set(s.campaign_id, { count: 1, lastSent: s.sent_at });
          }
        }
        addLine('info', '');
        addLine('info', '── ALREADY SENT ──');
        for (const [cid, info] of campaigns) {
          const date = new Date(info.lastSent).toLocaleString();
          addLine('output', `  Campaign: ${cid}`);
          addLine('output', `    Sent: ${info.count} emails | Last: ${date}`);
          addLine('info', '');
        }
        addLine('output', `  Total tracked sends: ${sends.length}`);
      }
    } catch (err: any) {
      addLine('error', `✗ Error: ${err.message}`);
    } finally {
      setProcessing(false);
      addLine('info', '');
      addLine('info', 'Enter 0 to go back.');
      setTerminalMode('campaign-result');
    }
  };

  const handleCampaignUnsent = async () => {
    setProcessing(true);
    addLine('info', '⏳ Calculating unsent emails...');
    try {
      // Get total emails per category
      const { count: mpTotal } = await supabase
        .from('marketing_emails')
        .select('*', { count: 'exact', head: true })
        .eq('category', 'marketing_people');
      const { count: agTotal } = await supabase
        .from('marketing_emails')
        .select('*', { count: 'exact', head: true })
        .eq('category', 'agencies');

      // Get all sent emails
      let allSentEmails = new Set<string>();
      let sentOffset = 0;
      while (true) {
        const { data: sentBatch } = await supabase
          .from('marketing_email_sends')
          .select('email')
          .range(sentOffset, sentOffset + 999);
        if (!sentBatch || sentBatch.length === 0) break;
        sentBatch.forEach(s => allSentEmails.add(s.email));
        if (sentBatch.length < 1000) break;
        sentOffset += 1000;
      }

      // Get emails per category and check against sent
      let mpUnsent = 0;
      let agUnsent = 0;
      let offset = 0;
      while (true) {
        const { data: batch } = await supabase
          .from('marketing_emails')
          .select('email, category')
          .range(offset, offset + 999);
        if (!batch || batch.length === 0) break;
        for (const row of batch) {
          if (!allSentEmails.has(row.email)) {
            if (row.category === 'marketing_people') mpUnsent++;
            else if (row.category === 'agencies') agUnsent++;
          }
        }
        if (batch.length < 1000) break;
        offset += 1000;
      }

      addLine('info', '');
      addLine('info', '── UNSENT EMAILS ──');
      addLine('output', `  Marketing People: ${mpUnsent} unsent / ${mpTotal ?? 0} total`);
      addLine('output', `  Agencies: ${agUnsent} unsent / ${agTotal ?? 0} total`);
      addLine('output', `  Total unsent: ${mpUnsent + agUnsent}`);
      addLine('output', `  Total sent (all campaigns): ${allSentEmails.size}`);
      if (isSending) {
        addLine('info', '');
        addLine('output', `  Type "pause" to pause the current send operation.`);
      }
    } catch (err: any) {
      addLine('error', `✗ Error: ${err.message}`);
    } finally {
      setProcessing(false);
      addLine('info', '');
      addLine('info', 'Enter 0 to go back.');
      setTerminalMode('campaign-result');
    }
  };

  const handleCampaignTemplate = () => {
    addLine('info', '');
    addLine('info', '── EMAIL TEMPLATE ──');
    if (!emailSubject && !emailHtml) {
      addLine('error', '  No email template loaded. Use "Generate email with AI" first.');
    } else {
      addLine('output', `  Subject: ${emailSubject}`);
      addLine('info', '');
      addLine('output', '  ── HTML Preview ──');
      // Show first 500 chars of HTML
      const preview = emailHtml.length > 500 ? emailHtml.slice(0, 500) + '...' : emailHtml;
      addLine('output', `  ${preview}`);
    }
    addLine('info', '');
    addLine('info', 'Enter 0 to go back.');
    setTerminalMode('campaign-result');
  };

  const showGeneratePreviewMenu = () => {
    addLine('info', '');
    addLine('info', '── What would you like to do? ──');
    addLine('output', '  1. Send test email to business@stankeviciusmgm.com');
    addLine('output', '  2. Send bulk to Marketing People List');
    addLine('output', '  3. Send bulk to Agencies');
    addLine('output', '  4. Edit email (provide instructions)');
    addLine('output', '  5. Regenerate email');
    addLine('output', '  6. Continue campaign (send to unsent only)');
    addLine('info', '');
    addLine('info', 'Enter option number (0 to go back to send menu):');
    setTerminalMode('generate-preview');
  };

  const showContinueCampaignMenu = async () => {
    setProcessing(true);
    addLine('info', '⏳ Checking unsent recipients...');
    try {
      // Get all sent emails across all campaigns
      let allSentEmails = new Set<string>();
      let sentOffset = 0;
      while (true) {
        const { data: sentBatch } = await supabase
          .from('marketing_email_sends')
          .select('email')
          .range(sentOffset, sentOffset + 999);
        if (!sentBatch || sentBatch.length === 0) break;
        sentBatch.forEach(s => allSentEmails.add(s.email));
        if (sentBatch.length < 1000) break;
        sentOffset += 1000;
      }

      // Count unsent per category
      let mpUnsent = 0;
      let agUnsent = 0;
      let offset = 0;
      while (true) {
        const { data: batch } = await supabase
          .from('marketing_emails')
          .select('email, category')
          .range(offset, offset + 999);
        if (!batch || batch.length === 0) break;
        for (const row of batch) {
          if (!allSentEmails.has(row.email)) {
            if (row.category === 'marketing_people') mpUnsent++;
            else if (row.category === 'agencies') agUnsent++;
          }
        }
        if (batch.length < 1000) break;
        offset += 1000;
      }

      addLine('info', '');
      addLine('info', '── CONTINUE CAMPAIGN (unsent only) ──');
      addLine('output', `  1. Marketing People (${mpUnsent} unsent)`);
      addLine('output', `  2. Agencies (${agUnsent} unsent)`);
      if (mpUnsent === 0 && agUnsent === 0) {
        addLine('info', '');
        addLine('output', '  ✓ All emails have been sent across all campaigns!');
      }
      addLine('info', '');
      addLine('info', 'Enter option number (0 to go back):');
      setTerminalMode('continue-campaign');
    } catch (err: any) {
      addLine('error', `✗ Error: ${err.message}`);
      showGeneratePreviewMenu();
    } finally {
      setProcessing(false);
    }
  };

  const executeContinueCampaign = async (category: string) => {
    if (!emailHtml || !emailSubject) {
      addLine('error', 'No email composed yet. Use option 4 to generate an email first.');
      showGeneratePreviewMenu();
      return;
    }
    // Use a deterministic campaign ID for tracking new sends
    const campaignId = `${emailSubject.slice(0, 40).replace(/[^a-zA-Z0-9]/g, '_')}_continue`;
    activeCampaignIdRef.current = campaignId;

    setProcessing(true);
    const categoryLabel = category === 'marketing_people' ? 'Marketing People List' : 'Agencies';
    addLine('info', `⏳ Fetching ${categoryLabel} recipients...`);

    try {
      // Fetch ALL emails with pagination
      let allEmails: { email: string }[] = [];
      let fetchOffset = 0;
      while (true) {
        const { data: batch, error: fetchErr } = await supabase
          .from('marketing_emails')
          .select('email')
          .eq('category', category)
          .range(fetchOffset, fetchOffset + 999);
        if (fetchErr) throw fetchErr;
        if (!batch || batch.length === 0) break;
        allEmails = allEmails.concat(batch);
        if (batch.length < 1000) break;
        fetchOffset += 1000;
      }

      if (allEmails.length === 0) {
        addLine('error', `No emails found in ${categoryLabel}.`);
        setProcessing(false);
        showSendMenu();
        return;
      }

      // Fetch ALL sent emails across ALL campaigns (not just current campaign_id)
      const alreadySent = new Set<string>();
      let sentOffset = 0;
      while (true) {
        const { data: sentBatch, error: sentErr } = await supabase
          .from('marketing_email_sends')
          .select('email')
          .eq('category', category)
          .range(sentOffset, sentOffset + 999);
        if (sentErr) break;
        if (!sentBatch || sentBatch.length === 0) break;
        sentBatch.forEach(s => alreadySent.add(s.email));
        if (sentBatch.length < 1000) break;
        sentOffset += 1000;
      }

      const recipients = allEmails.map(e => e.email).filter(e => !alreadySent.has(e));

      if (alreadySent.size > 0) {
        addLine('info', `⏩ Skipping ${alreadySent.size} already-sent emails (across all campaigns).`);
      }

      if (recipients.length === 0) {
        addLine('output', `✓ All emails in ${categoryLabel} have already been sent.`);
        activeCampaignIdRef.current = null;
        setProcessing(false);
        showSendMenu();
        return;
      }

      addLine('info', `Sending to ${recipients.length} unsent recipients...`);

      // Send in batches of 50 with auto-retry
      let totalSent = 0;
      let totalFailed = 0;
      const MAX_RETRIES = 3;

      setIsSending(true);
      await setPauseState(false);

      for (let i = 0; i < recipients.length; i += 50) {
        await waitWhilePaused();
        const batch = recipients.slice(i, i + 50);
        const batchNum = Math.floor(i / 50) + 1;
        addLine('info', `  Batch ${batchNum}: sending ${batch.length} emails...`);

        let success = false;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          try {
            const { data, error } = await supabase.functions.invoke('send-marketing-email', {
              body: {
                recipients: batch,
                subject: emailSubject,
                html_body: emailHtml,
                campaign_id: campaignId,
              },
            });

            if (error) throw error;
            if (data?.paused) {
              addLine('info', '⏸️  Sending paused (detected from server). Waiting for resume...');
              pausedRef.current = true;
              setIsPaused(true);
              await waitWhilePaused();
              attempt--; // Retry this batch after resume
              continue;
            }
            if (data?.error) throw new Error(data.error);

            totalSent += data.sent || 0;
            totalFailed += data.failed || 0;

            // Log sent emails to tracking table
            const sentEmails = (data.sent_emails as string[] | undefined) || batch;
            if (sentEmails.length > 0) {
              const rows = sentEmails.map((email: string) => ({
                campaign_id: campaignId,
                email,
                category,
              }));
              await supabase.from('marketing_email_sends').upsert(rows, { onConflict: 'campaign_id,email', ignoreDuplicates: true });
            }

            success = true;
            break;
          } catch (err: any) {
            if (attempt < MAX_RETRIES) {
              addLine('info', `  ⚠️ Batch ${batchNum} attempt ${attempt} failed, retrying in ${attempt * 3}s...`);
              await new Promise(r => setTimeout(r, attempt * 3000));
            } else {
              addLine('error', `  ✗ Batch ${batchNum} failed after ${MAX_RETRIES} attempts: ${err.message}`);
              totalFailed += batch.length;
            }
          }
        }

        if (success && i + 50 < recipients.length) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }

      addLine('output', '');
      addLine('output', `✓ Continue campaign complete: ${totalSent} sent, ${totalFailed} failed out of ${recipients.length}`);
      activeCampaignIdRef.current = null;
    } catch (err: any) {
      addLine('error', `✗ Error: ${err.message}`);
    } finally {
      setProcessing(false);
      setIsSending(false);
      addLine('info', '');
      showSendMenu();
    }
  };

  const handleSendTest = async () => {
    if (!emailHtml || !emailSubject) {
      addLine('error', 'No email composed yet. Use option 4 to generate an email first.');
      addLine('info', '');
      showSendMenu();
      return;
    }
    setProcessing(true);
    addLine('info', '⏳ Sending test email to business@stankeviciusmgm.com...');

    try {
      const { data, error } = await supabase.functions.invoke('send-marketing-email', {
        body: {
          recipients: ['business@stankeviciusmgm.com'],
          subject: emailSubject,
          html_body: emailHtml,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      addLine('output', `✓ Test email sent! (${data.sent} delivered)`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      addLine('error', `✗ Error: ${err.message}`);
    } finally {
      setProcessing(false);
      addLine('info', '');
      showSendMenu();
    }
  };

  const handleBulkSend = async (category: 'marketing_people' | 'agencies') => {
    if (!emailHtml || !emailSubject) {
      addLine('error', 'No email composed yet. Use option 4 to generate an email first.');
      addLine('info', '');
      showSendMenu();
      return;
    }

    const categoryLabel = category === 'marketing_people' ? 'Marketing People List' : 'Agencies';
    setBulkTarget(category);
    setTerminalMode('send-confirm-bulk');
    addLine('info', '');
    addLine('info', `⚠️  You are about to send a bulk email to ALL recipients in "${categoryLabel}".`);
    addLine('info', `    Subject: ${emailSubject}`);
    addLine('info', '');
    addLine('info', 'Type "confirm" to proceed, or 0 to cancel:');
  };

  const executeBulkSend = async (category: string) => {
    setProcessing(true);
    const categoryLabel = category === 'marketing_people' ? 'Marketing People List' : 'Agencies';
    addLine('info', `⏳ Fetching ${categoryLabel} recipients...`);

    // Deterministic campaign ID so resume works across retries
    const campaignId = activeCampaignIdRef.current || `${emailSubject.slice(0, 40).replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;
    activeCampaignIdRef.current = campaignId;

    try {
      // Fetch ALL emails with pagination (Supabase default limit is 1000)
      let allEmails: { email: string }[] = [];
      let fetchOffset = 0;
      const fetchBatchSize = 1000;
      while (true) {
        const { data: batch, error: fetchErr } = await supabase
          .from('marketing_emails')
          .select('email')
          .eq('category', category)
          .range(fetchOffset, fetchOffset + fetchBatchSize - 1);
        if (fetchErr) throw fetchErr;
        if (!batch || batch.length === 0) break;
        allEmails = allEmails.concat(batch);
        if (batch.length < fetchBatchSize) break;
        fetchOffset += fetchBatchSize;
      }

      if (!allEmails || allEmails.length === 0) {
        addLine('error', `No emails found in ${categoryLabel}.`);
        setTerminalMode('send-menu');
        return;
      }

      // Check for already-sent emails in this campaign (for resume capability)
      let alreadySent = new Set<string>();
      let sentOffset = 0;
      while (true) {
        const { data: sentBatch, error: sentErr } = await supabase
          .from('marketing_email_sends')
          .select('email')
          .eq('campaign_id', campaignId)
          .range(sentOffset, sentOffset + 1000 - 1);
        if (sentErr) break;
        if (!sentBatch || sentBatch.length === 0) break;
        sentBatch.forEach(s => alreadySent.add(s.email));
        if (sentBatch.length < 1000) break;
        sentOffset += 1000;
      }

      const recipients = allEmails.map(e => e.email).filter(e => !alreadySent.has(e));

      if (alreadySent.size > 0) {
        addLine('info', `⏩ Skipping ${alreadySent.size} already-sent emails.`);
      }

      if (recipients.length === 0) {
        addLine('output', `✓ All emails in ${categoryLabel} have already been sent for this campaign.`);
        activeCampaignIdRef.current = null;
        setTerminalMode('send-menu');
        return;
      }

      addLine('info', `Sending to ${recipients.length} recipients...`);

      // Send in batches of 50 with auto-retry on failure
      let totalSent = 0;
      let totalFailed = 0;
      const MAX_RETRIES = 3;

      setIsSending(true);
      await setPauseState(false);

      for (let i = 0; i < recipients.length; i += 50) {
        await waitWhilePaused();
        const batch = recipients.slice(i, i + 50);
        const batchNum = Math.floor(i / 50) + 1;
        addLine('info', `  Batch ${batchNum}: sending ${batch.length} emails...`);

        let success = false;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          try {
            const { data, error } = await supabase.functions.invoke('send-marketing-email', {
              body: {
                recipients: batch,
                subject: emailSubject,
                html_body: emailHtml,
                campaign_id: campaignId,
              },
            });

            if (error) throw error;
            if (data?.paused) {
              addLine('info', '⏸️  Sending paused (detected from server). Waiting for resume...');
              pausedRef.current = true;
              setIsPaused(true);
              await waitWhilePaused();
              attempt--; // Retry this batch after resume
              continue;
            }
            if (data?.error) throw new Error(data.error);

            totalSent += data.sent || 0;
            totalFailed += data.failed || 0;

            // Log successfully sent emails to tracking table
            const sentEmails = (data.sent_emails as string[] | undefined) || batch.filter((_: string, idx: number) => {
              const errList = data.errors as Array<{ email: string }> | undefined;
              return !errList?.some((e) => e.email === batch[idx]);
            });
            if (sentEmails.length > 0) {
              const rows = sentEmails.map((email: string) => ({
                campaign_id: campaignId,
                email,
                category,
              }));
              await supabase.from('marketing_email_sends').upsert(rows, { onConflict: 'campaign_id,email', ignoreDuplicates: true });
            }

            success = true;
            break;
          } catch (retryErr: any) {
            if (attempt < MAX_RETRIES) {
              const waitSec = attempt * 3;
              addLine('info', `  ⚠ Batch ${batchNum} failed (attempt ${attempt}/${MAX_RETRIES}), retrying in ${waitSec}s...`);
              await new Promise(r => setTimeout(r, waitSec * 1000));
            } else {
              addLine('error', `  ✗ Batch ${batchNum} failed after ${MAX_RETRIES} attempts: ${retryErr.message}`);
              addLine('info', `  ${batch.length} emails skipped. Campaign can be resumed.`);
              totalFailed += batch.length;
            }
          }
        }

        // Delay between batches
        if (success && i + 50 < recipients.length) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }

      addLine('output', `✓ Bulk send complete!`);
      addLine('output', `  Sent: ${totalSent}`);
      addLine('output', `  Failed: ${totalFailed}`);
      addLine('output', `  Total: ${recipients.length}`);
      addLine('output', `  Campaign ID: ${campaignId}`);
      activeCampaignIdRef.current = null;
      setIsSending(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      addLine('error', `✗ Error: ${err.message}`);
      addLine('info', `  Campaign ID: ${campaignId} — you can resume this send.`);
    } finally {
      setProcessing(false);
      setIsSending(false);
      addLine('info', '');
      addLine('info', 'Enter 0 to go back to send menu.');
      setTerminalMode('send-confirm-test');
    }
  };

  const handleGenerateEmail = async (prompt: string, subject: string) => {
    setProcessing(true);
    addLine('info', '⏳ AI is generating your email...');

    try {
      const { data, error } = await supabase.functions.invoke('generate-marketing-email', {
        body: { prompt, subject_line: subject },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setEmailHtml(data.html_body);
      setEmailSubject(subject);

      addLine('output', '✓ Email generated!');
      addLine('info', `  Subject: ${subject}`);
      addLine('info', '');
      addLine('html-preview', data.html_body);
      addLine('info', '');
      addLine('info', '── What would you like to do? ──');
      addLine('output', '  1. Send test email to business@stankeviciusmgm.com');
      addLine('output', '  2. Send bulk to Marketing People List');
      addLine('output', '  3. Send bulk to Agencies');
      addLine('output', '  4. Edit email (provide instructions)');
      addLine('output', '  5. Regenerate email');
      addLine('output', '  6. Continue campaign (send to unsent only)');
      addLine('info', '');
      addLine('info', 'Enter option number (0 to go back to send menu):');
      setTerminalMode('generate-preview');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      addLine('error', `✗ Error: ${err.message}`);
      addLine('info', 'Enter 0 to go back.');
      setTerminalMode('send-menu');
    } finally {
      setProcessing(false);
    }
  };

  const handleEditEmail = async (instructions: string) => {
    setProcessing(true);
    addLine('info', '⏳ AI is editing your email...');

    try {
      const { data, error } = await supabase.functions.invoke('generate-marketing-email', {
        body: { edit_instructions: instructions, previous_html: emailHtml, subject_line: emailSubject },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setEmailHtml(data.html_body);

      addLine('output', '✓ Email updated!');
      addLine('info', '');
      addLine('html-preview', data.html_body);
      addLine('info', '');
      addLine('info', '── What would you like to do? ──');
      addLine('output', '  1. Send test email to business@stankeviciusmgm.com');
      addLine('output', '  2. Send bulk to Marketing People List');
      addLine('output', '  3. Send bulk to Agencies');
      addLine('output', '  4. Edit email (provide instructions)');
      addLine('output', '  5. Regenerate email');
      addLine('output', '  6. Continue campaign (send to unsent only)');
      addLine('info', '');
      addLine('info', 'Enter option number (0 to go back to send menu):');
      setTerminalMode('generate-preview');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      addLine('error', `✗ Error: ${err.message}`);
      addLine('info', 'Enter 0 to go back.');
      setTerminalMode('generate-preview');
    } finally {
      setProcessing(false);
    }
  };

  // --- Command handler ---
  const handleCommand = async (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    addLine('input', trimmed);
    setCommandHistory(prev => [trimmed, ...prev]);
    setHistoryIndex(-1);
    setInput('');

    // --- Global pause/resume commands (work from any mode, persisted to DB) ---
    if (trimmed.toLowerCase() === 'pause') {
      await setPauseState(true);
      addLine('info', '⏸️  Sending paused by admin. This applies across all tabs/sessions.');
      addLine('info', '  Type "resume" to continue.');
      return;
    }
    if (trimmed.toLowerCase() === 'resume') {
      await setPauseState(false);
      if (isSending) {
        addLine('info', '▶️  Sending resumed — active loop will continue.');
      } else if (emailHtml && emailSubject) {
        addLine('info', '▶️  Sending resumed. Starting send to unsent recipients...');
        // Auto-start continue campaign for both categories
        const autoResume = async () => {
          for (const cat of ['marketing_people', 'agencies'] as const) {
            await executeContinueCampaign(cat);
          }
        };
        autoResume();
      } else {
        addLine('info', '▶️  Pause cleared. No email template loaded — go to /marketing and set up a campaign first.');
      }
      return;
    }

    // --- Sub-modes ---

    if (terminalMode === 'marketing-list') {
      if (trimmed === '0') { setMarketingListOffset(-1); showCategoryMenu('view'); return; }
      if (trimmed.toLowerCase() === 'more' && marketingListOffset > 0) {
        await handleMarketingList(marketingCategory, marketingListOffset);
        return;
      }
      if (marketingListOffset > 0) {
        addLine('error', 'Enter "more" to load next page, or 0 to go back.');
      } else {
        addLine('error', 'Enter 0 to go back.');
      }
      return;
    }

    if (terminalMode === 'marketing-categories') {
      if (trimmed === '0') { showMarketingMenu(); return; }
      if (trimmed === '1') { setMarketingCategory('marketing_people'); await handleMarketingList('marketing_people'); return; }
      if (trimmed === '2') { setMarketingCategory('agencies'); await handleMarketingList('agencies'); return; }
      addLine('error', 'Invalid option. Enter 1, 2, or 0 to go back.');
      return;
    }

    if (terminalMode === 'marketing-import-category') {
      if (trimmed === '0') { showMarketingMenu(); return; }
      if (trimmed === '1') {
        setMarketingCategory('marketing_people');
        setTerminalMode('marketing-import');
        addLine('info', '');
        addLine('info', 'Importing to: Marketing People List');
        addLine('info', '');
        addLine('output', '  1. Paste Google Sheet URL');
        addLine('output', '  2. Add individual email');
        addLine('info', '');
        addLine('info', 'Enter option number (0 to go back):');
        return;
      }
      if (trimmed === '2') {
        setMarketingCategory('agencies');
        setTerminalMode('marketing-import');
        addLine('info', '');
        addLine('info', 'Importing to: Agencies');
        addLine('info', '');
        addLine('output', '  1. Paste Google Sheet URL');
        addLine('output', '  2. Add individual email');
        addLine('info', '');
        addLine('info', 'Enter option number (0 to go back):');
        return;
      }
      addLine('error', 'Invalid option. Enter 1, 2, or 0 to go back.');
      return;
    }

    if (terminalMode === 'marketing-import') {
      if (trimmed === '0') { showMarketingMenu(); return; }
      if (trimmed === '1') {
        setTerminalMode('marketing-import-sheet');
        addLine('info', '');
        addLine('info', 'Paste Google Sheet URL:');
        return;
      }
      if (trimmed === '2') {
        setTerminalMode('marketing-import-single');
        addLine('info', '');
        addLine('info', 'Enter email address:');
        return;
      }
      addLine('error', 'Invalid option. Enter 1, 2, or 0 to go back.');
      return;
    }

    if (terminalMode === 'marketing-import-sheet') {
      if (trimmed === '0') { showMarketingMenu(); return; }
      if (trimmed.includes('docs.google.com/spreadsheets') || trimmed.includes('sheets.google.com')) {
        await handleMarketingImport(trimmed, marketingCategory);
        return;
      }
      addLine('error', 'Please paste a valid Google Sheets URL, or enter 0 to go back.');
      return;
    }

    if (terminalMode === 'marketing-import-single') {
      if (trimmed === '0') { showMarketingMenu(); return; }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (emailRegex.test(trimmed)) {
        await handleAddSingleEmail(trimmed.toLowerCase(), marketingCategory);
        return;
      }
      addLine('error', 'Please enter a valid email address, or enter 0 to go back.');
      return;
    }

    // Campaign sub-modes
    if (terminalMode === 'campaign-menu') {
      if (trimmed === '0') { showSendMenu(); return; }
      if (trimmed === '1') { await handleCampaignLists(); return; }
      if (trimmed === '2') { await handleCampaignSent(); return; }
      if (trimmed === '3') { await handleCampaignUnsent(); return; }
      if (trimmed === '4') { handleCampaignTemplate(); return; }
      addLine('error', 'Invalid option. Enter 1-4, or 0 to go back.');
      return;
    }

    if (terminalMode === 'campaign-result') {
      if (trimmed === '0') { showCampaignMenu(); return; }
      addLine('error', 'Enter 0 to go back.');
      return;
    }

    if (terminalMode === 'continue-campaign') {
      if (trimmed === '0') { showGeneratePreviewMenu(); return; }
      if (trimmed === '1') { await executeContinueCampaign('marketing_people'); return; }
      if (trimmed === '2') { await executeContinueCampaign('agencies'); return; }
      addLine('error', 'Invalid option. Enter 1, 2, or 0 to go back.');
      return;
    }

    // Send email sub-modes
    if (terminalMode === 'send-confirm-test') {
      if (trimmed === '0') { showSendMenu(); return; }
      addLine('error', 'Enter 0 to go back.');
      return;
    }

    if (terminalMode === 'send-confirm-bulk') {
      if (trimmed === '0') { showSendMenu(); return; }
      if (trimmed.toLowerCase() === 'confirm' && bulkTarget) {
        await executeBulkSend(bulkTarget);
        return;
      }
      addLine('error', 'Type "confirm" to proceed or 0 to cancel.');
      return;
    }

    if (terminalMode === 'generate-prompt') {
      if (trimmed === '0') { showSendMenu(); return; }
      setEmailPrompt(trimmed);
      setTerminalMode('generate-subject');
      addLine('info', '');
      addLine('info', 'Enter subject line for the email:');
      return;
    }

    if (terminalMode === 'generate-subject') {
      if (trimmed === '0') { showSendMenu(); return; }
      setEmailSubject(trimmed);
      await handleGenerateEmail(emailPrompt, trimmed);
      return;
    }

    if (terminalMode === 'generate-edit') {
      if (trimmed === '0') {
        // Show preview menu again
        showGeneratePreviewMenu();
        return;
      }
      await handleEditEmail(trimmed);
      return;
    }

    if (terminalMode === 'generate-preview') {
      if (trimmed === '0') { showSendMenu(); return; }
      if (trimmed === '1') { await handleSendTest(); return; }
      if (trimmed === '2') { await handleBulkSend('marketing_people'); return; }
      if (trimmed === '3') { await handleBulkSend('agencies'); return; }
      if (trimmed === '4') {
        setTerminalMode('generate-edit');
        addLine('info', '');
        addLine('info', 'Enter edit instructions (e.g. "make the CTA button bigger", "change tone to casual"):');
        return;
      }
      if (trimmed === '5') {
        await handleGenerateEmail(emailPrompt, emailSubject);
        return;
      }
      if (trimmed === '6') {
        showContinueCampaignMenu();
        return;
      }
      addLine('error', 'Invalid option. Enter 1-6, or 0 to go back.');
      return;
    }

    if (terminalMode === 'send-menu') {
      if (trimmed === '0') { showMarketingMenu(); return; }
      if (trimmed === '1') { await handleSendTest(); return; }
      if (trimmed === '2') { await handleBulkSend('marketing_people'); return; }
      if (trimmed === '3') { await handleBulkSend('agencies'); return; }
      if (trimmed === '4') {
        setTerminalMode('generate-prompt');
        addLine('info', '');
        addLine('info', 'Describe the email you want to create:');
        addLine('info', '(e.g. "Announce our new PR distribution service with special launch pricing")');
        return;
      }
      if (trimmed === '5') { showCampaignMenu(); return; }
      if (trimmed === '6' && emailHtml && emailSubject) {
        setEmailSubject('');
        setEmailHtml('');
        setEmailPrompt('');
        addLine('output', '✓ Saved email cleared.');
        showSendMenu(true);
        return;
      }
      addLine('error', `Invalid option. Enter 1-${emailHtml && emailSubject ? '6' : '5'}, or 0 to go back.`);
      return;
    }

    if (terminalMode === 'marketing') {
      if (trimmed === '1') { showCategoryMenu('view'); return; }
      if (trimmed === '2') { showCategoryMenu('import'); return; }
      if (trimmed === '3') { showSendMenu(); return; }
      if (trimmed === '0') {
        setTerminalMode('default');
        addLine('info', 'Exited /marketing.');
        return;
      }
      addLine('error', 'Invalid option. Enter 1, 2, 3, or 0 to exit.');
      return;
    }

    // --- Default commands ---
    switch (trimmed.toLowerCase()) {
      case '/db':
        await fetchUsers();
        break;
      case '/marketing':
        showMarketingMenu();
        break;
      case '/clear':
        setLines([{ id: lineId++, type: 'info', content: 'Terminal cleared.', timestamp: now() }]);
        setExpandedUsers(new Set());
        setTerminalMode('default');
        break;
      default:
        addLine('error', `Unknown command: ${trimmed}`);
        break;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !processing) {
      handleCommand(input);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIndex = Math.min(historyIndex + 1, commandHistory.length - 1);
        setHistoryIndex(newIndex);
        setInput(commandHistory[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInput(commandHistory[newIndex]);
      } else {
        setHistoryIndex(-1);
        setInput('');
      }
    }
  };

  const toggleExpand = (userId: string) => {
    setExpandedUsers(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const renderUserTable = (users: UserRecord[]) => (
    <div className="mt-1 mb-2">
      {users.map(user => (
        <div key={user.id}>
          <button
            onClick={() => toggleExpand(user.id)}
            className="w-full text-left font-mono text-xs py-1 px-2 hover:bg-white/5 transition-colors flex items-center gap-0"
          >
            <span className="text-green-400 w-4 shrink-0">{expandedUsers.has(user.id) ? '▼' : '▶'}</span>
            <span className="text-cyan-400 min-w-[220px] truncate">{user.email || 'no-email'}</span>
            <span className={`min-w-[60px] ${user.role === 'admin' ? 'text-yellow-400' : 'text-white/40'}`}>{user.role}</span>
            <span className="text-green-400 min-w-[100px]">{user.credits.toLocaleString()} cr</span>
            <span className="text-white/40 min-w-[80px]">{user.orders.length} orders</span>
            <span className="text-white/30">{format(new Date(user.created_at), 'yyyy-MM-dd')}</span>
            {user.suspended && <span className="text-red-400 ml-2">[SUSPENDED]</span>}
            {!user.email_verified && <span className="text-yellow-500 ml-2">[UNVERIFIED]</span>}
          </button>

          {expandedUsers.has(user.id) && (
            <div className="pl-6 border-l border-white/10 ml-2 mb-2 text-[11px] font-mono">
              <div className="text-white/30 py-0.5">ID: {user.id}</div>
              <div className="text-white/30 py-0.5">Last online: {user.last_online_at ? format(new Date(user.last_online_at), 'yyyy-MM-dd HH:mm') : '—'}</div>
              <div className="text-green-400 py-0.5">Available credits: {user.credits.toLocaleString()}</div>

              {user.orders.length > 0 && (
                <div className="mt-1">
                  <div className="text-white/50 py-0.5">── Orders ({user.orders.length}) ──</div>
                  {user.orders.slice(0, expandedOrders.has(user.id) ? undefined : 10).map(o => (
                    <div key={o.id} className="flex gap-2 py-0.5 text-white/40">
                      <span className="text-white/20">{o.order_number || o.id.slice(0, 8)}</span>
                      <span className="text-white/50">{o.media_site_name}</span>
                      <span className="text-cyan-400">${o.amount_cents.toLocaleString()}</span>
                      <span className={
                        o.status === 'completed' || o.status === 'released' ? 'text-green-400' :
                        o.status === 'cancelled' || o.status === 'refunded' ? 'text-red-400' :
                        'text-yellow-400'
                      }>{o.status}</span>
                    </div>
                  ))}
                  {user.orders.length > 10 && !expandedOrders.has(user.id) && (
                    <button
                      onClick={() => setExpandedOrders(prev => { const next = new Set(prev); next.add(user.id); return next; })}
                      className="text-cyan-400 hover:text-cyan-300 py-0.5 cursor-pointer"
                    >... +{user.orders.length - 10} more</button>
                  )}
                </div>
              )}

              {user.transactions.length > 0 && (
                <div className="mt-1">
                  <div className="text-white/50 py-0.5">── Transactions ({user.transactions.length}) ──</div>
                  {user.transactions.slice(0, expandedTransactions.has(user.id) ? undefined : 10).map(tx => (
                    <div key={tx.id} className="flex gap-2 py-0.5 text-white/40">
                      <span className="text-white/20">{format(new Date(tx.created_at), 'MM-dd')}</span>
                      <span className="text-white/50 min-w-[120px]">{tx.type}</span>
                      <span className={tx.amount >= 0 ? 'text-green-400' : 'text-red-400'}>
                        {tx.amount >= 0 ? '+' : ''}{tx.amount.toLocaleString()}
                      </span>
                      <span className="text-white/20 truncate max-w-[200px]">{tx.description || ''}</span>
                    </div>
                  ))}
                  {user.transactions.length > 10 && !expandedTransactions.has(user.id) && (
                    <button
                      onClick={() => setExpandedTransactions(prev => { const next = new Set(prev); next.add(user.id); return next; })}
                      className="text-cyan-400 hover:text-cyan-300 py-0.5 cursor-pointer"
                    >... +{user.transactions.length - 10} more</button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div
      className="animate-fade-in bg-black h-[calc(100vh-56px)] lg:h-screen -m-4 lg:-m-8 p-0 flex flex-col cursor-text overflow-hidden"
      onClick={() => inputRef.current?.focus()}
    >
      {/* Terminal Output */}
      <div className="flex-1 overflow-y-auto p-4 pt-2 font-mono text-sm min-h-0" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="flex flex-col justify-end min-h-full">
          {lines.map(line => {
            if (line.type === 'table' && line.data) {
              return <div key={line.id}>{renderUserTable(line.data)}</div>;
            }

            if (line.type === 'html-preview') {
              return (
                <div key={line.id} className="my-2 border border-white/20 rounded overflow-hidden">
                  <div className="bg-white/10 px-3 py-1 text-[10px] text-white/40 uppercase tracking-wider">Email Preview</div>
                  <div
                    className="bg-white text-black p-4 max-h-[400px] overflow-y-auto text-xs"
                    dangerouslySetInnerHTML={{ __html: line.content }}
                  />
                </div>
              );
            }

            let colorClass = 'text-white/60';
            let prefix = '';
            if (line.type === 'input') { colorClass = 'text-white'; prefix = '$ '; }
            else if (line.type === 'output') { colorClass = 'text-green-400'; }
            else if (line.type === 'error') { colorClass = 'text-red-400'; }
            else if (line.type === 'info') { colorClass = 'text-white/40'; }

            return (
              <div key={line.id} className={`${colorClass} leading-6 whitespace-pre-wrap break-words`}>
                {prefix}{line.content}
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input Line - at bottom */}
      <div className="flex items-start px-4 py-3 font-mono text-sm border-t border-white/10">
        <Terminal className="h-4 w-4 text-green-400 mr-2 shrink-0 mt-1" />
        <textarea
          ref={inputRef as any}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleKeyDown(e as any);
            }
          }}
          disabled={processing}
          placeholder={processing ? 'Processing...' : 'Enter command...'}
          className="flex-1 bg-transparent text-white outline-none placeholder:text-white/20 caret-green-400 resize-none overflow-hidden break-words"
          autoFocus
          spellCheck={false}
          rows={1}
          style={{ minHeight: '20px', maxHeight: '120px' }}
          onInput={e => {
            const el = e.target as HTMLTextAreaElement;
            el.style.height = 'auto';
            el.style.height = Math.min(el.scrollHeight, 120) + 'px';
          }}
        />
        {processing && (
          <span className="text-green-400 animate-pulse ml-2 mt-1">●</span>
        )}
        {isSending && (
          <button
            onClick={togglePause}
            className={`ml-2 mt-0.5 px-3 py-0.5 text-xs font-mono rounded shrink-0 ${
              isPaused
                ? 'bg-green-600 hover:bg-green-500 text-white'
                : 'bg-yellow-600 hover:bg-yellow-500 text-black'
            }`}
          >
            {isPaused ? '▶ Resume' : '⏸ Pause'}
          </button>
        )}
      </div>
    </div>
  );
}
