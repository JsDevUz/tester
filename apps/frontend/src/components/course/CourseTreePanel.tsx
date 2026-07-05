import { useState } from 'react';
import { Search, Plus, ChevronDown, ChevronRight, FileText, Trash2, MoreHorizontal } from 'lucide-react';
import { useCourseStore } from '../../stores/courseStore';
import { PromptModal } from './PromptModal';

interface CourseTreePanelProps {
  courseId: string;
  onSelectCourse: (courseId: string) => void;
  selectedLessonId: string | null;
  onSelectLesson: (moduleId: string, lessonId: string) => void;
}

type ModalState =
  | { type: 'newCourse' }
  | { type: 'newModule' }
  | { type: 'newLesson'; moduleId: string }
  | null;

export function CourseTreePanel({ courseId, onSelectCourse, selectedLessonId, onSelectLesson }: CourseTreePanelProps) {
  const { courses, addCourse, addModule, addLesson, deleteModule, deleteLesson } = useCourseStore();
  const course = courses.find((c) => c.id === courseId);
  const [query, setQuery] = useState('');
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [collapsedModules, setCollapsedModules] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<ModalState>(null);

  if (!course) return null;

  function toggleModule(moduleId: string) {
    setCollapsedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  }

  function handleCreateCourse(title: string) {
    const created = addCourse(title);
    setModal(null);
    setSwitcherOpen(false);
    onSelectCourse(created.id);
  }

  function handleCreateModule(title: string) {
    addModule(courseId, title);
    setModal(null);
  }

  function handleCreateLesson(title: string) {
    if (modal?.type !== 'newLesson') return;
    const lesson = addLesson(courseId, modal.moduleId, title);
    setModal(null);
    if (lesson) onSelectLesson(modal.moduleId, lesson.id);
  }

  const query_lower = query.trim().toLowerCase();
  const visibleModules = query_lower
    ? course.modules
        .map((m) => ({ ...m, lessons: m.lessons.filter((l) => l.title.toLowerCase().includes(query_lower)) }))
        .filter((m) => m.title.toLowerCase().includes(query_lower) || m.lessons.length > 0)
    : course.modules;

  return (
    <div className="flex h-full w-full flex-col gap-3 sm:w-72 sm:shrink-0">
      {/* Kurs sarlavhasi + almashtirish */}
      <div className="relative shrink-0">
        <button
          onClick={() => setSwitcherOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 rounded-2xl border-2 border-gray-100 bg-white px-4 py-3 text-left"
        >
          <span className="truncate text-sm font-bold text-gray-800">{course.title}</span>
          <ChevronDown size={16} className="shrink-0 text-gray-400" />
        </button>

        {switcherOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setSwitcherOpen(false)} />
            <div className="absolute left-0 right-0 z-50 mt-2 max-h-72 overflow-y-auto rounded-2xl border border-gray-100 bg-white p-2 shadow-lg">
              {courses.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { onSelectCourse(c.id); setSwitcherOpen(false); }}
                  className={`w-full truncate rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                    c.id === courseId ? 'bg-indigo-50 font-semibold text-indigo-600' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {c.title}
                </button>
              ))}
              <button
                onClick={() => { setModal({ type: 'newCourse' }); setSwitcherOpen(false); }}
                className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-indigo-500 hover:bg-indigo-50"
              >
                <Plus size={15} /> Yangi kurs yaratish
              </button>
            </div>
          </>
        )}
      </div>

      {/* Qidiruv */}
      <div className="relative shrink-0">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Qidirish..."
          className="w-full rounded-2xl border-2 border-gray-100 bg-white py-2.5 pl-9 pr-4 text-sm outline-none focus:border-indigo-400"
        />
      </div>

      {/* Modul + dars daraxti */}
      <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl border-2 border-gray-100 bg-white p-2">
        {visibleModules.length === 0 && (
          <p className="py-8 text-center text-xs text-gray-300">Hali modul yo'q</p>
        )}
        {visibleModules.map((module) => {
          const collapsed = collapsedModules.has(module.id);
          return (
            <div key={module.id} className="mb-1">
              <div className="group flex items-center gap-1.5 rounded-xl px-2 py-2 hover:bg-gray-50">
                <button onClick={() => toggleModule(module.id)} className="text-gray-400">
                  {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                </button>
                <span className="flex-1 truncate text-sm font-semibold text-gray-700">{module.title}</span>
                <button
                  onClick={() => deleteModule(courseId, module.id)}
                  className="rounded-lg p-1 text-gray-300 opacity-0 transition-colors hover:bg-red-50 hover:text-red-400 group-hover:opacity-100"
                >
                  <Trash2 size={13} />
                </button>
                <button className="rounded-lg p-1 text-gray-300 opacity-0 group-hover:opacity-100">
                  <MoreHorizontal size={13} />
                </button>
              </div>

              {!collapsed && (
                <div className="ml-1 flex flex-col gap-0.5 border-l border-gray-100 pl-3">
                  {module.lessons.map((lesson) => (
                    <div
                      key={lesson.id}
                      className={`group flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors ${
                        selectedLessonId === lesson.id ? 'bg-indigo-50 font-medium text-indigo-600' : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <button
                        onClick={() => onSelectLesson(module.id, lesson.id)}
                        className="flex flex-1 items-center gap-2 truncate text-left"
                      >
                        <FileText size={14} className={selectedLessonId === lesson.id ? 'text-indigo-500' : 'text-gray-300'} />
                        <span className="truncate">{lesson.title}</span>
                      </button>
                      <button
                        onClick={() => deleteLesson(courseId, module.id, lesson.id)}
                        className="rounded-lg p-1 text-gray-300 opacity-0 transition-colors hover:bg-red-50 hover:text-red-400 group-hover:opacity-100"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => setModal({ type: 'newLesson', moduleId: module.id })}
                    className="rounded-xl px-3 py-2 text-left text-xs font-medium text-indigo-400 hover:bg-indigo-50/50"
                  >
                    + Dars qo'shish
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button
        onClick={() => setModal({ type: 'newModule' })}
        className="shrink-0 rounded-2xl bg-indigo-500 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-100 transition-colors hover:bg-indigo-600"
      >
        + Modul qo'shish
      </button>

      {modal?.type === 'newCourse' && (
        <PromptModal title="Yangi kurs" placeholder="Kurs nomi" confirmLabel="Yaratish" onConfirm={handleCreateCourse} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'newModule' && (
        <PromptModal title="Yangi modul" placeholder="Modul nomi" confirmLabel="Yaratish" onConfirm={handleCreateModule} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'newLesson' && (
        <PromptModal title="Yangi dars" placeholder="Dars nomi" confirmLabel="Yaratish" onConfirm={handleCreateLesson} onClose={() => setModal(null)} />
      )}
    </div>
  );
}
