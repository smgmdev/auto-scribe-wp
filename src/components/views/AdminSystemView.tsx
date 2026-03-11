import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { calculateTotalBalance, calculateWithdrawals, calculateAvailableCredits } from '@/lib/credit-calculations';
import { Terminal } from 'lucide-react';

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
  type: 'input' | 'output' | 'error' | 'info' | 'table';
  content: string;
  data?: UserRecord[];
}

let lineId = Date.now();

type TerminalMode = 'default' | 'marketing' | 'marketing-categories' | 'marketing-list' | 'marketing-import-category' | 'marketing-import';

export function AdminSystemView() {
  const [lines, setLines] = useState<TerminalLine[]>([
    { id: lineId++, type: 'info', content: 'System Terminal v1.0' },
    { id: lineId++, type: 'info', content: '' },
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
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [lines, scrollToBottom]);

  const addLine = (type: TerminalLine['type'], content: string, data?: UserRecord[]) => {
    setLines(prev => [...prev, { id: lineId++, type, content, data }]);
  };

  const fetchUsers = async () => {
    addLine('info', 'Fetching user database...');
    setProcessing(true);

    try {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      console.log('Profiles query result:', { profiles, profilesError });
      if (profilesError) throw profilesError;

      const [rolesRes, creditsRes, ordersRes, transactionsRes, activeOrdersRes, pendingRequestsRes, serviceMessagesRes] = await Promise.all([
        supabase.from('user_roles').select('user_id, role'),
        supabase.from('user_credits').select('user_id, credits'),
        supabase.from('orders').select('id, user_id, order_number, status, amount_cents, created_at, media_site_id').order('created_at', { ascending: false }),
        supabase.from('credit_transactions').select('id, user_id, amount, type, description, created_at').order('created_at', { ascending: false }),
        supabase.from('orders').select('user_id, media_site_id, media_sites(price)').in('status', ['pending_payment', 'paid', 'accepted']),
        supabase.from('service_requests').select('id, user_id, media_site_id, media_sites(price)').in('status', ['pending', 'active']),
        supabase.from('service_messages').select('request_id, message'),
      ]);

      const requestsWithOrderMsg = new Set<string>();
      (serviceMessagesRes.data || []).forEach((m: any) => {
        if (m.message === 'CLIENT_ORDER_REQUEST') requestsWithOrderMsg.add(m.request_id);
      });

      const lockedFromOrdersMap = new Map<string, number>();
      (activeOrdersRes.data || []).forEach((o: any) => {
        const price = o.media_sites?.price || 0;
        lockedFromOrdersMap.set(o.user_id, (lockedFromOrdersMap.get(o.user_id) || 0) + price);
      });

      const lockedFromRequestsMap = new Map<string, number>();
      (pendingRequestsRes.data || []).forEach((r: any) => {
        if (requestsWithOrderMsg.has(r.id)) {
          const price = r.media_sites?.price || 0;
          lockedFromRequestsMap.set(r.user_id, (lockedFromRequestsMap.get(r.user_id) || 0) + price);
        }
      });

      const mediaSiteIds = [...new Set((ordersRes.data || []).map(o => o.media_site_id))];
      let mediaSiteMap: Record<string, string> = {};
      if (mediaSiteIds.length > 0) {
        const { data: sites } = await supabase.from('media_sites').select('id, name').in('id', mediaSiteIds);
        if (sites) mediaSiteMap = Object.fromEntries(sites.map(s => [s.id, s.name]));
      }

      const rolesMap = new Map<string, string>();
      (rolesRes.data || []).forEach(r => rolesMap.set(r.user_id, r.role));

      const ordersMap = new Map<string, OrderRecord[]>();
      (ordersRes.data || []).forEach(o => {
        const list = ordersMap.get(o.user_id) || [];
        list.push({ id: o.id, order_number: o.order_number, status: o.status, amount_cents: o.amount_cents, created_at: o.created_at, media_site_name: mediaSiteMap[o.media_site_id] || 'Unknown' });
        ordersMap.set(o.user_id, list);
      });

      const txMap = new Map<string, TransactionRecord[]>();
      (transactionsRes.data || []).forEach(t => {
        const list = txMap.get(t.user_id) || [];
        list.push({ id: t.id, amount: t.amount, type: t.type, description: t.description, created_at: t.created_at });
        txMap.set(t.user_id, list);
      });

      const userRecords: UserRecord[] = (profiles || []).map(p => {
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
    } catch (error: any) {
      addLine('error', `✗ Error: ${error.message}`);
    } finally {
      setProcessing(false);
    }
  };

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

  const handleMarketingList = async (category: string) => {
    setTerminalMode('marketing-list');
    setProcessing(true);
    const categoryLabel = category === 'marketing_people' ? 'Marketing People List' : 'Agencies';
    addLine('info', `Fetching ${categoryLabel}...`);

    try {
      const { data, error } = await supabase
        .from('marketing_emails')
        .select('email, created_at')
        .eq('category', category)
        .order('created_at', { ascending: true });

      if (error) throw error;

      if (!data || data.length === 0) {
        addLine('info', `No emails in ${categoryLabel}.`);
      } else {
        addLine('info', '');
        addLine('info', `── ${categoryLabel} (${data.length}) ──`);
        data.forEach((row: any, i: number) => {
          addLine('output', `  ${i + 1}. ${row.email}`);
        });
      }
      addLine('info', '');
      addLine('info', 'Enter 0 to go back.');
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
    } catch (err: any) {
      addLine('error', `✗ Error: ${err.message}`);
    } finally {
      setProcessing(false);
      addLine('info', '');
      addLine('info', 'Enter 0 to go back.');
      setTerminalMode('marketing-import');
    }
  };

  const handleCommand = async (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    addLine('input', trimmed);
    setCommandHistory(prev => [trimmed, ...prev]);
    setHistoryIndex(-1);
    setInput('');

    // Handle sub-modes first
    if (terminalMode === 'marketing-list') {
      if (trimmed === '0') {
        showCategoryMenu('view');
        return;
      }
      addLine('error', 'Enter 0 to go back.');
      return;
    }

    if (terminalMode === 'marketing-categories') {
      if (trimmed === '0') {
        showMarketingMenu();
        return;
      }
      if (trimmed === '1') {
        setMarketingCategory('marketing_people');
        await handleMarketingList('marketing_people');
        return;
      }
      if (trimmed === '2') {
        setMarketingCategory('agencies');
        await handleMarketingList('agencies');
        return;
      }
      addLine('error', 'Invalid option. Enter 1, 2, or 0 to go back.');
      return;
    }

    if (terminalMode === 'marketing-import-category') {
      if (trimmed === '0') {
        showMarketingMenu();
        return;
      }
      if (trimmed === '1') {
        setMarketingCategory('marketing_people');
        setTerminalMode('marketing-import');
        addLine('info', '');
        addLine('info', 'Importing to: Marketing People List');
        addLine('info', 'Paste Google Sheet URL:');
        return;
      }
      if (trimmed === '2') {
        setMarketingCategory('agencies');
        setTerminalMode('marketing-import');
        addLine('info', '');
        addLine('info', 'Importing to: Agencies');
        addLine('info', 'Paste Google Sheet URL:');
        return;
      }
      addLine('error', 'Invalid option. Enter 1, 2, or 0 to go back.');
      return;
    }

    if (terminalMode === 'marketing-import') {
      if (trimmed === '0') {
        showMarketingMenu();
        return;
      }
      if (trimmed.includes('docs.google.com/spreadsheets') || trimmed.includes('sheets.google.com')) {
        await handleMarketingImport(trimmed, marketingCategory);
        return;
      }
      addLine('error', 'Please paste a valid Google Sheets URL, or enter 0 to go back.');
      return;
    }

    if (terminalMode === 'marketing') {
      if (trimmed === '1') {
        showCategoryMenu('view');
        return;
      }
      if (trimmed === '2') {
        showCategoryMenu('import');
        return;
      }
      if (trimmed === '0') {
        setTerminalMode('default');
        addLine('info', 'Exited /marketing.');
        return;
      }
      addLine('error', 'Invalid option. Enter 1, 2, or 0 to exit.');
      return;
    }

    switch (trimmed.toLowerCase()) {
      case '/db':
        await fetchUsers();
        break;
      case '/marketing':
        showMarketingMenu();
        break;
      case '/clear':
        setLines([{ id: lineId++, type: 'info', content: 'Terminal cleared.' }]);
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

            let colorClass = 'text-white/60';
            let prefix = '';
            if (line.type === 'input') { colorClass = 'text-white'; prefix = '$ '; }
            else if (line.type === 'output') { colorClass = 'text-green-400'; }
            else if (line.type === 'error') { colorClass = 'text-red-400'; }
            else if (line.type === 'info') { colorClass = 'text-white/40'; }

            return (
              <div key={line.id} className={`${colorClass} leading-6 whitespace-pre`}>
                {prefix}{line.content}
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input Line - at bottom */}
      <div className="flex items-center px-4 py-3 font-mono text-sm border-t border-white/10">
        <Terminal className="h-4 w-4 text-green-400 mr-2 shrink-0" />
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={processing}
          placeholder={processing ? 'Processing...' : 'Enter command...'}
          className="flex-1 bg-transparent text-white outline-none placeholder:text-white/20 caret-green-400"
          autoFocus
          spellCheck={false}
        />
        {processing && (
          <span className="text-green-400 animate-pulse ml-2">●</span>
        )}
      </div>
    </div>
  );
}