import { Injectable, ConflictException, BadRequestException } from '@nestjs/common';
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';

const USER_ROLES = ['student', 'teacher', 'super', 'curator'] as const;
type UserRole = typeof USER_ROLES[number];

@Injectable()
export class AdminsService {
  async findAll() {
    const rows = await db.query.users.findMany({
      columns: { passwordHash: false },
      orderBy: (u, { asc }) => [asc(u.createdAt)],
    });
    return rows.map((u) => ({ ...u, name: u.displayName, avatarUrl: u.displayAvatarUrl }));
  }

  async create(phoneInput: string, password: string, name: string) {
    const phone = phoneInput.replace(/\D/g, '');
    const existing = await db.query.users.findFirst({ where: eq(users.phone, phone) });
    if (existing) throw new ConflictException('Telefon raqami band');

    const passwordHash = await bcrypt.hash(password, 10);
    const [user] = await db
      .insert(users)
      .values({ phone, passwordHash, name, role: 'teacher' })
      .returning({ id: users.id, name: users.displayName, role: users.role, phone: users.phone });
    return user;
  }

  async updateRole(id: string, role: UserRole, requestingUserId: string) {
    if (!USER_ROLES.includes(role)) throw new BadRequestException('Invalid role');
    if (id === requestingUserId && role !== 'super') {
      throw new BadRequestException('Cannot remove your own super role');
    }

    const [user] = await db
      .update(users)
      .set({ role })
      .where(eq(users.id, id))
      .returning({ id: users.id, name: users.displayName, role: users.role, phone: users.phone });

    if (!user) throw new BadRequestException('User not found');
    return user;
  }

  async remove(id: string, requestingAdminId: string) {
    if (id === requestingAdminId) throw new BadRequestException('Cannot delete yourself');
    await db.delete(users).where(eq(users.id, id));
  }
}
