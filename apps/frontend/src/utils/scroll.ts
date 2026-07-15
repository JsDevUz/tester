export function resetPageScroll() {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  document.scrollingElement?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

export function schedulePageScrollReset() {
  resetPageScroll();
  let timeout: number | undefined;
  const frame = window.requestAnimationFrame(() => {
    resetPageScroll();
    timeout = window.setTimeout(resetPageScroll, 80);
  });
  return () => {
    window.cancelAnimationFrame(frame);
    if (timeout !== undefined) window.clearTimeout(timeout);
  };
}
