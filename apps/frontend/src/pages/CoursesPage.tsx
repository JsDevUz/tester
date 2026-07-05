import { useState } from 'react';
import { AppShell } from '../components/AppShell';
import { CourseGrid } from '../components/course/CourseGrid';
import { ModulesView } from '../components/course/ModulesView';
import { LessonsView } from '../components/course/LessonsView';
import { LessonEditorView } from '../components/course/LessonEditorView';

type ViewState =
  | { view: 'courses' }
  | { view: 'modules'; courseId: string }
  | { view: 'lessons'; courseId: string; moduleId: string }
  | { view: 'editor'; courseId: string; moduleId: string; lessonId: string };

export function CoursesPage() {
  const [state, setState] = useState<ViewState>({ view: 'courses' });

  return (
    <AppShell>
      {state.view === 'courses' && (
        <CourseGrid onOpenCourse={(courseId) => setState({ view: 'modules', courseId })} />
      )}
      {state.view === 'modules' && (
        <ModulesView
          courseId={state.courseId}
          onBack={() => setState({ view: 'courses' })}
          onOpenModule={(moduleId) => setState({ view: 'lessons', courseId: state.courseId, moduleId })}
        />
      )}
      {state.view === 'lessons' && (
        <LessonsView
          courseId={state.courseId}
          moduleId={state.moduleId}
          onBack={() => setState({ view: 'modules', courseId: state.courseId })}
          onOpenLesson={(lessonId) => setState({ view: 'editor', courseId: state.courseId, moduleId: state.moduleId, lessonId })}
        />
      )}
      {state.view === 'editor' && (
        <LessonEditorView
          courseId={state.courseId}
          moduleId={state.moduleId}
          lessonId={state.lessonId}
          onBack={() => setState({ view: 'lessons', courseId: state.courseId, moduleId: state.moduleId })}
        />
      )}
    </AppShell>
  );
}
