import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { CourseGrid } from '../components/course/CourseGrid';
import { CourseContentPage } from '../components/course/CourseContentPage';
import { CourseSettingsPage } from '../components/course/CourseSettingsPage';
import { CourseLaunchPage } from '../components/course/CourseLaunchPage';
import { CourseGroupsPage } from '../components/course/CourseGroupsPage';
import { CourseClassesPage } from '../components/course/CourseClassesPage';
import { CourseChallengesPage } from '../components/course/CourseChallengesPage';
import { LessonEditorView } from '../components/course/LessonEditorView';
import { useCourseStore } from '../stores/courseStore';

/** The course sub-pages that live under /lessons/:courseId/<section>. */
const SECTIONS = ['settings', 'launch', 'groups', 'classes', 'challenges'] as const;
type Section = (typeof SECTIONS)[number];

function isSection(value: string | undefined): value is Section {
  return !!value && (SECTIONS as readonly string[]).includes(value);
}

/**
 * Every view here is addressable. The URL is the single source of truth for which one is
 * showing, so a refresh keeps its place, a link can be shared, and Back steps up one level
 * (lesson → content → course list) instead of leaving the section altogether.
 */
export function CoursesPage() {
  const navigate = useNavigate();
  const { courseId, section, moduleId, lessonId } = useParams();
  const loadCourses = useCourseStore((s) => s.loadCourses);

  useEffect(() => {
    void loadCourses().catch(() => undefined);
  }, [loadCourses]);

  const backToList = () => navigate('/lessons');
  const goToSection = (target: Section | 'content') =>
    navigate(target === 'content' ? `/lessons/${courseId}` : `/lessons/${courseId}/${target}`);

  // An unknown :section (a typo, a stale link) falls back to the course content rather than
  // rendering nothing at all.
  const activeSection: Section | 'content' = isSection(section) ? section : 'content';

  return (
    <AppShell>
      {!courseId && <CourseGrid onOpenCourse={(id) => navigate(`/lessons/${id}`)} />}

      {courseId && moduleId && lessonId && (
        <LessonEditorView
          courseId={courseId}
          moduleId={moduleId}
          lessonId={lessonId}
          onBackToList={backToList}
          onBackToContent={() => goToSection('content')}
        />
      )}

      {courseId && !moduleId && activeSection === 'content' && (
        <CourseContentPage
          courseId={courseId}
          onBackToList={backToList}
          onOpenLesson={(mId, lId) =>
            navigate(`/lessons/${courseId}/modules/${mId}/lessons/${lId}`)
          }
          onSelectSettings={() => goToSection('settings')}
          onSelectLaunch={() => goToSection('launch')}
          onSelectGroups={() => goToSection('groups')}
          onSelectClasses={() => goToSection('classes')}
          onSelectChallenges={() => goToSection('challenges')}
        />
      )}

      {courseId && !moduleId && activeSection === 'settings' && (
        <CourseSettingsPage
          courseId={courseId}
          onBackToList={backToList}
          onSelectContent={() => goToSection('content')}
          onSelectLaunch={() => goToSection('launch')}
          onSelectGroups={() => goToSection('groups')}
          onSelectClasses={() => goToSection('classes')}
          onSelectChallenges={() => goToSection('challenges')}
        />
      )}

      {courseId && !moduleId && activeSection === 'launch' && (
        <CourseLaunchPage
          courseId={courseId}
          onBackToList={backToList}
          onSelectContent={() => goToSection('content')}
          onSelectSettings={() => goToSection('settings')}
          onSelectGroups={() => goToSection('groups')}
          onSelectClasses={() => goToSection('classes')}
          onSelectChallenges={() => goToSection('challenges')}
        />
      )}

      {courseId && !moduleId && activeSection === 'groups' && (
        <CourseGroupsPage
          courseId={courseId}
          onBackToList={backToList}
          onSelectContent={() => goToSection('content')}
          onSelectSettings={() => goToSection('settings')}
          onSelectLaunch={() => goToSection('launch')}
          onSelectClasses={() => goToSection('classes')}
          onSelectChallenges={() => goToSection('challenges')}
        />
      )}

      {courseId && !moduleId && activeSection === 'classes' && (
        <CourseClassesPage
          courseId={courseId}
          onBackToList={backToList}
          onSelectContent={() => goToSection('content')}
          onSelectSettings={() => goToSection('settings')}
          onSelectLaunch={() => goToSection('launch')}
          onSelectGroups={() => goToSection('groups')}
          onSelectChallenges={() => goToSection('challenges')}
        />
      )}

      {courseId && !moduleId && activeSection === 'challenges' && (
        <CourseChallengesPage
          courseId={courseId}
          onBackToList={backToList}
          onSelectContent={() => goToSection('content')}
          onSelectSettings={() => goToSection('settings')}
          onSelectLaunch={() => goToSection('launch')}
          onSelectGroups={() => goToSection('groups')}
          onSelectClasses={() => goToSection('classes')}
        />
      )}
    </AppShell>
  );
}
