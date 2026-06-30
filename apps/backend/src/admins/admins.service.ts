import { Injectable, ConflictException, BadRequestException } from '@nestjs/common';
import { db } from '../db';
import { admins } from '../db/schema';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AdminsService {
  async findAll() {
    return db.query.admins.findMany({
      columns: { passwordHash: false },
      orderBy: (a, { asc }) => [asc(a.createdAt)],
    });
  }

  async create(email: string, password: string, name: string) {
    const existing = await db.query.admins.findFirst({ where: eq(admins.email, email) });
    if (existing) throw new ConflictException('Email already in use');

    const passwordHash = await bcrypt.hash(password, 10);
    const [admin] = await db
      .insert(admins)
      .values({ email, passwordHash, name, role: 'admin' })
      .returning({ id: admins.id, email: admins.email, name: admins.name, role: admins.role });
    return admin;
  }

  async remove(id: string, requestingAdminId: string) {
    if (id === requestingAdminId) throw new BadRequestException('Cannot delete yourself');
    await db.delete(admins).where(eq(admins.id, id));
  }
}
