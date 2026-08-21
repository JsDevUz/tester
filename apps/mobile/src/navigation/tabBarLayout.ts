/**
 * Breathing room at the bottom of a scrollable tab screen.
 *
 * The tab bar sits in the layout and reserves its own height, so this is only the gap that
 * keeps the last row off the bar's edge -- not clearance for the bar itself, as it was while
 * the bar floated above the content.
 */
export const TAB_BAR_CLEARANCE = 16;

/**
 * Tab icon size, taken from the web nav so the bar reads the same weight on both platforms.
 * The navigator's own `size` runs larger, which made the mobile icons look heavy beside the
 * web ones.
 */
export const TAB_ICON_SIZE = 19;
