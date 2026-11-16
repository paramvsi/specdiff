import { beforeEach, expect, it } from 'vitest';
import { defaultSettings, persistedSettings, useApp } from './store';

const mine = { json: { ignoreKeys: ['updatedAt'] } };
const theirs = { json: { ignoreKeys: ['secret'] } };
beforeEach(() => useApp.setState({ settings: { ...defaultSettings, config: mine }, savedConfig: null, before: null, after: null }));

it("M-14: a link's rules apply to that comparison only; what is saved stays mine", () => {
  useApp.getState().applyLinkConfig(theirs);
  expect(useApp.getState().settings.config).toEqual(theirs);
  expect(persistedSettings(useApp.getState()).config).toEqual(mine);
});
it('M-14: "Use my rules" puts mine back', () => {
  useApp.getState().applyLinkConfig(theirs);
  useApp.getState().restoreMyConfig();
  expect(useApp.getState().settings.config).toEqual(mine);
  expect(useApp.getState().savedConfig).toBeNull();
});
it('M-14: "Save theirs as mine" keeps theirs and saves it', () => {
  useApp.getState().applyLinkConfig(theirs);
  useApp.getState().keepLinkConfig();
  expect(persistedSettings(useApp.getState()).config).toEqual(theirs);
  expect(useApp.getState().savedConfig).toBeNull();
});
it('M-14: a new comparison (a new file) goes back to my rules', () => {
  useApp.getState().applyLinkConfig(theirs);
  useApp.getState().setSource('before', { name: 'a.json', content: '{}', size: 2 });
  expect(useApp.getState().settings.config).toEqual(mine);
});
