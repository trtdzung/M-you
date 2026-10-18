/** Route group marker. Signed-in chrome lives in `AppChrome`, so this group does not mount its own frame. */
export default function FestiveLayout({ children }: { children: React.ReactNode }) {
  return children;
}
