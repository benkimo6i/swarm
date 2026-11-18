// Keep the last two words of a piece of copy together, so a line never ends
// up holding a single orphaned word (CSS text-wrap: pretty does the same where
// it's supported; this covers the rest)
export const keepLastWords = (text) => text.replace(/ (\S+)\s*$/, "\u00a0$1");
