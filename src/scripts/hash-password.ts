import { hashPassword } from "../auth/password.ts";

const password = process.argv[2];

if (!password) {
  console.error('Usage: npm run hash-password -- "your-password"');
  process.exit(1);
}

const hash = await hashPassword(password);

console.log(hash);
console.error("");
console.error("Add this to .env.local (keep the quotes off, the value is safe as-is):");
console.error("");
console.error(`ADMIN_PASSWORD_HASH=${hash}`);
