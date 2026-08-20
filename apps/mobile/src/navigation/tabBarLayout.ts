/**
 * The tab bar floats above the content as a detached pill rather than sitting flush against
 * the bottom edge, so it no longer reserves layout space of its own. Scrollable tab screens
 * have to add this much bottom padding, otherwise their last row ends up underneath it.
 *
 * Covers the bar's height plus the gap it leaves below itself.
 */
export const TAB_BAR_CLEARANCE = 88;
