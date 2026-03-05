/**
 * Shared credit calculation logic.
 * This is the SINGLE SOURCE OF TRUTH for credit balance formulas.
 * Used by: useAvailableCredits hook, AdminUsersView, and should mirror lock-order-credits edge function.
 * 
 * ALL amounts are in CREDITS (1 credit = $1 USD). No cents anywhere.
 */

export interface CreditTransaction {
  amount: number;
  type: string;
  description?: string | null;
}

export const WITHDRAWAL_TYPES = ['withdrawal_locked', 'withdrawal_unlocked', 'withdrawal_completed'];

/**
 * Calculate total balance from a user's transaction ledger.
 * Incoming = positive amounts (excluding withdrawals and 'unlocked')
 * Outgoing = negative amounts (excluding 'locked', 'offer_accepted', 'order', and withdrawals)
 */
export function calculateTotalBalance(transactions: CreditTransaction[]): number {
  const OUTGOING_EXCLUDED = ['locked', 'locked_superseded', 'offer_accepted', 'offer_superseded', 'order', 'order_accepted'];

  const incomingCredits = transactions
    .filter(t => t.amount > 0 && !WITHDRAWAL_TYPES.includes(t.type) && t.type !== 'unlocked')
    .reduce((sum, t) => sum + t.amount, 0);

  const outgoingCredits = transactions
    .filter(t => t.amount < 0 && !OUTGOING_EXCLUDED.includes(t.type) && !WITHDRAWAL_TYPES.includes(t.type))
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  return incomingCredits - outgoingCredits;
}

export interface WithdrawalBreakdown {
  /** Currently locked withdrawal amount in credits */
  locked: number;
  /** Completed withdrawal amount in credits */
  completed: number;
  /** Bank-specific locked credits */
  bankLocked: number;
  /** Crypto-specific locked credits */
  cryptoLocked: number;
}

/**
 * Calculate withdrawal amounts from transaction ledger.
 * All amounts are in credits (1 credit = $1).
 */
export function calculateWithdrawals(transactions: CreditTransaction[]): WithdrawalBreakdown {
  let locked = 0;
  let completed = 0;
  let bankLocked = 0;
  let cryptoLocked = 0;

  const withdrawalTxs = transactions.filter(t => WITHDRAWAL_TYPES.includes(t.type));
  for (const tx of withdrawalTxs) {
    const isBank = tx.description?.includes('Bank Transfer');
    const isCrypto = tx.description?.includes('USDT');

    if (tx.type === 'withdrawal_locked') {
      const amount = Math.abs(tx.amount);
      locked += amount;
      if (isBank) bankLocked += amount;
      if (isCrypto) cryptoLocked += amount;
    } else if (tx.type === 'withdrawal_unlocked') {
      const amount = Math.abs(tx.amount);
      locked -= amount;
      if (isBank) bankLocked -= amount;
      if (isCrypto) cryptoLocked -= amount;
    } else if (tx.type === 'withdrawal_completed') {
      const amount = Math.abs(tx.amount);
      locked -= amount;
      completed += amount;
      if (isBank) bankLocked -= amount;
      if (isCrypto) cryptoLocked -= amount;
    }
  }

  return {
    locked: Math.max(0, locked),
    completed,
    bankLocked: Math.max(0, bankLocked),
    cryptoLocked: Math.max(0, cryptoLocked),
  };
}

/**
 * Final available credits formula.
 * availableCredits = totalBalance - creditsInOrders - creditsInPendingRequests - creditsInWithdrawals - creditsWithdrawn
 */
export function calculateAvailableCredits(
  totalBalance: number,
  creditsInOrders: number,
  creditsInPendingRequests: number,
  creditsInWithdrawals: number,
  creditsWithdrawn: number,
): number {
  return totalBalance - creditsInOrders - creditsInPendingRequests - creditsInWithdrawals - creditsWithdrawn;
}

/**
 * Categorise transactions into earned, purchased online, and purchased offline.
 */
export function categoriseTransactions(transactions: CreditTransaction[]) {
  let earnedCredits = 0;
  let purchasedOnline = 0;
  let purchasedOffline = 0;

  for (const t of transactions) {
    if (t.type === 'order_payout') earnedCredits += t.amount;
    if (t.type === 'purchase') purchasedOnline += t.amount;
    if (t.type === 'gifted' || t.type === 'admin_credit') purchasedOffline += t.amount;
  }

  return { earnedCredits, purchasedOnline, purchasedOffline, totalPurchased: purchasedOnline + purchasedOffline };
}

// ──────────────────────────────────────────────────────────
// Admin-side: bulk credit calculation for all users at once
// ──────────────────────────────────────────────────────────

export interface AdminUserCredit {
  user_id: string;
  email: string | null;
  isAgency: boolean;
  /** Total balance from transaction ledger (incoming - outgoing, excluding locks/withdrawals) */
  totalCredits: number;
  /** Credits locked in active orders */
  lockedFromOrders: number;
  /** Credits locked in pending service requests (with CLIENT_ORDER_REQUEST) */
  lockedFromRequests: number;
  /** Total locked credits */
  locked: number;
  /** Available credits = totalCredits - locked - withdrawn */
  available: number;
  /** Total purchased (online + invoice/gifted) */
  purchased: number;
  purchasedOnline: number;
  purchasedInvoice: number;
  /** Earned from agency payouts */
  earned: number;
  /** Earned from B2B media orders */
  b2bEarnings: number;
  /** Earned from instant publishing sales */
  instantPublishingEarnings: number;
  /** Admin deductions */
  deductions: number;
  /** Refunded credits */
  refunded: number;
  /** Completed withdrawal amount in credits */
  withdrawn: number;
  /** Pending locked withdrawal credits by method */
  lockedFromWithdrawals: number;
  pendingBankWithdrawals: number;
  pendingCryptoWithdrawals: number;
  /** Order counts */
  orders: number;
  purchaseOrders: number;
  deliveryOrders: number;
  /** Instant publishing order counts */
  instantPublishOrders: number;
  instantPublishDeliveryOrders: number;
  /** Credits spent on publishing articles */
  publishSpent: number;
  /** Credits spent on usage (type === 'usage') */
  usageSpent: number;
  totalSpent: number;
  /** Raw DB value for validation */
  dbCredits: number;
  /** Sum of all non-withdrawal tx amounts (for DB validation) */
  rawTxSum: number;
  validationStatus: 'valid' | 'mismatch' | 'unchecked';
  validationDetail?: string;
}

interface ActiveOrder {
  user_id: string;
  media_sites: { price: number } | null;
}

interface PendingRequest {
  id: string;
  user_id: string;
  media_sites: { price: number } | null;
  hasOrderRequest: boolean;
}

interface CompletedOrder {
  user_id: string;
  media_sites: { price: number } | null;
}

interface PendingWithdrawal {
  user_id: string;
  amount_cents: number;
  withdrawal_method: string;
}

export interface AdminCreditInput {
  creditsData: { user_id: string; credits: number }[];
  profilesData: { id: string; email: string | null }[];
  agencyUserIds: Set<string | null>;
  transactionsData: (CreditTransaction & { user_id: string })[];
  activeOrders: ActiveOrder[];
  pendingRequests: PendingRequest[];
  completedOrders: CompletedOrder[];
  pendingWithdrawals: PendingWithdrawal[];
}

/**
 * Calculate credits for ALL users at once (admin bulk view).
 * Uses the SAME logic as useAvailableCredits but for multiple users.
 */
export function calculateAdminUserCredits(input: AdminCreditInput): AdminUserCredit[] {
  const {
    creditsData, profilesData, agencyUserIds, transactionsData,
    activeOrders, pendingRequests, completedOrders, pendingWithdrawals,
  } = input;

  const emailMap = new Map<string, string | null>();
  profilesData.forEach(p => emailMap.set(p.id, p.email));

  // Group transactions by user
  const txByUser = new Map<string, (CreditTransaction & { user_id: string })[]>();
  transactionsData.forEach(tx => {
    const list = txByUser.get(tx.user_id) || [];
    list.push(tx);
    txByUser.set(tx.user_id, list);
  });

  // Locked from active orders per user
  const lockedFromOrdersMap = new Map<string, number>();
  activeOrders.forEach(o => {
    const price = o.media_sites?.price || 0;
    lockedFromOrdersMap.set(o.user_id, (lockedFromOrdersMap.get(o.user_id) || 0) + price);
  });

  // Locked from pending requests per user (only those with CLIENT_ORDER_REQUEST)
  const lockedFromRequestsMap = new Map<string, number>();
  pendingRequests.forEach(r => {
    if (r.hasOrderRequest) {
      const price = r.media_sites?.price || 0;
      lockedFromRequestsMap.set(r.user_id, (lockedFromRequestsMap.get(r.user_id) || 0) + price);
    }
  });

  // Completed orders: total spent and count per user
  const totalSpentMap = new Map<string, number>();
  const purchaseOrdersMap = new Map<string, number>();
  completedOrders.forEach(o => {
    const price = o.media_sites?.price || 0;
    totalSpentMap.set(o.user_id, (totalSpentMap.get(o.user_id) || 0) + price);
    purchaseOrdersMap.set(o.user_id, (purchaseOrdersMap.get(o.user_id) || 0) + 1);
  });

  // Pending withdrawals by method (amount_cents now stores credits)
  const pendingBankMap = new Map<string, number>();
  const pendingCryptoMap = new Map<string, number>();
  pendingWithdrawals.forEach(w => {
    const credits = w.amount_cents || 0;
    if (w.withdrawal_method === 'bank') {
      pendingBankMap.set(w.user_id, (pendingBankMap.get(w.user_id) || 0) + credits);
    } else if (w.withdrawal_method === 'usdt') {
      pendingCryptoMap.set(w.user_id, (pendingCryptoMap.get(w.user_id) || 0) + credits);
    }
  });

  return creditsData.map(credit => {
    const userId = credit.user_id;
    const userTxs = txByUser.get(userId) || [];

    // Use the SAME shared formulas as user-side
    const totalBalance = calculateTotalBalance(userTxs);
    const { earnedCredits, purchasedOnline, purchasedOffline } = categoriseTransactions(userTxs);
    const withdrawalInfo = calculateWithdrawals(userTxs);
    const creditsWithdrawn = withdrawalInfo.completed;
    const creditsInWithdrawals = withdrawalInfo.locked;

    const lockedFromOrders = lockedFromOrdersMap.get(userId) || 0;
    const lockedFromRequests = lockedFromRequestsMap.get(userId) || 0;
    const totalLocked = lockedFromOrders + lockedFromRequests;

    const available = calculateAvailableCredits(
      totalBalance, lockedFromOrders, lockedFromRequests, creditsInWithdrawals, creditsWithdrawn
    );

    // Deductions & refunded
    let deductions = 0;
    let refunded = 0;
    let publishSpent = 0;
    let rawTxSum = 0;
    const withdrawalTypesSet = new Set(WITHDRAWAL_TYPES);
    const outgoingExcludedSet = new Set(['locked', 'locked_superseded', 'offer_accepted', 'offer_superseded', 'order', 'order_accepted']);
    userTxs.forEach(tx => {
      // rawTxSum mirrors the DB trigger: incoming (excl unlocked) - outgoing (excl lock types)
      if (withdrawalTypesSet.has(tx.type)) {
        // skip withdrawal types entirely
      } else if (tx.amount > 0 && tx.type !== 'unlocked') {
        rawTxSum += tx.amount;
      } else if (tx.amount < 0 && !outgoingExcludedSet.has(tx.type)) {
        rawTxSum += tx.amount;
      }
      if (tx.type === 'admin_deduct') deductions += Math.abs(tx.amount);
      if (tx.type === 'refund' && tx.amount > 0) refunded += tx.amount;
      if (tx.type === 'publish') publishSpent += Math.abs(tx.amount);
    });

    const b2bDeliveryOrders = userTxs.filter(t => t.type === 'order_payout' && t.description && t.description.startsWith('Earnings from completed order')).length;
    const instantPublishDeliveryOrders = userTxs.filter(t => t.type === 'order_payout' && (!t.description || !t.description.startsWith('Earnings from completed order'))).length;
    const instantPublishOrders = userTxs.filter(t => t.type === 'publish').length;
    const purchaseOrders = purchaseOrdersMap.get(userId) || 0;

    // Split earnings into B2B vs Instant Publishing
    const b2bEarnings = userTxs
      .filter(t => t.type === 'order_payout' && t.description && t.description.startsWith('Earnings from completed order'))
      .reduce((sum, t) => sum + t.amount, 0);
    const instantPublishingEarnings = earnedCredits - b2bEarnings;

    // Usage spending (type === 'usage')
    const usageSpent = userTxs
      .filter(t => t.type === 'usage')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    return {
      user_id: userId,
      email: emailMap.get(userId) || null,
      isAgency: agencyUserIds.has(userId),
      totalCredits: totalBalance,
      lockedFromOrders,
      lockedFromRequests,
      locked: totalLocked,
      available,
      purchased: purchasedOnline + purchasedOffline,
      purchasedOnline,
      purchasedInvoice: purchasedOffline,
      earned: earnedCredits,
      b2bEarnings,
      instantPublishingEarnings,
      deductions,
      refunded,
      withdrawn: creditsWithdrawn,
      lockedFromWithdrawals: creditsInWithdrawals,
      pendingBankWithdrawals: pendingBankMap.get(userId) || 0,
      pendingCryptoWithdrawals: pendingCryptoMap.get(userId) || 0,
      orders: purchaseOrders + b2bDeliveryOrders + instantPublishOrders + instantPublishDeliveryOrders,
      purchaseOrders,
      deliveryOrders: b2bDeliveryOrders,
      instantPublishOrders,
      instantPublishDeliveryOrders,
      publishSpent,
      usageSpent,
      totalSpent: (totalSpentMap.get(userId) || 0) + publishSpent + usageSpent,
      dbCredits: credit.credits,
      rawTxSum,
      validationStatus: 'unchecked' as const,
    };
  });
}

/**
 * Recalculate a single user's credits using the same shared logic.
 */
export function recalculateSingleUser(
  userTxs: CreditTransaction[],
  activeOrders: ActiveOrder[],
  pendingRequests: PendingRequest[],
  dbCreditsValue: number,
): Partial<AdminUserCredit> {
  const totalBalance = calculateTotalBalance(userTxs);
  const withdrawalInfo = calculateWithdrawals(userTxs);
  const creditsWithdrawn = withdrawalInfo.completed;
  const creditsInWithdrawals = withdrawalInfo.locked;

  const lockedFromOrders = activeOrders.reduce((sum, o) => sum + (o.media_sites?.price || 0), 0);
  const lockedFromRequests = pendingRequests
    .filter(r => r.hasOrderRequest)
    .reduce((sum, r) => sum + (r.media_sites?.price || 0), 0);
  const totalLocked = lockedFromOrders + lockedFromRequests;

  const available = calculateAvailableCredits(
    totalBalance, lockedFromOrders, lockedFromRequests, creditsInWithdrawals, creditsWithdrawn
  );

  let rawTxSum = 0;
  const withdrawalTypesSet = new Set(WITHDRAWAL_TYPES);
  const outgoingExcludedSet = new Set(['locked', 'locked_superseded', 'offer_accepted', 'offer_superseded', 'order', 'order_accepted']);
  userTxs.forEach(tx => {
    if (withdrawalTypesSet.has(tx.type)) {
      // skip
    } else if (tx.amount > 0 && tx.type !== 'unlocked') {
      rawTxSum += tx.amount;
    } else if (tx.amount < 0 && !outgoingExcludedSet.has(tx.type)) {
      rawTxSum += tx.amount;
    }
  });

  const isValid = rawTxSum === dbCreditsValue;

  return {
    totalCredits: totalBalance,
    locked: totalLocked,
    lockedFromOrders,
    lockedFromRequests,
    lockedFromWithdrawals: creditsInWithdrawals,
    available,
    dbCredits: dbCreditsValue,
    rawTxSum,
    validationStatus: isValid ? 'valid' : 'mismatch',
    validationDetail: isValid ? undefined : `DB: ${dbCreditsValue}, Tx Sum: ${rawTxSum}, Diff: ${dbCreditsValue - rawTxSum}`,
  };
}
