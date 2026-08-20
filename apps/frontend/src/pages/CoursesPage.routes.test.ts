import { describe, expect, it } from "vitest";
import { matchRoutes, type RouteObject } from "react-router-dom";

/**
 * Mirrors the /lessons routes from App.tsx. What matters is which one wins for a given URL:
 * the lesson-editor path and the section path both have four segments after /lessons, so a
 * mistake here would send a lesson URL to the wrong view.
 */
const routes: RouteObject[] = [
  { path: "/lessons" },
  { path: "/lessons/:courseId" },
  { path: "/lessons/:courseId/:section" },
  { path: "/lessons/:courseId/modules/:moduleId/lessons/:lessonId" },
];

function matchedPath(pathname: string): string | undefined {
  const matches = matchRoutes(routes, pathname);
  return matches?.[matches.length - 1]?.route.path;
}

describe("/lessons routing", () => {
  it("matches the course list", () => {
    expect(matchedPath("/lessons")).toBe("/lessons");
  });

  it("matches a course's content view", () => {
    expect(matchedPath("/lessons/course-1")).toBe("/lessons/:courseId");
  });

  it.each(["settings", "launch", "groups", "classes", "challenges"])(
    "matches the %s section",
    (section) => {
      expect(matchedPath(`/lessons/course-1/${section}`)).toBe("/lessons/:courseId/:section");
    },
  );

  it("prefers the lesson editor route over the section route", () => {
    expect(matchedPath("/lessons/course-1/modules/mod-2/lessons/les-3")).toBe(
      "/lessons/:courseId/modules/:moduleId/lessons/:lessonId",
    );
  });

  it("extracts the ids from a lesson URL", () => {
    const matches = matchRoutes(routes, "/lessons/course-1/modules/mod-2/lessons/les-3");
    expect(matches?.[matches.length - 1]?.params).toEqual({
      courseId: "course-1",
      moduleId: "mod-2",
      lessonId: "les-3",
    });
  });
});
