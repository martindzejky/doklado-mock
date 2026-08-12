const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** BEHAVIOUR.md Issuing an invoice: 20-character mixed-case alphanumeric ids. */
export function firestoreId(random: () => number = Math.random): string {
  let id = '';
  for (let i = 0; i < 20; i++) {
    id += ALPHABET[Math.floor(random() * ALPHABET.length)];
  }
  return id;
}
