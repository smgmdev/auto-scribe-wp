// Guard to prevent sidebar refetches from overwriting optimistic notification count updates.
// When the chat input is focused and counts are decremented optimistically,
// we record the timestamp. Sidebar realtime handlers check this before refetching.

let lastOptimisticUpdate = 0;

export const setNotificationGuard = () => {
  lastOptimisticUpdate = Date.now();
};

export const isNotificationGuarded = (): boolean => {
  return Date.now() - lastOptimisticUpdate < 3000; // 3-second guard window
};
