import type {
  CsBoardMode,
  CsNotebookOrientation,
  CsNotebookStyle,
  CsStroke,
} from "../../api/classroom";

export interface ClassroomPageClipboard {
  version: 1;
  type: "classroom-page";
  mode: CsBoardMode;
  pageUrl?: string;
  notebookStyle: CsNotebookStyle;
  notebookOrientation?: CsNotebookOrientation;
  strokes: CsStroke[];
}

export interface ClassroomNotebookClipboard {
  version: 1;
  type: "classroom-notebook-pages";
  mode: "notebook";
  pages: Array<{
    notebookStyle: CsNotebookStyle;
    notebookOrientation?: CsNotebookOrientation;
    strokes: CsStroke[];
  }>;
}

export const CLASSROOM_PAGE_CLIPBOARD_KEY = "classroom-page-clipboard-v1";
