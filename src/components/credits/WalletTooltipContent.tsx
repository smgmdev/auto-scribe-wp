interface WalletTooltipContentProps {
  totalEarnings: number;
  b2bEarnings: number;
  instantPublishingEarnings: number;
  completedWithdrawals: number;
  pendingBankWithdrawals: number;
  pendingCryptoWithdrawals: number;
  lockedInOrderRequests?: number;
  lockedInOrders?: number;
  lockedInWithdrawals?: number;
  walletBalance: number;
  showLocked?: boolean;
  showPurchasedSpent?: boolean;
}

const fmt = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const WalletTooltipContent = ({
  totalEarnings,
  b2bEarnings,
  instantPublishingEarnings,
  completedWithdrawals,
  pendingBankWithdrawals,
  pendingCryptoWithdrawals,
  lockedInOrderRequests = 0,
  lockedInOrders = 0,
  lockedInWithdrawals = 0,
  walletBalance,
  showLocked = true,
  showPurchasedSpent = true,
}: WalletTooltipContentProps) => {
  const totalPending = pendingBankWithdrawals + pendingCryptoWithdrawals;

  return (
    <div className="space-y-1">
      <div className="flex justify-between gap-4">
        <span className="text-white/70">Total Earnings:</span>
        <span className="font-semibold text-green-400">{fmt(totalEarnings)}</span>
      </div>
      <div className="flex justify-between gap-4 pl-2">
        <span className="text-white/50 text-xs">B2B Media Sales:</span>
        <span className="text-white/50 text-xs">{fmt(b2bEarnings)}</span>
      </div>
      <div className="flex justify-between gap-4 pl-2">
        <span className="text-white/50 text-xs">Instant Publishing Sales:</span>
        <span className="text-white/50 text-xs">{fmt(instantPublishingEarnings)}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-white/70">Total Withdrawals:</span>
        <span className="font-semibold text-red-400">{completedWithdrawals > 0 ? `-${fmt(completedWithdrawals)}` : '$0.00'}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-white/70">Pending Withdrawals:</span>
        <span className="font-semibold text-amber-400">
          {totalPending > 0 ? fmt(totalPending) : '0'}
        </span>
      </div>
      <div className="flex justify-between gap-4 pl-3">
        <span className="text-white/50 text-xs">USDT:</span>
        <span className="text-xs font-medium text-amber-400/80">
          {pendingCryptoWithdrawals > 0 ? fmt(pendingCryptoWithdrawals) : '0'}
        </span>
      </div>
      <div className="flex justify-between gap-4 pl-3">
        <span className="text-white/50 text-xs">Bank Transfer:</span>
        <span className="text-xs font-medium text-amber-400/80">
          {pendingBankWithdrawals > 0 ? fmt(pendingBankWithdrawals) : '0'}
        </span>
      </div>
      {showLocked && (
        <>
          <div className="flex justify-between gap-4">
            <span className="text-white/70">Locked in Order Requests:</span>
            <span className="font-semibold text-amber-400">{fmt(lockedInOrderRequests)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-white/70">Locked in Orders:</span>
            <span className="font-semibold text-amber-400">{fmt(lockedInOrders)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-white/70">Locked in Withdrawals:</span>
            <span className="font-semibold text-amber-400">{fmt(lockedInWithdrawals)}</span>
          </div>
        </>
      )}
      {showPurchasedSpent && (
        <>
          <div className="flex justify-between gap-4">
            <span className="text-white/70">Total Purchased:</span>
            <span className="text-white/50 text-xs">Not Included</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-white/70">Total Spent:</span>
            <span className="text-white/50 text-xs">Not Included</span>
          </div>
        </>
      )}
      <div className="flex justify-between gap-4 pt-1 border-t border-white/20">
        <span className="text-white/70">Wallet Balance:</span>
        <span className="font-semibold">{fmt(walletBalance)}</span>
      </div>
    </div>
  );
};
