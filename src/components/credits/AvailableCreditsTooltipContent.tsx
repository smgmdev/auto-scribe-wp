interface AvailableCreditsTooltipContentProps {
  earnedCredits: number;
  creditsWithdrawn: number;
  withdrawalsByBank: number;
  withdrawalsByCrypto: number;
  creditsInPendingRequests: number;
  creditsInOrders: number;
  creditsInWithdrawals?: number;
  totalPurchased: number;
  purchasedOnline?: number;
  purchasedOffline?: number;
  totalSpent: number;
  b2bSpent?: number;
  publishSpent?: number;
  availableCredits: number;
  isAgency: boolean;
}

export const AvailableCreditsTooltipContent = ({
  earnedCredits,
  creditsWithdrawn,
  withdrawalsByBank,
  withdrawalsByCrypto,
  creditsInPendingRequests,
  creditsInOrders,
  creditsInWithdrawals = 0,
  totalPurchased,
  purchasedOnline,
  purchasedOffline,
  totalSpent,
  b2bSpent = 0,
  publishSpent = 0,
  availableCredits,
  isAgency,
}: AvailableCreditsTooltipContentProps) => {
  return (
    <div className="space-y-1">
      <div className="flex justify-between gap-4">
        <span className="text-white/70">Earnings:</span>
        {isAgency ? (
          <span className="font-semibold text-green-400">{earnedCredits.toLocaleString()}</span>
        ) : (
          <span className="text-white/50 text-xs">available for agency only</span>
        )}
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-white/70">Withdrawals:</span>
        {isAgency ? (
          <span className="font-semibold text-red-400">{creditsWithdrawn > 0 ? `-${Math.round(creditsWithdrawn).toLocaleString()}` : '0'}</span>
        ) : (
          <span className="text-white/50 text-xs">available for agency only</span>
        )}
      </div>
      {isAgency && (
        <>
          <div className="flex justify-between gap-4">
            <span className="text-white/70">Pending Withdrawals:</span>
            <span className="font-semibold text-amber-400">
              {(withdrawalsByBank + withdrawalsByCrypto) > 0
                ? `$${(withdrawalsByBank + withdrawalsByCrypto).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : '0'}
            </span>
          </div>
          <div className="flex justify-between gap-4 pl-3">
            <span className="text-white/50 text-xs">USDT:</span>
            <span className="text-xs font-medium text-amber-400/80">
              {withdrawalsByCrypto > 0
                ? `$${withdrawalsByCrypto.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : '0'}
            </span>
          </div>
          <div className="flex justify-between gap-4 pl-3">
            <span className="text-white/50 text-xs">Bank Transfer:</span>
            <span className="text-xs font-medium text-amber-400/80">
              {withdrawalsByBank > 0
                ? `$${withdrawalsByBank.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : '0'}
            </span>
          </div>
        </>
      )}
      <div className="flex justify-between gap-4">
        <span className="text-white/70">Locked in Offer Requests:</span>
        <span className="font-semibold text-amber-400">{Math.round(creditsInPendingRequests).toLocaleString()}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-white/70">Locked in Orders:</span>
        <span className="font-semibold text-amber-400">{Math.round(creditsInOrders).toLocaleString()}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-white/70">Locked in Withdrawal:</span>
        <span className="font-semibold text-amber-400">{Math.round(creditsInWithdrawals).toLocaleString()}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-white/70">Total Purchased:</span>
        <span className="font-semibold text-green-400">{totalPurchased.toLocaleString()}</span>
      </div>
      <div className="flex justify-between gap-4 pl-3">
        <span className="text-white/50 text-xs">Online via platform:</span>
        <span className="text-xs font-medium text-green-400/80">{(purchasedOnline ?? totalPurchased).toLocaleString()}</span>
      </div>
      <div className="flex justify-between gap-4 pl-3">
        <span className="text-white/50 text-xs">Offline via invoice:</span>
        <span className="text-xs font-medium text-green-400/80">{(purchasedOffline ?? 0).toLocaleString()}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-white/70">Total Spent:</span>
        <span className="font-semibold text-red-400">{totalSpent > 0 ? `-${totalSpent.toLocaleString()}` : '0'}</span>
      </div>
      <div className="flex justify-between gap-4 pl-3">
        <span className="text-white/50 text-xs">B2B Media Buying:</span>
        <span className="text-xs font-medium text-red-400/80">{b2bSpent > 0 ? `-${b2bSpent.toLocaleString()}` : '0'}</span>
      </div>
      <div className="flex justify-between gap-4 pl-3">
        <span className="text-white/50 text-xs">Instant Publishing:</span>
        <span className="text-xs font-medium text-red-400/80">{publishSpent > 0 ? `-${publishSpent.toLocaleString()}` : '0'}</span>
      </div>
      <div className="flex justify-between gap-4 pt-2 mt-1 border-t border-white/20">
        <span className="text-white/70">Total Available Credits:</span>
        <span className="font-semibold text-green-400">{availableCredits.toLocaleString()}</span>
      </div>
    </div>
  );
};
