// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { themedInk } from "./classroomCanvasDraw";

function setBoardTheme(theme: "light" | "dark") {
  document.documentElement.setAttribute("data-theme", theme);
}

afterEach(() => {
  document.documentElement.removeAttribute("data-theme");
});

describe("themedInk", () => {
  it("turns black ink white on a dark board", () => {
    setBoardTheme("dark");
    expect(themedInk("#000000")).toBe("#ffffff");
    expect(themedInk("#000")).toBe("#ffffff");
    expect(themedInk("black")).toBe("#ffffff");
  });

  it("turns white ink black on a light board", () => {
    setBoardTheme("light");
    expect(themedInk("#ffffff")).toBe("#000000");
    expect(themedInk("#FFF")).toBe("#000000");
    expect(themedInk("white")).toBe("#000000");
  });

  it("leaves black alone on a light board and white alone on a dark one", () => {
    setBoardTheme("light");
    expect(themedInk("#000000")).toBe("#000000");
    setBoardTheme("dark");
    expect(themedInk("#ffffff")).toBe("#ffffff");
  });

  // A teacher choosing red means red, on either board.
  it("never touches a chosen colour", () => {
    setBoardTheme("dark");
    expect(themedInk("#ef4444")).toBe("#ef4444");
    setBoardTheme("light");
    expect(themedInk("#ef4444")).toBe("#ef4444");
  });

  it("treats a board with no theme attribute as light", () => {
    expect(themedInk("#ffffff")).toBe("#000000");
  });

  it("falls back to black when no colour is given", () => {
    expect(themedInk(undefined)).toBe("#000000");
  });
});
