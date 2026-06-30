import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { db } from '../db';
import { admins } from '../db/schema';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(private jwtService: JwtService) {}

  async login(email: string, password: string) {
    const admin = await db.query.admins.findFirst({ where: eq(admins.email, email) });
    if (!admin) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const token = this.jwtService.sign({
      sub: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    });

    return {
      access_token: token,
      admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
    };
  }
}
