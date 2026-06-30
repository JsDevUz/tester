import { db } from './index';
import { admins } from './schema';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';

async function seed() {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const name = process.env.SUPER_ADMIN_NAME ?? 'Super Admin';

  if (!email || !password) {
    throw new Error('SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD must be set in .env');
  }

  const existing = await db.query.admins.findFirst({
    where: eq(admins.email, email),
  });

  if (existing) {
    console.log(`Super admin already exists: ${email}`);
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await db.insert(admins).values({ email, passwordHash, name, role: 'super' });
  console.log(`Super admin created: ${email}`);
  process.exit(0);
}

seed().catch((e) => { console.error(e); process.exit(1); });
