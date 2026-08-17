import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Inbox, Plus, Users, X, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useCourseStore } from '../../stores/courseStore';
import { useSchoolStore } from '../../stores/schoolStore';
import { Breadcrumb } from './Breadcrumb';
import { CourseSidePanel } from './CourseSidePanel';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import type { ApiMonthlyPayment } from '../../api/payments';
import { UserAvatar } from '../UserAvatar';

interface CourseGroupsPageProps {
  courseId: string;
  onBackToList: () => void;
  onSelectContent: () => void;
  onSelectSettings: () => void;
  onSelectLaunch: () => void;
  onSelectClasses: () => void;
  onSelectChallenges: () => void;
}

const AVATAR_PALETTES = [
  'bg-gray-200 text-gray-700',
  'bg-amber-100 text-amber-600',
  'bg-teal-100 text-teal-600',
  'bg-rose-100 text-rose-600',
];

function paletteFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTES[hash % AVATAR_PALETTES.length];
}

export function CourseGroupsPage({ courseId, onBackToList, onSelectContent, onSelectSettings, onSelectLaunch, onSelectClasses, onSelectChallenges }: CourseGroupsPageProps) {
  const {
    courses, loadCourseDetails, addGroup, renameGroup, setGroupPaymentDay,
    removeStudentFromGroup, deleteGroup,
    setMemberForcedClosed, loadGroupPayments, assignCurator, demoteCurator,
  } = useCourseStore();
  const { staff, loaded: staffLoaded, loadStaff } = useSchoolStore();
  const course = courses.find((c) => c.id === courseId);

  useEffect(() => {
    if (courseId) void loadCourseDetails(courseId);
  }, [courseId, loadCourseDetails]);

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [innerTab, setInnerTab] = useState<'students' | 'settings'>('students');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [payments, setPayments] = useState<ApiMonthlyPayment[]>([]);
  const [studentPage, setStudentPage] = useState(1);

  const group = course && selectedGroupId ? course.groups.find((g) => g.id === selectedGroupId) : undefined;

  useEffect(() => {
    setStudentPage(1);
    if (group && innerTab === 'settings') {
      void loadGroupPayments(group.id).then(setPayments);
      if (!staffLoaded) void loadStaff();
    }
  }, [group?.id, innerTab, loadGroupPayments, staffLoaded, loadStaff]);

  if (!course) return null;

  function handleCreateGroup() {
    if (!course) return;
    if (course.groups.length >= 4) return;
    void addGroup(courseId, `Guruh ${course.groups.length + 1}`)
      .then((newGroup) => {
        if (newGroup) {
          setSelectedGroupId(newGroup.id);
          setInnerTab('students');
        }
      })
      .catch((error: any) => {
        toast.error(error?.response?.data?.message ?? "Guruh yaratib bo'lmadi");
      });
  }

  function handleConfirmDeleteGroup() {
    if (!group) return;
    void deleteGroup(courseId, group.id);
    setSelectedGroupId(null);
    setConfirmDelete(false);
  }

  function handleRemoveCurator(memberId: string) {
    if (!group) return;
    void demoteCurator(courseId, group.id, memberId);
  }

  // ─── Holat B: guruh ichki ko'rinishi ───────────────────────────────
  if (group) {
    const students = group.members.filter((m) => m.role === 'student');
    const curators = group.members.filter((m) => m.role === 'curator');
    const studentPageCount = Math.max(1, Math.ceil(students.length / 7));
    const currentStudentPage = Math.min(studentPage, studentPageCount);
    const pageStudents = students.slice((currentStudentPage - 1) * 7, currentStudentPage * 7);

    return (
      <div className="min-h-screen p-3 sm:p-4 text-[var(--text-primary)]">
        <div className="flex min-h-full flex-col gap-3">
          <div className="px-1 py-1">
            <Breadcrumb
              items={[
                { label: 'Kurslar', onClick: onBackToList },
                { label: course.title, onClick: onSelectContent },
                { label: 'Guruhlar', onClick: () => setSelectedGroupId(null) },
                { label: group.name },
              ]}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row items-start">
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex gap-1.5 rounded-2xl bg-[var(--surface-bg)] p-1.5 shadow-xs">
                <button
                  type="button"
                  onClick={() => setInnerTab('students')}
                  className={`flex-1 rounded-xl py-2 text-xs font-bold transition-colors cursor-pointer ${
                    innerTab === 'students' ? 'bg-[var(--card-bg)] text-[var(--text-primary)] shadow-2xs' : 'text-[var(--text-secondary)] hover:bg-[var(--card-hover)]'
                  }`}
                >
                  O'quvchilar
                </button>
                <button
                  type="button"
                  onClick={() => setInnerTab('settings')}
                  className={`flex-1 rounded-xl py-2 text-xs font-bold transition-colors cursor-pointer ${
                    innerTab === 'settings' ? 'bg-[var(--card-bg)] text-[var(--text-primary)] shadow-2xs' : 'text-[var(--text-secondary)] hover:bg-[var(--card-hover)]'
                  }`}
                >
                  Sozlamalar
                </button>
              </div>

              {innerTab === 'students' ? (
                <div className="rounded-2xl bg-[var(--surface-bg)] p-4 sm:p-5 shadow-xs">
                  <div className="mb-4 flex items-center gap-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Barcha o'quvchilar</p>
                    <span className="inline-flex items-center justify-center rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white">
                      {students.length}
                    </span>
                  </div>

                  {students.length === 0 ? (
                    <div className="rounded-2xl bg-[var(--card-bg)] py-14 text-center">
                      <Users size={30} className="mx-auto mb-2 text-[var(--text-muted)] opacity-40" />
                      <p className="text-xs font-bold text-[var(--text-primary)]">O'quvchilar topilmadi</p>
                      <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                        Ular yuqoridagi havola orqali guruhga qo'shilgach paydo bo'ladi
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {pageStudents.map((m) => (
                        <div key={m.id} className="flex items-center gap-3 rounded-2xl bg-[var(--card-bg)] px-4 py-3">
                          <UserAvatar name={m.studentName} avatarUrl={m.studentAvatarUrl} className={`h-8 w-8 rounded-full text-xs font-bold ${paletteFor(m.id)}`} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-bold text-[var(--text-primary)]">{m.studentName}</p>
                            <p className="text-[11px] font-medium text-[var(--text-muted)] mt-0.5">{m.studentPhone ?? ''}</p>
                          </div>
                          {m.latestPaymentStatus && (
                            <span
                              className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                                m.latestPaymentStatus === 'paid'
                                  ? 'bg-emerald-500/10 text-emerald-500'
                                  : m.latestPaymentStatus === 'partial'
                                    ? 'bg-amber-500/10 text-amber-500'
                                    : m.latestPaymentStatus === 'debt'
                                      ? 'bg-red-500/10 text-red-500'
                                      : 'bg-[var(--surface-bg)] text-[var(--text-muted)]'
                              }`}
                            >
                              {m.latestPaymentStatus === 'paid'
                                ? "To'landi"
                                : m.latestPaymentStatus === 'partial'
                                  ? 'Qisman'
                                  : m.latestPaymentStatus === 'debt'
                                    ? 'Qarz'
                                    : 'Kutilmoqda'}
                            </span>
                          )}
                          <span className="shrink-0 rounded-lg bg-[var(--surface-bg)] px-2 py-1 text-[11px] font-semibold text-[var(--text-secondary)]">
                            {group.plans.find((p) => p.id === m.selectedPlanId)?.name ?? 'Tarifsiz'}
                          </span>
                          <button
                            type="button"
                            onClick={() => void setMemberForcedClosed(courseId, group.id, m.id, !m.forcedClosed)}
                            title={m.forcedClosed ? 'Ochish' : 'Majburiy yopish'}
                            className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors cursor-pointer ${
                              m.forcedClosed ? 'bg-red-500/10 text-red-600 hover:bg-red-500/20' : 'bg-[var(--surface-bg)] text-[var(--text-secondary)] hover:bg-[var(--card-hover)]'
                            }`}
                          >
                            {m.forcedClosed ? 'Yopiq' : 'Ochiq'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void removeStudentFromGroup(courseId, group.id, m.id)}
                            className="shrink-0 flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-red-500/10 hover:text-red-500 cursor-pointer"
                            aria-label="Guruhdan olib tashlash"
                          >
                            <X size={15} />
                          </button>
                        </div>
                      ))}
                      {studentPageCount > 1 && (
                        <div className="flex items-center justify-center gap-1.5 pt-3">
                          <button
                            type="button"
                            onClick={() => setStudentPage((page) => Math.max(1, page - 1))}
                            disabled={currentStudentPage === 1}
                            className="rounded-xl p-1.5 text-[var(--text-muted)] hover:bg-[var(--card-hover)] disabled:opacity-30 cursor-pointer"
                            aria-label="Oldingi sahifa"
                          >
                            <ChevronLeft size={16} />
                          </button>
                          {Array.from({ length: studentPageCount }, (_, index) => index + 1).map((page) => (
                            <button
                              key={page}
                              type="button"
                              onClick={() => setStudentPage(page)}
                              className={`h-7 w-7 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                                page === currentStudentPage
                                  ? 'bg-indigo-600 text-white'
                                  : 'text-[var(--text-secondary)] hover:bg-[var(--card-hover)]'
                              }`}
                            >
                              {page}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => setStudentPage((page) => Math.min(studentPageCount, page + 1))}
                            disabled={currentStudentPage === studentPageCount}
                            className="rounded-xl p-1.5 text-[var(--text-muted)] hover:bg-[var(--card-hover)] disabled:opacity-30 cursor-pointer"
                            aria-label="Keyingi sahifa"
                          >
                            <ChevronRight size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="rounded-2xl bg-[var(--surface-bg)] p-4 sm:p-5 shadow-xs">
                    <h3 className="mb-4 text-sm font-bold text-[var(--text-primary)]">Asosiy sozlamalar</h3>
                    <label className="mb-1.5 block text-xs font-bold text-[var(--text-primary)]">Guruh nomi</label>
                    <input
                      value={group.name}
                      onChange={(e) => void renameGroup(courseId, group.id, e.target.value)}
                      className="mb-4 w-full rounded-xl bg-[var(--card-bg)] py-2 px-3 text-xs font-medium text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
                    />

                    <label className="mb-1.5 block text-xs font-bold text-[var(--text-primary)]">Oylik to'lov kuni (har oyning qaysi sanasida)</label>
                    <select
                      value={group.paymentDay ?? 1}
                      onChange={(e) => void setGroupPaymentDay(courseId, group.id, parseInt(e.target.value, 10) || 1)}
                      className="mb-4 w-full rounded-xl bg-[var(--card-bg)] py-2 px-3 text-xs font-medium text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-indigo-500 transition-colors cursor-pointer"
                    >
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                        <option key={day} value={day}>
                          Har oyning {day}-sanasi
                        </option>
                      ))}
                    </select>

                    <div className="flex items-center gap-2 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-[var(--text-primary)]">Guruh chati</p>
                        <p className="text-[11px] font-medium text-[var(--text-muted)] mt-0.5">Alohida chat o'quvchilar va kuratorlar uchun</p>
                      </div>
                      <button
                        type="button"
                        disabled
                        title="Tez orada"
                        className="relative inline-block h-5 w-9 shrink-0 cursor-not-allowed rounded-full bg-[var(--card-bg)] p-0 opacity-50"
                      >
                        <span className="absolute top-0.5 block h-4 w-4 translate-x-0.5 rounded-full bg-white/50 shadow-xs" />
                      </button>
                    </div>

                    <div className="flex items-center gap-2 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-[var(--text-primary)]">Guruh kanali</p>
                        <p className="text-[11px] font-medium text-[var(--text-muted)] mt-0.5">Alohida kanal, faqat maktab xodimlari yoza oladi</p>
                      </div>
                      <button
                        type="button"
                        disabled
                        title="Tez orada"
                        className="relative inline-block h-5 w-9 shrink-0 cursor-not-allowed rounded-full bg-[var(--card-bg)] p-0 opacity-50"
                      >
                        <span className="absolute top-0.5 block h-4 w-4 translate-x-0.5 rounded-full bg-white/50 shadow-xs" />
                      </button>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-[var(--surface-bg)] p-4 sm:p-5 shadow-xs">
                    <h3 className="mb-2 text-sm font-bold text-[var(--text-primary)]">Guruh kuratorlari</h3>
                    <p className="mb-3 text-[11px] font-medium text-[var(--text-muted)]">
                      Maktab xodimlaridan birini tanlang — a'zo bo'lmasa avtomatik guruhga qo'shiladi.
                    </p>

                    {curators.length === 0 ? (
                      <p className="mb-3 text-xs font-medium text-[var(--text-muted)]">Hozircha kurator tayinlanmagan</p>
                    ) : (
                      <div className="mb-3 flex flex-col gap-2">
                        {curators.map((m) => (
                          <div key={m.id} className="flex items-center gap-2 rounded-xl bg-[var(--card-bg)] px-3 py-2">
                            <p className="min-w-0 flex-1 truncate text-xs font-bold text-[var(--text-primary)]">{m.studentName}</p>
                            <button
                              type="button"
                              onClick={() => handleRemoveCurator(m.id)}
                              className="shrink-0 flex h-6 w-6 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-500 cursor-pointer"
                              aria-label="Kuratorlikni bekor qilish"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {staff.length > 0 && (
                      <select
                        value=""
                        onChange={(e) => e.target.value && void assignCurator(courseId, group.id, e.target.value)}
                        className="w-full rounded-xl bg-[var(--card-bg)] py-2 px-3 text-xs font-medium text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-indigo-500 transition-colors cursor-pointer"
                      >
                        <option value="">Xodimni kurator qilish...</option>
                        {staff
                          .filter((s) => !curators.some((c) => c.studentId === s.studentId))
                          .map((s) => (
                            <option key={s.id} value={s.studentId}>{s.name}</option>
                          ))}
                      </select>
                    )}
                  </div>

                  <div className="rounded-2xl bg-[var(--surface-bg)] p-4 sm:p-5 shadow-xs">
                    <h3 className="mb-3 text-sm font-bold text-[var(--text-primary)]">To'lovlar tarixi</h3>
                    {payments.length === 0 ? (
                      <p className="text-xs font-medium text-[var(--text-muted)]">Hozircha to'lov yozuvlari yo'q</p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {payments.map((p) => {
                          const member = group.members.find((m) => m.id === p.groupMemberId);
                          return (
                            <div key={p.id} className="flex items-center gap-2 rounded-xl bg-[var(--card-bg)] px-3 py-2 text-xs font-medium text-[var(--text-primary)]">
                              <span className="min-w-0 flex-1 truncate">
                                {member?.studentName ?? 'Noma\'lum'} — {new Date(p.periodMonth).toLocaleDateString('uz-UZ', { year: 'numeric', month: 'long' })}
                              </span>
                              <span className="shrink-0 text-xs font-bold text-[var(--text-muted)]">
                                {p.paidAmount}/{p.expectedAmount - p.discountAmount}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl bg-[var(--surface-bg)] p-4 sm:p-5 shadow-xs">
                    <h3 className="mb-3 text-sm font-bold text-[var(--text-primary)]">Amallar</h3>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-500/10 py-2.5 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-500/20 cursor-pointer"
                    >
                      <Trash2 size={15} /> Guruhni o'chirish
                    </button>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => setSelectedGroupId(null)}
                className="w-full rounded-2xl bg-[var(--surface-bg)] py-2.5 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--card-hover)] transition-colors cursor-pointer"
              >
                Guruhlarga qaytish
              </button>
            </div>

            <CourseSidePanel
              onBackToList={onBackToList}
              activeFullTab="groups"
              onSelectContent={onSelectContent}
              onSelectSettings={onSelectSettings}
              onSelectLaunch={onSelectLaunch}
              onSelectGroups={() => { }}
              onSelectClasses={onSelectClasses}
              onSelectChallenges={onSelectChallenges}
            />
          </div>

          {confirmDelete && (
            <ConfirmDeleteModal
              title="Guruhni o'chirish"
              description={`"${group.name}" guruhi o'chiriladi. Chat, kanal va a'zolik ma'lumotlari ham yo'qoladi.`}
              onConfirm={handleConfirmDeleteGroup}
              onClose={() => setConfirmDelete(false)}
            />
          )}
        </div>
      </div>
    );
  }

  // ─── Holat A: guruhlar ro'yxati ────────────────────────────────────
  return (
    <div className="min-h-screen p-3 sm:p-4 text-[var(--text-primary)]">
      <div className="flex min-h-full flex-col gap-3">
        <div className="px-1 py-1">
          <Breadcrumb
            items={[
              { label: 'Kurslar', onClick: onBackToList },
              { label: course.title, onClick: onSelectContent },
              { label: 'Guruhlar' },
            ]}
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row items-start">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="rounded-2xl bg-[var(--surface-bg)] p-4 sm:p-5 shadow-xs">
              <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight">Guruhlarni boshqarish</h2>
              <p className="mt-0.5 mb-4 text-xs text-[var(--text-muted)]">
                O'quvchilarni ajratish orqali o'quv jarayonini soddalashtirish
              </p>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleCreateGroup}
                  disabled={course.groups.length >= 4}
                  title={course.groups.length >= 4 ? "Bitta kursga maksimal 4 ta guruh ochish mumkin" : undefined}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                >
                  <Plus size={15} /> Guruh yaratish
                </button>
                <p className="text-xs font-semibold text-[var(--text-muted)]">{course.groups.length} ta guruh</p>
              </div>
              {course.groups.length >= 4 && (
                <p className="mt-3 rounded-xl bg-amber-500/10 px-3.5 py-2.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                  Bu kursda maksimal 4 ta guruh mavjud. Yangi guruh yaratish uchun avval mavjud guruhlardan birini o'chiring.
                </p>
              )}
            </div>

            {course.groups.length === 0 ? (
              <div className="rounded-2xl bg-[var(--surface-bg)] py-16 text-center text-[var(--text-muted)] shadow-xs">
                <Inbox size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-xs font-medium">Hali guruh yo'q</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {course.groups.map((g) => {
                  const curatorNames = g.members.filter((m) => m.role === 'curator').map((m) => m.studentName);
                  const studentCount = g.members.filter((m) => m.role === 'student').length;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => { setSelectedGroupId(g.id); setInnerTab('students'); }}
                      className="w-full rounded-2xl bg-[var(--surface-bg)] p-4 text-left shadow-xs transition-colors hover:bg-[var(--card-hover)] cursor-pointer"
                    >
                      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)]">
                        <Users size={13} />
                        {studentCount} ta ishtirokchi
                      </div>
                      <p className="mb-1.5 text-sm font-bold text-[var(--text-primary)]">{g.name}</p>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-[var(--text-muted)]">
                        <span>Har oyning {g.paymentDay}-sanasi</span>
                        <span>•</span>
                        <span>
                          {curatorNames.length === 0
                            ? 'Kuratorsiz'
                            : curatorNames.length === 1
                              ? curatorNames[0]
                              : `${curatorNames[0]} +${curatorNames.length - 1}`}
                        </span>
                        {g.groupChatEnabled && (
                          <span className="rounded-full bg-[var(--card-bg)] px-2 py-0.5 font-semibold text-[var(--text-secondary)]">Chat</span>
                        )}
                        {g.groupChannelEnabled && (
                          <span className="rounded-full bg-[var(--card-bg)] px-2 py-0.5 font-semibold text-[var(--text-secondary)]">Kanal</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <CourseSidePanel
            onBackToList={onBackToList}
            activeFullTab="groups"
            onSelectContent={onSelectContent}
            onSelectLaunch={onSelectLaunch}
            onSelectGroups={() => { }}
            onSelectClasses={onSelectClasses}
            onSelectChallenges={onSelectChallenges}
          />
        </div>
      </div>
    </div>
  );
}
