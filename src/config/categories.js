// Stream categories shown in the dashboard and on channel cards.
// The id is stored in the database, so add new ones but never rename an id.
export const CATEGORIES = Object.freeze([
  { id: 'just-chatting', name: 'Just Chatting' },
  { id: 'gaming', name: 'Gaming' },
  { id: 'music', name: 'Music' },
  { id: 'art', name: 'Art & Design' },
  { id: 'coding', name: 'Software & Coding' },
  { id: 'cooking', name: 'Food & Cooking' },
  { id: 'fitness', name: 'Sports & Fitness' },
  { id: 'education', name: 'Education' },
  { id: 'irl', name: 'IRL' },
]);

export const DEFAULT_CATEGORY = 'just-chatting';
export const CATEGORY_IDS = CATEGORIES.map((category) => category.id);

export function categoryName(id) {
  return CATEGORIES.find((category) => category.id === id)?.name ?? 'Other';
}
