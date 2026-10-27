// One-off: dumps the old Firebase data (rankings, play sessions, users) to a JSON file that
// `fliper-api import <file>` loads into Postgres.
//
//   GOOGLE_APPLICATION_CREDENTIALS=service-account.json node export.mjs [out.json]
//
// The service account key comes from Firebase console -> Project settings -> Service accounts.
// Chat is not exported: it is short-lived by nature.
import { writeFileSync } from 'node:fs';
import admin from 'firebase-admin';

admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();
const out = process.argv[2] ?? 'firestore-export.json';

const iso = (t) => (t?.toDate ? t.toDate().toISOString() : typeof t === 'string' ? t : new Date(0).toISOString());

const users = [];
let pageToken;
do {
  const page = await admin.auth().listUsers(1000, pageToken);
  for (const u of page.users) {
    // The Google account id is what links these records to a Google sign-in on the new server.
    const google = u.providerData.find((p) => p.providerId === 'google.com');
    users.push({ uid: u.uid, googleSub: google?.uid ?? null, email: u.email ?? null, name: u.displayName ?? null });
  }
  pageToken = page.pageToken;
} while (pageToken);

const entries = [];
for (const doc of (await db.collectionGroup('entries').get()).docs) {
  const board = doc.ref.parent.parent; // leaderboards/{game}
  if (board?.parent.id !== 'leaderboards') continue;
  const d = doc.data();
  entries.push({ game: board.id, id: doc.id, player: d.player ?? doc.id, name: d.name, score: d.score, details: d.details ?? {}, date: iso(d.date) });
}

const sessions = (await db.collection('telemetry_sessions').get()).docs.map((doc) => {
  const d = doc.data();
  return { id: doc.id, player: d.player, name: d.name ?? '', gameId: d.gameId, durationSec: d.durationSec, score: d.score ?? 0, startedAt: d.startedAt ?? iso(d.date), date: iso(d.date) };
});

writeFileSync(out, JSON.stringify({ users, entries, sessions }));
console.log(`${out}: ${users.length} users, ${entries.length} entries, ${sessions.length} sessions`);
