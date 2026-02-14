/**
 * Shared credit calculation logic.
 * This is the SINGLE SOURCE OF TRUTH for credit balance formulas.
 * Used by: useAvailableCredits hook, AdminUsersView, and should mirror lock-order-credits edge function.
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
  const incomingCredits = transactions
    .filter(t => t.amount > 0 && !WITHDRAWAL_TYPES.includes(t.type) && t.type !== 'unlocked')
    .reduce((sum, t) => sum + t.amount, 0);

  const outgoingCredits = transactions
    .filter(t => t.amount < 0 && t.type !== 'locked' && t.type !== 'offer_accepted' && t.type !== 'order' && !WITHDRAWAL_TYPES.includes(t.type))
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  return incomingCredits - outgoingCredits;
}

export interface WithdrawalBreakdown {
  /** Currently locked withdrawal amount in cents */
  lockedCents: number;
  /** Completed withdrawal amount in cents */
  completedCents: number;
  /** Bank-specific locked cents */
  bankLockedCents: number;
  /** Crypto-specific locked cents */
  cryptoLockedCents: number;
}

/**
 * Calculate withdrawal amounts from transaction ledger.
 * Amounts are stored in cents in the transactions.
 */
export function calculateWithdrawals(transactions: CreditTransaction[]): WithdrawalBreakdown {
  let lockedCents = 0;
  let completedCents = 0;
  let bankLockedCents = 0;
  let cryptoLockedCents = 0;

  const withdrawalTxs = transactions.filter(t => WITHDRAWAL_TYPES.includes(t.type));
  for (const tx of withdrawalTxs) {
    const isBank = tx.description?.includes('Bank Transfer');
    const isCrypto = tx.description?.includes('USDT');

    if (tx.type === 'withdrawal_locked') {
      const amount = Math.abs(tx.amount);
      lockedCents += amount;
      if (isBank) bankLockedCents += amount;
      if (isCrypto) cryptoLockedCents += amount;
    } else if (tx.type === 'withdrawal_unlocked') {
      const amount = Math.abs(tx.amount);
      lockedCents -= amount;
      if (isBank) bankLockedCents -= amount;
      if (isCrypto) cryptoLockedCents -= amount;
    } else if (tx.type === 'withdrawal_completed') {
      const amount = Math.abs(tx.amount);
      lockedCents -= amount;
      completedCents += amount;
      if (isBank) bankLockedCents -= amount;
      if (isCrypto) cryptoLockedCents -= amount;
    }
  }

  return {
    lockedCents: Math.max(0, lockedCents),
    completedCents,
    bankLockedCents: Math.max(0, bankLockedCents),
    cryptoLockedCents: Math.max(0, cryptoLockedCents),
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
