// Badging API — not in TS's lib.dom yet, so it's accessed via a loose cast.
type BadgeNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

export function isBadgingSupported(): boolean {
  return typeof navigator !== "undefined" && "setAppBadge" in navigator;
}

export function setAppBadgeCount(count: number): void {
  if (!isBadgingSupported()) return;
  const nav = navigator as BadgeNavigator;
  if (count > 0) {
    nav.setAppBadge?.(count).catch(() => {});
  } else {
    nav.clearAppBadge?.().catch(() => {});
  }
}
