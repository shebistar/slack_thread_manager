import '@testing-library/jest-dom/vitest';

// jsdom does not implement window.matchMedia — required by sonner and other media-query libs
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// jsdom does not implement scrollIntoView — required by Radix UI Select
window.HTMLElement.prototype.scrollIntoView = () => {};
