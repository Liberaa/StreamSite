// Helpers for reading submitted form fields safely.

/** A trimmed string, or '' when the field is missing or not a string. */
export function formText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** Repeated fields arrive as a string, an array, or not at all. Always returns an array. */
export function formList(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/** The first human-readable message from a Mongoose ValidationError. */
export function firstValidationMessage(error) {
  const first = Object.values(error.errors ?? {})[0];
  return first?.message ?? 'Please check the form and try again.';
}
