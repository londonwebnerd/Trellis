/**
 * Remembers when the last drag ended, so the click that fires at the end of
 * a drag gesture doesn't also open the tile editor.
 */
export const dragClock = { endedAt: 0 };
