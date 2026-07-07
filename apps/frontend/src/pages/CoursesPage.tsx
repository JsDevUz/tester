import { useState } from 'react';
import { AppShell } from '../components/AppShell';
import { CourseGrid } from '../components/course/CourseGrid';
import { CourseContentPage } from '../components/course/CourseContentPage';
import { CourseLaunchPage } from '../components/course/CourseLaunchPage';
import { CourseGroupsPage } from '../components/course/CourseGroupsPage';
import { LessonEditorView } from '../components/course/LessonEditorView';

type ViewState =
  | { view: 'list' }
  | { view: 'content'; courseId: string }
  | { view: 'launch'; courseId: string }
  | { view: 'groups'; courseId: string }
  | { view: 'editor'; courseId: string; moduleId: string; lessonId: string };

export function CoursesPage() {
  const [state, setState] = useState<ViewState>({ view: 'list' });

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
          onSelectLaunch={() => setState({ view: 'launch', courseId: state.courseId })}
          onSelectGroups={() => setState({ view: 'groups', courseId: state.courseId })}
        />
      )}
      {state.view === 'launch' && (
        <CourseLaunchPage
          courseId={state.courseId}
          onBackToList={backToList}
          onSelectContent={() => setState({ view: 'content', courseId: state.courseId })}
          onSelectGroups={() => setState({ view: 'groups', courseId: state.courseId })}
        />
      )}
      {state.view === 'groups' && (
        <CourseGroupsPage
          courseId={state.courseId}
          onBackToList={backToList}
          onSelectContent={() => setState({ view: 'content', courseId: state.courseId })}
          onSelectLaunch={() => setState({ view: 'launch', courseId: state.courseId })}
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
