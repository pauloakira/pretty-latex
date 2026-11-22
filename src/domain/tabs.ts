/** One open file in the title bar. The open/save card fills these in. */
export type Tab = {
  id: string;
  title: string;
  dirty: boolean;
};
