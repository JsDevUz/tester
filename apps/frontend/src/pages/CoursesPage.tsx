import { useEffect, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { CourseGrid } from '../components/course/CourseGrid';
import { CourseContentPage } from '../components/course/CourseContentPage';
import { CourseSettingsPage } from '../components/course/CourseSettingsPage';
import { CourseLaunchPage } from '../components/course/CourseLaunchPage';
import { CourseGroupsPage } from '../components/course/CourseGroupsPage';
import { CourseClassesPage } from '../components/course/CourseClassesPage';
import { LessonEditorView } from '../components/course/LessonEditorView';
import { useCourseStore } from '../stores/courseStore';

type ViewState =
  | { view: 'list' }
  | { view: 'content'; courseId: string }
  | { view: 'settings'; courseId: string }
  | { view: 'launch'; courseId: string }
  | { view: 'groups'; courseId: string }
  | { view: 'classes'; courseId: string }
  | { view: 'editor'; courseId: string; moduleId: string; lessonId: string };

export function CoursesPage() {
  const [state, setState] = useState<ViewState>({ view: 'list' });
  const loadCourses = useCourseStore((s) => s.loadCourses);

  useEffect(() => {
    void loadCourses().catch(() => undefined);
  }, [loadCourses]);

  function backToList() {
    setState({ view: 'list' });
  }

  return (
    <AppShell>
      {state.view === 'list' && (
        <CourseGrid onOpenCourse={(courseId) => setState({ view: 'content', courseId })} />
      )}
      {state.view === 'content' && (
        <CourseContentPage
          courseId={state.courseId}
          onBackToList={backToList}
          onOpenLesson={(moduleId, lessonId) =>
            setState({ view: 'editor', courseId: state.courseId, moduleId, lessonId })
          }
          onSelectSettings={() => setState({ view: 'settings', courseId: state.courseId })}
          onSelectLaunch={() => setState({ view: 'launch', courseId: state.courseId })}
          onSelectGroups={() => setState({ view: 'groups', courseId: state.courseId })}
          onSelectClasses={() => setState({ view: 'classes', courseId: state.courseId })}
        />
      )}
      {state.view === 'settings' && (
        <CourseSettingsPage
          courseId={state.courseId}
          onBackToList={backToList}
          onSelectContent={() => setState({ view: 'content', courseId: state.courseId })}
          onSelectLaunch={() => setState({ view: 'launch', courseId: state.courseId })}
          onSelectGroups={() => setState({ view: 'groups', courseId: state.courseId })}
          onSelectClasses={() => setState({ view: 'classes', courseId: state.courseId })}
        />
      )}
      {state.view === 'launch' && (
        <CourseLaunchPage
          courseId={state.courseId}
          onBackToList={backToList}
          onSelectContent={() => setState({ view: 'content', courseId: state.courseId })}
          onSelectSettings={() => setState({ view: 'settings', courseId: state.courseId })}
          onSelectGroups={() => setState({ view: 'groups', courseId: state.courseId })}
          onSelectClasses={() => setState({ view: 'classes', courseId: state.courseId })}
        />
      )}
      {state.view === 'groups' && (
        <CourseGroupsPage
          courseId={state.courseId}
          onBackToList={backToList}
          onSelectContent={() => setState({ view: 'content', courseId: state.courseId })}
          onSelectSettings={() => setState({ view: 'settings', courseId: state.courseId })}
          onSelectLaunch={() => setState({ view: 'launch', courseId: state.courseId })}
          onSelectClasses={() => setState({ view: 'classes', courseId: state.courseId })}
        />
      )}
      {state.view === 'classes' && (
        <CourseClassesPage
          courseId={state.courseId}
          onBackToList={backToList}
          onSelectContent={() => setState({ view: 'content', courseId: state.courseId })}
          onSelectSettings={() => setState({ view: 'settings', courseId: state.courseId })}
          onSelectLaunch={() => setState({ view: 'launch', courseId: state.courseId })}
          onSelectGroups={() => setState({ view: 'groups', courseId: state.courseId })}
        />
      )}
      {state.view === 'editor' && (
        <LessonEditorView
          courseId={state.courseId}
          moduleId={state.moduleId}
          lessonId={state.lessonId}
          onBackToList={backToList}
          onBackToContent={() => setState({ view: 'content', courseId: state.courseId })}
        />
      )}
    </AppShell>
  );
}
