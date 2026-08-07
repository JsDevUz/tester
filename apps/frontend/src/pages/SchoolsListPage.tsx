import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, UserRound } from "lucide-react";
import { StudentShell } from "../components/student/StudentShell";
import { useStudentSchoolStore } from "../stores/studentSchoolStore";

export function SchoolsListPage() {
  const navigate = useNavigate();
  const { schools, loaded, error, loadSchools, selectSchool } = useStudentSchoolStore();

  useEffect(() => {
    void loadSchools();
  }, [loadSchools]);

  function openSchool(schoolId: string) {
    selectSchool(schoolId);
    navigate(`/schools/${schoolId}/courses`);
  }

  return (
    <StudentShell restrictedNav>
      <div className="w-full rounded-2xl bg-white p-4 sm:p-5">
        <h1 className="mb-4 text-lg font-bold text-gray-800">
          Mening maktablarim
        </h1>

        {!loaded && <p className="text-sm text-gray-400">Yuklanmoqda...</p>}

        {loaded && error && (
          <div className="rounded-2xl bg-red-50 p-4 text-center">
            <p className="mb-3 text-sm text-red-600">{error}</p>
            <button
              type="button"
              onClick={() => void loadSchools()}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
            >
              Qayta urinish
            </button>
          </div>
        )}

        {loaded && !error && schools.length === 0 && (
          <div className="rounded-2xl bg-white py-16 text-center text-gray-300">
            <BookOpen size={32} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">Hali hech qanday maktabga qo'shilmagansiz</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {schools.map((school) => (
            <button
              key={school.id}
              type="button"
              onClick={() => openSchool(school.id)}
              className="student-course-card flex min-h-[150px] flex-col rounded-3xl p-4 text-left sm:min-h-[185px] sm:p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="student-course-card-icon grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl sm:h-16 sm:w-16">
                  {school.imageUrl ? (
                    <img
                      src={school.imageUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <BookOpen size={23} className="text-gray-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-lg font-bold leading-tight text-gray-950 sm:text-xl">
                    {school.name}
                  </p>
                  <span className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-gray-900">
                    <UserRound size={16} className="text-gray-700" />
                    {school.studentCount}
                  </span>
                </div>
              </div>
              {school.description && (
                <p className="mt-3 line-clamp-3 text-sm text-gray-500">
                  {school.description}
                </p>
              )}
            </button>
          ))}
        </div>
      </div>
    </StudentShell>
  );
}
