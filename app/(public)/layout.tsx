/**
 * Public layout — no admin shell, no auth. Used for proposals, surveys, etc.
 */
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#F3F3EF]">
      {children}
    </div>
  );
}
