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
      <div className="flex flex-col gap-2 p-6 sm:flex-row">
        <div className="min-w-0 flex-1">
          <Breadcrumb
            items={[
              { label: 'Kurslar', onClick: onBackToList },
              { label: course.title, onClick: onSelectContent },
              { label: 'Guruhlar', onClick: () => setSelectedGroupId(null) },
              { label: group.name },
            ]}
          />

          <div className="mb-4 flex gap-2 rounded-2xl bg-white p-2">
            <button
              type="button"
              onClick={() => setInnerTab('students')}
              className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${innerTab === 'students' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'
                }`}
            >
              O'quvchilar
            </button>
            <button
              type="button"
              onClick={() => setInnerTab('settings')}
              className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${innerTab === 'settings' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'
                }`}
            >
              Sozlamalar
            </button>
          </div>

          {innerTab === 'students' ? (
            <div className="rounded-2xl bg-white p-5">
              <div className="mb-4 flex items-center gap-2">
                <p className="text-sm font-semibold uppercase tracking-wide text-gray-400">Barcha o'quvchilar</p>
                <span className="inline-flex items-center justify-center rounded-full bg-gray-900 px-2 py-0.5 text-xs font-bold text-white">
                  {students.length}
                </span>
              </div>

              {students.length === 0 ? (
                <div className="rounded-2xl bg-gray-50 py-14 text-center">
                  <Users size={30} className="mx-auto mb-3 text-gray-300" />
                  <p className="text-sm font-semibold text-gray-700">O'quvchilar topilmadi</p>
                  <p className="mt-1 text-xs text-gray-400">
                    Ular yuqoridagi havola orqali guruhga qo'shilgach paydo bo'ladi
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {pageStudents.map((m) => (
                    <div key={m.id} className="flex items-center gap-2 rounded-2xl bg-gray-50 px-3.5 py-3">
                      <UserAvatar name={m.studentName} avatarUrl={m.studentAvatarUrl} className={`h-9 w-9 rounded-full text-xs font-bold ${paletteFor(m.id)}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-800">{m.studentName}</p>
                        <p className="text-xs text-gray-400">{m.studentPhone ?? ''}</p>
                      </div>
                      {m.latestPaymentStatus && (
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${m.latestPaymentStatus === 'paid'
                              ? 'bg-green-100 text-green-600'
                              : m.latestPaymentStatus === 'partial'
                                ? 'bg-amber-100 text-amber-600'
                                : m.latestPaymentStatus === 'debt'
                                  ? 'bg-red-100 text-red-600'
                                  : 'bg-gray-200 text-gray-500'
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
                      <span className="shrink-0 rounded-lg bg-gray-100 px-2 py-1.5 text-xs font-medium text-gray-500">
                        {group.plans.find((p) => p.id === m.selectedPlanId)?.name ?? 'Tarifsiz'}
                      </span>
                      <button
                        type="button"
                        onClick={() => void setMemberForcedClosed(courseId, group.id, m.id, !m.forcedClosed)}
                        title={m.forcedClosed ? 'Ochish' : 'Majburiy yopish'}
                        className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${m.forcedClosed ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                      >
                        {m.forcedClosed ? 'Yopiq' : 'Ochiq'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeStudentFromGroup(courseId, group.id, m.id)}
                        className="shrink-0 rounded-lg p-1.5 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
                        aria-label="Guruhdan olib tashlash"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                  {studentPageCount > 1 && (
                    <div className="flex items-center justify-center gap-1.5 pt-3">
                      <button
                        type="button"
                        onClick={() => setStudentPage((page) => Math.max(1, page - 1))}
                        disabled={currentStudentPage === 1}
                        className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-30"
                        aria-label="Oldingi sahifa"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      {Array.from({ length: studentPageCount }, (_, index) => index + 1).map((page) => (
                        <button
                          key={page}
                          type="button"
                          onClick={() => setStudentPage(page)}
                          className={`h-8 w-8 rounded-xl text-sm font-semibold transition-colors ${page === currentStudentPage
                              ? 'bg-gray-900 text-white'
                              : 'text-gray-500 hover:bg-gray-100'
                            }`}
                        >
                          {page}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setStudentPage((page) => Math.min(studentPageCount, page + 1))}
                        disabled={currentStudentPage === studentPageCount}
                        className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-30"
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
            <div className="flex flex-col gap-4">
              <div className="rounded-2xl bg-white p-5">
                <h3 className="mb-4 text-base font-bold text-gray-800">Asosiy sozlamalar</h3>
                <p className="mb-1.5 text-sm text-gray-500">Guruh nomi</p>
                <input
                  value={group.name}
                  onChange={(e) => void renameGroup(courseId, group.id, e.target.value)}
                  className="mb-4 w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
                />

                <p className="mb-1.5 text-sm text-gray-500">Oylik to'lov kuni (har oyning qaysi sanasida)</p>
                <select
                  value={group.paymentDay ?? 1}
                  onChange={(e) => void setGroupPaymentDay(courseId, group.id, parseInt(e.target.value, 10) || 1)}
                  className="mb-4 w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none cursor-pointer"
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                    <option key={day} value={day}>
                      Har oyning {day}-sanasi
                    </option>
                  ))}
                </select>

                <div className="flex items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-800">Guruh chati</p>
                    <p className="text-xs text-gray-400">Alohida chat o'quvchilar va kuratorlar uchun</p>
                  </div>
                  <button
                    type="button"
                    disabled
                    title="Tez orada"
                    className="relative inline-block h-6 w-11 shrink-0 cursor-not-allowed rounded-full bg-gray-100 p-0"
                  >
                    <span className="absolute top-0.5 block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow" />
                  </button>
                </div>

                <div className="flex items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-800">Guruh kanali</p>
                    <p className="text-xs text-gray-400">Alohida kanal, faqat maktab xodimlari yoza oladi</p>
                  </div>
                  <button
                    type="button"
                    disabled
                    title="Tez orada"
                    className="relative inline-block h-6 w-11 shrink-0 cursor-not-allowed rounded-full bg-gray-100 p-0"
                  >
                    <span className="absolute top-0.5 block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow" />
                  </button>
                </div>
              </div>

              <div className="rounded-2xl bg-white p-5">
                <h3 className="mb-4 text-base font-bold text-gray-800">Guruh kuratorlari</h3>
                <p className="mb-3 text-xs text-gray-400">
                  Maktab xodimlaridan birini tanlang — a'zo bo'lmasa avtomatik guruhga qo'shiladi. Kuratorlik butun maktab bo'yicha beriladi, faqat shu guruhga emas.
                </p>

                {curators.length === 0 ? (
                  <p className="mb-2 text-xs text-gray-400">Hozircha kurator tayinlanmagan</p>
                ) : (
                  <div className="mb-3 flex flex-col gap-2">
                    {curators.map((m) => (
                      <div key={m.id} className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2">
                        <p className="min-w-0 flex-1 truncate text-sm font-medium text-gray-700">{m.studentName}</p>
                        <button
                          type="button"
                          onClick={() => handleRemoveCurator(m.id)}
                          className="shrink-0 rounded-lg p-1 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
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
                    className="w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
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

              <div className="rounded-2xl bg-white p-5">
                <h3 className="mb-4 text-base font-bold text-gray-800">To'lovlar tarixi</h3>
                {payments.length === 0 ? (
                  <p className="text-xs text-gray-400">Hozircha to'lov yozuvlari yo'q</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {payments.map((p) => {
                      const member = group.members.find((m) => m.id === p.groupMemberId);
                      return (
                        <div key={p.id} className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 text-sm">
                          <span className="min-w-0 flex-1 truncate text-gray-700">
                            {member?.studentName ?? 'Noma\'lum'} — {new Date(p.periodMonth).toLocaleDateString('uz-UZ', { year: 'numeric', month: 'long' })}
                          </span>
                          <span className="shrink-0 text-xs text-gray-400">
                            {p.paidAmount}/{p.expectedAmount - p.discountAmount}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-2xl bg-white p-5">
                <h3 className="mb-4 text-base font-bold text-gray-800">Amallar</h3>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-50 py-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-100"
                >
                  <Trash2 size={16} /> Guruhni o'chirish
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setSelectedGroupId(null)}
            className="mt-4 w-full rounded-2xl bg-gray-100 py-3 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-200"
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

        {confirmDelete && (
          <ConfirmDeleteModal
            title="Guruhni o'chirish"
            description={`"${group.name}" guruhi o'chiriladi. Chat, kanal va a'zolik ma'lumotlari ham yo'qoladi.`}
            onConfirm={handleConfirmDeleteGroup}
            onClose={() => setConfirmDelete(false)}
          />
        )}
      </div>
    );
  }

  // ─── Holat A: guruhlar ro'yxati ────────────────────────────────────
  return (
    <div className="flex flex-col gap-2 p-6 sm:flex-row">
      <div className="min-w-0 flex-1">
        <Breadcrumb
          items={[
            { label: 'Kurslar', onClick: onBackToList },
            { label: course.title, onClick: onSelectContent },
            { label: 'Guruhlar' },
          ]}
        />

        <div className="mb-4 rounded-2xl bg-white p-5">
          <h2 className="mb-1 text-lg font-bold text-gray-800">Guruhlarni boshqarish</h2>
          <p className="mb-4 text-sm text-gray-400">
            O'quvchilarni ajratish orqali o'quv jarayonini soddalashtirish
          </p>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleCreateGroup}
              disabled={course.groups.length >= 4}
              title={course.groups.length >= 4 ? "Bitta kursga maksimal 4 ta guruh ochish mumkin" : undefined}
              className="flex items-center gap-1.5 rounded-2xl bg-green-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-600 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
            >
              <Plus size={16} /> Guruh yaratish
            </button>
            <p className="text-xs text-gray-400">{course.groups.length} ta guruh</p>
          </div>
          {course.groups.length >= 4 && (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
              Bu kursda maksimal 4 ta guruh mavjud. Yangi guruh yaratish uchun avval mavjud guruhlardan birini o'chiring.
            </p>
          )}
        </div>

        {course.groups.length === 0 ? (
          <div className="rounded-2xl bg-white py-16 text-center text-gray-300">
            <Inbox size={32} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">Hali guruh yo'q</p>
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
                  className="w-full rounded-2xl bg-white p-4 text-left transition-colors hover:bg-gray-50"
                >
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs text-gray-400">
                    <Users size={13} />
                    {studentCount} ta ishtirokchi
                  </div>
                  <p className="mb-1.5 text-base font-bold text-gray-800">{g.name}</p>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-400">
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
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-600">Chat</span>
                    )}
                    {g.groupChannelEnabled && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-600">Kanal</span>
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
  );
}
