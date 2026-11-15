// @specdiff/viewer — the version-aware API reference (VW-01..VW-14).
export { Viewer } from './Viewer';
export type { Brand, CompareFn, CompareInput, LoadError, ThemeSetting, VersionSet, ViewerProps, ViewerVersion } from './types';
export { buildModel, search, deref, typeLabel, METHODS, type Model, type Op, type SchemaEntry, type SearchHit } from './model';
export { sample, exampleFor, buildUrl, type Lang } from './samples';
export { indexChanges, checklist, type ChangeIndex } from './change-index';
export { checkSchema, requestIssues } from './request';
