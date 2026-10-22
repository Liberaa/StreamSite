// Small formatting helpers, exposed to every EJS view through app.locals.

const compactFormatter = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const relativeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const TIME_UNITS = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/** "Pixel Paula" -> "PP", "lukas" -> "LU". */
export function initials(name) {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const letters = words.length > 1
    ? [Array.from(words[0])[0], Array.from(words[1])[0]]
    : Array.from(words[0]).slice(0, 2);
  return letters.join('').toUpperCase();
}

/** 1234 -> "1.2K" */
export function compactNumber(value) {
  return compactFormatter.format(value ?? 0);
}

/** A past date -> "3 days ago". */
export function timeAgo(date) {
  if (!date) return '';
  const seconds = Math.round((new Date(date).getTime() - Date.now()) / 1000);
  for (const [unit, unitSeconds] of TIME_UNITS) {
    if (Math.abs(seconds) >= unitSeconds) {
      return relativeFormatter.format(Math.round(seconds / unitSeconds), unit);
    }
  }
  return 'just now';
}

/**
 * Text color that stays readable on top of a creator's accent color:
 * dark text on light colors (yellow, cyan...), white text on dark ones.
 */
export function onAccent(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex ?? '')) return '#ffffff';
  const [r, g, b] = [1, 3, 5].map((start) => {
    const channel = parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.22 ? '#0e0e12' : '#ffffff';
}

/** plural(1, 'follower') -> "follower", plural(3, 'follower') -> "followers" */
export function plural(count, singular, pluralForm = `${singular}s`) {
  return count === 1 ? singular : pluralForm;
}
