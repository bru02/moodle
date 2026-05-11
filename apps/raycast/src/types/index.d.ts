import {
  CoreCourseGetContentsWSModule,
  CoreCourseModuleContentFile,
} from "./contents";
import { CoreEnrolledCourseData } from "./course";

type AppendArrayIndex<K extends PropertyKey> = K extends string
  ? `${K}[${number}]`
  : K;

/**
 * Helper that remaps array properties so their keys include `[number]` and values become the element type.
 * Useful for representing structures like WS params when serialising arrays as indexed query params.
 */
export type ArrayValuesToIndexedAccess<T> = {
  [K in keyof T as NonNullable<T[K]> extends readonly unknown[]
    ? AppendArrayIndex<K>
    : K]: NonNullable<T[K]> extends readonly (infer U)[] ? U : T[K];
};
/**
 * Structure of warnings returned by WS.
 */
export type CoreWSExternalWarning = {
  /**
   * Item.
   */
  item?: string;

  /**
   * Item id.
   */
  itemid?: number;

  /**
   * The warning code can be used by the client app to implement specific behaviour.
   */
  warningcode: string;

  /**
   * Untranslated english message to explain the warning.
   */
  message: string;
};

/**
 * Define text formatting types.
 */
export enum CoreTextFormat {
  FORMAT_MOODLE = 0, // Does all sorts of transformations and filtering.
  FORMAT_HTML = 1, // Plain HTML (with some tags stripped). Use it by default.
  FORMAT_PLAIN = 2, // Plain text (even tags are printed in full).
  // FORMAT_WIKI is deprecated since 2005...
  FORMAT_MARKDOWN = 4, // Markdown-formatted text http://daringfireball.net/projects/markdown/
}

/**
 * Structure of files returned by WS.
 */
export type CoreWSExternalFile = {
  filename?: string; // File name.
  filepath?: string; // File path.
  filesize?: number; // File size.
  fileurl: string; // Downloadable file url.
  timemodified?: number; // Time modified.
  mimetype?: string; // File mime type.
  isexternalfile?: boolean; // Whether is an external file.
  repositorytype?: string; // The repository type for the external files.
  icon?: string; // @since 4.4. Relative path to the relevant file type icon based on the file's mime type.
};

/**
 * Structure of files returned by stored_file_exporter.
 */
export type CoreWSStoredFile = {
  contextid: number; // Contextid.
  component: string; // Component.
  filearea: string; // Filearea.
  itemid: number; // Itemid.
  filepath: string; // Filepath.
  filename: string; // Filename.
  isdir: boolean; // Isdir.
  isimage: boolean; // Isimage.
  timemodified: number; // Timemodified.
  timecreated: number; // Timecreated.
  filesize: number; // Filesize.
  author: string; // Author.
  license: string; // License.
  filenameshort: string; // Filenameshort.
  filesizeformatted: string; // Filesizeformatted.
  icon: string; // Icon.
  timecreatedformatted: string; // Timecreatedformatted.
  timemodifiedformatted: string; // Timemodifiedformatted.
  url: string; // Url.
  urls: {
    export?: string; // The URL used to export the attachment.
  };
  html: {
    plagiarism?: string; // The HTML source for the Plagiarism Response.
  };
  mimetype: undefined; // File mimetype. @todo Not implemented yet in Moodle, see MDL-71354.
};

export type Module = CoreCourseGetContentsWSModule;
export type Course = CoreEnrolledCourseData;
export type Content = CoreCourseModuleContentFile;
export type FilePath = string;

/**
 * Structure of the rating info returned by web services.
 */
export type CoreRatingInfo = {
  contextid: number; // Context id.
  component: string; // Context name.
  ratingarea: string; // Rating area name.
  canviewall?: boolean; // Whether the user can view all the individual ratings.
  canviewany?: boolean; // Whether the user can view aggregate of ratings of others.
  scales?: CoreRatingScale[]; // Different scales used information.
  ratings?: CoreRatingInfoItem[]; // The ratings.
};

/**
 * Structure of scales in the rating info.
 */
export type CoreRatingScale = {
  id: number; // Scale id.
  courseid?: number; // Course id.
  name?: string; // Scale name (when a real scale is used).
  max: number; // Max value for the scale.
  isnumeric: boolean; // Whether is a numeric scale.
  items?: {
    // Scale items. Only returned for not numerical scales.
    value: number; // Scale value/option id.
    name: string; // Scale name.
  }[];
};

/**
 * Structure of items in the rating info.
 */
export type CoreRatingInfoItem = {
  itemid: number; // Item id.
  scaleid?: number; // Scale id.
  scale?: CoreRatingScale; // Added for rendering purposes.
  userid?: number; // User who rated id.
  aggregate?: number; // Aggregated ratings grade.
  aggregatestr?: string; // Aggregated ratings as string.
  aggregatelabel?: string; // The aggregation label.
  count?: number; // Ratings count (used when aggregating).
  rating?: number; // The rating the user gave.
  canrate?: boolean; // Whether the user can rate the item.
  canviewaggregate?: boolean; // Whether the user can view the aggregated grade.
};

/**
 * Common data returned by get modules by course function.
 * This relates to LMS helper_for_get_mods_by_courses::standard_coursemodule_elements_returns,
 * do not modify unless the exporter changes.
 * This is not implemented as an exporter in LMS right now.
 */
export type CoreCourseModuleStandardElements = {
  id: number; // Activity instance id.
  coursemodule: number; // Course module id.
  course: number; // Course id.
  name: string; // Activity name.
  intro?: string; // Activity introduction.
  introformat?: number; // Intro format (1 = HTML, 0 = MOODLE, 2 = PLAIN, or 4 = MARKDOWN).
  introfiles?: CoreWSExternalFile[];
  section?: number; // Course section id.
  visible?: boolean; // Visible.
  groupmode?: number; // Group mode.
  groupingid?: number; // Group id.
  lang?: string; // @since 4.1. Forced activity language.
};

export type CoreWSErrorData = {
  message: string;
  exception: string; // Name of the Moodle exception.
  errorcode?: string;
};
