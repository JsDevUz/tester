import { useState } from 'react';
import { Inbox, Plus, Users, X, Trash2 } from 'lucide-react';
import { useCourseStore } from '../../stores/courseStore';
import { useAuthStore } from '../../stores/authStore';
import { MOCK_STUDENTS } from '../../pages/StudentsPage';
import { getMockCurators } from '../../data/mockCurators';
import { Breadcrumb } from './Breadcrumb';
import { CourseSidePanel } from './CourseSidePanel';
import { AddStudentToGroupModal } from './AddStudentToGroupModal';

interface CourseGroupsPageProps {
  courseId: string;
  onBackToList: () => void;
  onSelectContent: () => void;
  onSelectLaunch: () => void;
}

const AVATAR_PALETTES = [
  'bg-indigo-100 text-indigo-600',
  'bg-amber-100 text-amber-600',
  'bg-teal-100 text-teal-600',
  'bg-rose-100 text-rose-600',
];

function paletteFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTES[hash % AVATAR_PALETTES.length];
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

export function CourseGroupsPage({ courseId, onBackToList, onSelectContent, onSelectLaunch }: CourseGroupsPageProps) {
  const {
    courses, addGroup, renameGroup,
    setGroupCurators, addStudentToGroup, removeStudentFromGroup, deleteGroup,
  } = useCourseStore();
  const admin = useAuthStore((s) => s.admin);
  const course = courses.find((c) => c.id === courseId);

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [innerTab, setInnerTab] = useState<'students' | 'settings'>('students');
  const [addStudentModalOpen, setAddStudentModalOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!course) return null;
  const group = selectedGroupId ? course.groups.find((g) => g.id === selectedGroupId) : undefined;
  const curators = getMockCurators(admin?.name);

  function handleCreateGroup() {
    if (!course) return;
    const newGroup = addGroup(courseId, `Guruh ${course.groups.length + 1}`);
    if (newGroup) {
      setSelectedGroupId(newGroup.id);
      setInnerTab('students');
    }
  }

  function handleAddStudents(studentIds: string[]) {
    if (!group) return;
    studentIds.forEach((id) => addStudentToGroup(courseId, group.id, id));
    setAddStudentModalOpen(false);
  }

  function handleConfirmDeleteGroup() {
    if (!group) return;
    deleteGroup(courseId, group.id);
    setSelectedGroupId(null);
    setConfirmDelete(false);
  }

  function handlePickCurator(curatorId: string) {
    if (!group || !curatorId) return;
    if (group.curatorIds.includes(curatorId)) return;
    setGroupCurators(courseId, group.id, [...group.curatorIds, curatorId]);
  }

  function handleRemoveCurator(curatorId: string) {
    if (!group) return;
    setGroupCurators(courseId, group.id, group.curatorIds.filter((id) => id !== curatorId));
  }

  // ─── Holat B: guruh ichki ko'rinishi ───────────────────────────────
  if (group) {
    const groupStudents = MOCK_STUDENTS.filter((s) => group.studentIds.includes(s.id));

    return (
      <div className="flex flex-col gap-3 p-6 sm:flex-row">
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
              className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                innerTab === 'students' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              O'quvchilar
            </button>
            <button
              type="button"
              onClick={() => setInnerTab('settings')}
              className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                innerTab === 'settings' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              Sozlamalar
            </button>
          </div>

          {innerTab === 'students' ? (
            <div className="rounded-2xl bg-white p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold uppercase tracking-wide text-gray-400">Barcha o'quvchilar</p>
                  <span className="inline-flex items-center justify-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-600">
                    {group.studentIds.length}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setAddStudentModalOpen(true)}
                  className="flex shrink-0 items-center gap-1.5 rounded-2xl bg-green-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-600"
                >
                  <Plus size={16} /> O'quvchi qo'shish
                </button>
              </div>

              {groupStudents.length === 0 ? (
                <div className="rounded-2xl bg-gray-50 py-14 text-center">
                  <Users size={30} className="mx-auto mb-3 text-indigo-200" />
                  <p className="text-sm font-semibold text-gray-700">O'quvchilar topilmadi</p>
                  <p className="mt-1 text-xs text-gray-400">
                    Ular guruh tarifi orqali sotib olingandan keyin paydo bo'ladi
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {groupStudents.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 rounded-2xl bg-gray-50 px-3.5 py-3">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${paletteFor(s.id)}`}>
                        {initials(s.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-800">{s.name}</p>
                        <p className="text-xs text-gray-400">{s.phone}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeStudentFromGroup(courseId, group.id, s.id)}
                        className="shrink-0 rounded-lg p-1.5 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
                        aria-label="Guruhdan olib tashlash"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
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
                  onChange={(e) => renameGroup(courseId, group.id, e.target.value)}
                  className="mb-4 w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
                />

                <div className="flex items-center gap-3 py-2">
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

                <div className="flex items-center gap-3 py-2">
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
                <select
                  value=""
                  onChange={(e) => handlePickCurator(e.target.value)}
                  className="mb-3 w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
                >
                  <option value="">Kurator tanlang...</option>
                  {curators.filter((c) => !group.curatorIds.includes(c.id)).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>

                {group.curatorIds.length === 0 ? (
                  <p className="text-xs text-gray-400">Hozircha kurator tayinlanmagan</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {group.curatorIds.map((curatorId) => {
                      const curator = curators.find((c) => c.id === curatorId);
                      if (!curator) return null;
                      return (
                        <div key={curatorId} className="flex items-center gap-3 rounded-xl bg-gray-50 px-3 py-2">
                          <p className="min-w-0 flex-1 truncate text-sm font-medium text-gray-700">{curator.name}</p>
                          <button
                            type="button"
                            onClick={() => handleRemoveCurator(curatorId)}
                            className="shrink-0 rounded-lg p-1 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
                            aria-label="Kuratorni olib tashlash"
                          >
                            <X size={14} />
                          </button>
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
          onSelectLaunch={onSelectLaunch}
          onSelectGroups={() => {}}
        />

        {addStudentModalOpen && (
          <AddStudentToGroupModal
            alreadyInGroup={group.studentIds}
            onConfirm={handleAddStudents}
            onClose={() => setAddStudentModalOpen(false)}
          />
        )}

        {confirmDelete && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
            onClick={(e) => { if (e.target === e.currentTarget) setConfirmDelete(false); }}
          >
            <div className="w-80 rounded-3xl bg-white p-6">
              <p className="mb-1 text-sm font-semibold text-gray-800">Guruhni o'chirish</p>
              <p className="mb-5 text-sm text-gray-400">
                "{group.name}" guruhi o'chiriladi. Chat, kanal va a'zolik ma'lumotlari ham yo'qoladi.
              </p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setConfirmDelete(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
                  Bekor qilish
                </button>
                <button
                  onClick={handleConfirmDeleteGroup}
                  className="rounded-xl bg-red-500 px-4 py-2 text-sm text-white hover:bg-red-600"
                >
                  O'chirish
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Holat A: guruhlar ro'yxati ────────────────────────────────────
  return (
    <div className="flex flex-col gap-3 p-6 sm:flex-row">
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
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleCreateGroup}
              className="flex items-center gap-1.5 rounded-2xl bg-green-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-600"
            >
              <Plus size={16} /> Guruh yaratish
            </button>
            <p className="text-xs text-gray-400">{course.groups.length} ta guruh</p>
          </div>
        </div>

        {course.groups.length === 0 ? (
          <div className="rounded-2xl bg-white py-16 text-center text-gray-300">
            <Inbox size={32} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">Hali guruh yo'q</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {course.groups.map((g) => {
              const curatorNames = g.curatorIds
                .map((id) => curators.find((c) => c.id === id)?.name)
                .filter((n): n is string => !!n);
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => { setSelectedGroupId(g.id); setInnerTab('students'); }}
                  className="w-full rounded-2xl bg-white p-4 text-left transition-colors hover:bg-indigo-50/30"
                >
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs text-gray-400">
                    <Users size={13} />
                    {g.studentIds.length} ta ishtirokchi
                  </div>
                  <p className="mb-1.5 text-base font-bold text-gray-800">{g.name}</p>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-400">
                    <span>Cheklovsiz</span>
                    <span>•</span>
                    <span>
                      {curatorNames.length === 0
                        ? 'Kuratorsiz'
                        : curatorNames.length === 1
                          ? curatorNames[0]
                          : `${curatorNames[0]} +${curatorNames.length - 1}`}
                    </span>
                    {g.groupChatEnabled && (
                      <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-medium text-indigo-500">Chat</span>
                    )}
                    {g.groupChannelEnabled && (
                      <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-medium text-indigo-500">Kanal</span>
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
        onSelectGroups={() => {}}
      />
    </div>
  );
}
