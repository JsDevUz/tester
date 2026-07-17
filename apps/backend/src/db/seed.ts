import { db } from './index';
import { users } from './schema';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';

async function seed() {
  const phone = process.env.SUPER_ADMIN_PHONE?.replace(/\D/g, '');
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const name = process.env.SUPER_ADMIN_NAME ?? 'Super Admin';

  if (!phone || !password) {
    throw new Error('SUPER_ADMIN_PHONE and SUPER_ADMIN_PASSWORD must be set in .env');
  }

  const existing = await db.query.users.findFirst({ where: eq(users.phone, phone) });

  if (existing) {
    console.log(`Super admin already exists: ${phone}`);
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await db.insert(users).values({ phone, passwordHash, name, role: 'super' }).returning();
  console.log(`Super admin created: ${phone}`);
  process.exit(0);
}

seed().catch((e) => { console.error(e); process.exit(1); });
