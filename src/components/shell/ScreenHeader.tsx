/** Top-of-screen title used by each tab's page. */
export function ScreenHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="mb-4 pt-2">
      <h1 className="text-xl font-bold text-text">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
    </header>
  );
}
