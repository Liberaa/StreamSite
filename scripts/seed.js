// Adds a few demo creators so the homepage is not empty during development.
// Run with: npm run seed   (safe to run again: existing usernames are skipped)
import bcrypt from 'bcryptjs';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { config } from '../src/config/index.js';
import { User } from '../src/models/User.js';
import { generateStreamKey } from '../src/utils/streamKey.js';

const DEMO_PASSWORD = 'password123';

const creators = [
  {
    username: 'pixelpaula',
    displayName: 'Pixel Paula',
    accentColor: '#f472b6',
    bio: 'Digital painter and illustrator. Cozy art streams where I explain every brushstroke.\nCommissions open!',
    links: [{ label: 'Portfolio', url: 'https://example.com/paula' }],
    stream: { title: 'Painting a forest spirit, chill vibes', category: 'art' },
  },
  {
    username: 'chefmarco',
    displayName: 'Chef Marco',
    accentColor: '#f59e0b',
    bio: 'Home cook from Naples. We make dinner together, live. Bring your questions and your appetite.',
    stream: { title: 'Fresh pasta from scratch', category: 'cooking' },
  },
  {
    username: 'lofilena',
    displayName: 'Lofi Lena',
    accentColor: '#22d3ee',
    bio: 'Producer making lofi beats live. Request a vibe in chat and we build the track from zero.',
    stream: { title: 'Beats to study to, built live', category: 'music' },
  },
  {
    username: 'devdan',
    displayName: 'Dev Dan',
    accentColor: '#34d399',
    bio: 'Building an indie game in JavaScript, one bug at a time. Beginners welcome, ask anything.',
    stream: { title: 'Day 42: adding multiplayer (what could go wrong?)', category: 'coding' },
  },
  {
    username: 'trailtove',
    displayName: 'Trail Tove',
    accentColor: '#ef4444',
    bio: 'Ultra runner streaming from the trails of northern Sweden. Snow, sweat and fika breaks.',
    stream: { title: 'Sunrise run in Abisko', category: 'fitness' },
  },
];

if (config.isProduction) {
  console.error('Refusing to add demo data in production.');
  process.exit(1);
}

await connectDatabase();
const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
let created = 0;

for (const creator of creators) {
  if (await User.exists({ username: creator.username })) continue;
  await User.create({
    ...creator,
    email: `${creator.username}@example.com`,
    passwordHash,
    streamKey: generateStreamKey(),
  });
  created += 1;
}

console.log(`Added ${created} demo creators (${creators.length - created} already existed).`);
console.log(`Log in as any of them with the password "${DEMO_PASSWORD}", e.g. username "pixelpaula".`);
await disconnectDatabase();
