export type CoreGradesTableCommonColumn = {
  class?: string;
  content: string;
  headers?: string;
};

export type CoreGradesTableItemNameColumn = {
  class?: string;
  colspan?: number;
  content: string;
  celltype?: string;
  id?: string;
};

export type CoreGradesTableLeaderColumn = {
  class?: string;
  rowspan?: number;
  content?: undefined;
};

export type CoreGradesTableRow = {
  itemname?: CoreGradesTableItemNameColumn;
  leader?: CoreGradesTableLeaderColumn;
  weight?: CoreGradesTableCommonColumn;
  grade?: CoreGradesTableCommonColumn;
  range?: CoreGradesTableCommonColumn;
  percentage?: CoreGradesTableCommonColumn;
  lettergrade?: CoreGradesTableCommonColumn;
  rank?: CoreGradesTableCommonColumn;
  average?: CoreGradesTableCommonColumn;
  feedback?: CoreGradesTableCommonColumn;
  contributiontocoursetotal?: CoreGradesTableCommonColumn;
};

export type CoreGradesTable = {
  courseid?: number;
  userid?: number;
  userfullname?: string;
  maxdepth?: number;
  tabledata?: CoreGradesTableRow[];
};

export type CoreGradesGetUserGradesTableWSResponse = {
  tables?: CoreGradesTable[];
  warnings?: unknown[];
};
