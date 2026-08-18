import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import 'dotenv/config';

// connect_timeout'siz postgres-js ba'zi tarmoq sharoitlarida (masalan
// container restart paytida socket "yarim ochiq" holatga tushib qolsa)
// yangi ulanish uchun abadiy kutishi mumkin — bu graceful shutdown'dagi
// so'nggi saqlashni ham cheksiz osib qo'yadi.
const client = postgres(process.env.DATABASE_URL!, { connect_timeout: 10 });
export const db = drizzle(client, { schema });
