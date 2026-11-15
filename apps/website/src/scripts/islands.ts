// Hydrates the server-rendered React islands. Loaded on demand by ./site.ts, so React stays out of the
// initial page load. Islands take no props: the server render and this render produce the same tree.
import { createElement, type ComponentType } from 'react';
import { hydrateRoot } from 'react-dom/client';
import BeforeAfter from '../islands/BeforeAfter';
import DemoTabs from '../islands/DemoTabs';
import PackageTabs from '../islands/PackageTabs';
import PhoneMenu from '../islands/PhoneMenu';

const registry: Record<string, ComponentType> = {
  demo: DemoTabs,
  slider: BeforeAfter,
  packages: PackageTabs,
  'phone-menu': PhoneMenu,
};

export function hydrate(el: HTMLElement) {
  const Component = registry[el.dataset.island ?? ''];
  if (!Component) return;
  hydrateRoot(el, createElement(Component), {
    onRecoverableError: (error) => console.error('[specdiff] island hydration', el.dataset.island, error),
  });
  el.dataset.hydrated = 'true';
}
