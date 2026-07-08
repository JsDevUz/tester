import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { schools, schoolMembers, users, courses, groups, groupMembers, monthlyPayments } from '../db/schema';
import { and, eq, ilike, isNull, ne, or } from 'drizzle-orm';
import { randomUUID } from 'crypto';

@Injectable()
export class SchoolsService {
  private async getOrCreateSchool(adminId: string) {
    let school = await db.query.schools.findFirst({ where: eq(schools.adminId, adminId) });
    if (!school) {
      [school] = await db.insert(schools).values({ adminId, inviteToken: randomUUID() }).returning();
    }
    return school;
  }

  async getSchool(adminId: string) {
    return this.getOrCreateSchool(adminId);
  }

  async updateSchool(adminId: string, data: { name?: string; description?: string }) {
    const school = await this.getOrCreateSchool(adminId);
    const [updated] = await db.update(schools).set(data).where(eq(schools.id, school.id)).returning();
    return updated;
  }

  async regenerateInviteToken(adminId: string) {
    const school = await this.getOrCreateSchool(adminId);
    const [updated] = await db
      .update(schools)
      .set({ inviteToken: randomUUID() })
      .where(eq(schools.id, school.id))
      .returning();
    return updated;
  }

  async getJoinPreview(token: string) {
    const school = await db.query.schools.findFirst({ where: eq(schools.inviteToken, token) });
    if (!school) throw new NotFoundException('Invite link not found');
    return { schoolName: school.name };
  }

  async joinByToken(token: string, studentId: string) {
    const school = await db.query.schools.findFirst({ where: eq(schools.inviteToken, token) });
    if (!school) throw new NotFoundException('Invite link not found');

    const existing = await db.query.schoolMembers.findFirst({
      where: and(eq(schoolMembers.schoolId, school.id), eq(schoolMembers.studentId, studentId)),
    });
    if (existing) throw new ConflictException('Already a member of this school');

    const [member] = await db
      .insert(schoolMembers)
      .values({ schoolId: school.id, studentId, role: 'student' })
      .returning();
    return member;
  }

  async findStaff(adminId: string) {
    const school = await this.getOrCreateSchool(adminId);
    const members = await db.query.schoolMembers.findMany({
      where: and(eq(schoolMembers.schoolId, school.id), ne(schoolMembers.role, 'student')),
      with: { student: true },
    });
    return members.map((m) => ({
      id: m.id,
      studentId: m.studentId,
      name: m.student.name,
      email: m.student.email,
      role: m.role,
    }));
  }

  async listAllStudents(adminId: string) {
    const school = await this.getOrCreateSchool(adminId);
    const members = await db.query.schoolMembers.findMany({
      where: and(eq(schoolMembers.schoolId, school.id), eq(schoolMembers.role, 'student')),
      with: { student: true },
    });

    const adminCourses = await db.query.courses.findMany({ where: eq(courses.adminId, adminId) });
    const courseIds = adminCourses.map((c) => c.id);
    const adminGroups = courseIds.length
      ? await db.query.groups.findMany({ where: (g, { inArray }) => inArray(g.courseId, courseIds) })
      : [];
    const groupIds = adminGroups.map((g) => g.id);

    return Promise.all(
      members.map(async (m) => {
        if (groupIds.length === 0) {
          return {
            id: m.studentId,
            name: m.student.name,
            phone: m.student.phone,
            productsCount: 0,
            totalPaid: 0,
          };
        }
        const memberships = await db.query.groupMembers.findMany({
          where: (gm, { inArray }) =>
            and(eq(gm.studentId, m.studentId), inArray(gm.groupId, groupIds), isNull(gm.removedAt)),
        });
        const memberIds = memberships.map((gm) => gm.id);
        let totalPaid = 0;
        if (memberIds.length > 0) {
          const payments = await db.query.monthlyPayments.findMany({
            where: (mp, { inArray }) => inArray(mp.groupMemberId, memberIds),
          });
          totalPaid = payments.reduce((sum, p) => sum + p.paidAmount, 0);
        }
        return {
          id: m.studentId,
          name: m.student.name,
          phone: m.student.phone,
          productsCount: memberships.length,
          totalPaid,
        };
      }),
    );
  }

  async searchStudents(adminId: string, query: string) {
    await this.getOrCreateSchool(adminId);
    if (!query.trim()) return [];
    const q = `%${query.trim()}%`;
    const rows = await db.query.users.findMany({
      where: and(eq(users.role, 'student'), or(ilike(users.name, q), ilike(users.phone, q))),
      limit: 20,
    });
    return rows.map((u) => ({ id: u.id, name: u.name, phone: u.phone, email: u.email }));
  }

  async addStaff(adminId: string, studentId: string, role: string) {
    const school = await this.getOrCreateSchool(adminId);
    const student = await db.query.users.findFirst({ where: eq(users.id, studentId) });
    if (!student) throw new BadRequestException('Student not found');

    const existing = await db.query.schoolMembers.findFirst({
      where: and(eq(schoolMembers.schoolId, school.id), eq(schoolMembers.studentId, studentId)),
    });
    if (existing) {
      const [updated] = await db
        .update(schoolMembers)
        .set({ role })
        .where(eq(schoolMembers.id, existing.id))
        .returning();
      return { ...updated, name: student.name, email: student.email };
    }

    const [created] = await db
      .insert(schoolMembers)
      .values({ schoolId: school.id, studentId, role })
      .returning();
    return { ...created, name: student.name, email: student.email };
  }

  private async assertStaffOwnership(memberId: string, adminId: string) {
    const member = await db.query.schoolMembers.findFirst({ where: eq(schoolMembers.id, memberId) });
    if (!member) throw new NotFoundException('Staff member not found');
    const school = await db.query.schools.findFirst({
      where: and(eq(schools.id, member.schoolId), eq(schools.adminId, adminId)),
    });
    if (!school) throw new NotFoundException('Staff member not found');
  }

  async removeStaff(memberId: string, adminId: string) {
    await this.assertStaffOwnership(memberId, adminId);
    await db.delete(schoolMembers).where(eq(schoolMembers.id, memberId));
  }
}
