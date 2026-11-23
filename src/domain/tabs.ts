/** One open file in the title bar. */
export type Tab = {
  id: string;
  title: string;
  dirty: boolean;
  /** Shown as the tooltip; null for an unsaved new file. */
  path: string | null;
};
