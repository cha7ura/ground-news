import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

interface AdminLayoutProps {
  children: React.ReactNode;
  params: { locale: string };
}

export default function AdminLayout({ children, params }: AdminLayoutProps) {
  // Simple auth check: verify ADMIN_SECRET cookie matches env var
  const cookieStore = cookies();
  const adminCookie = cookieStore.get('admin_secret')?.value;
  const adminSecret = process.env.ADMIN_SECRET;

  // If ADMIN_SECRET is not set in env, allow access in development
  if (adminSecret && adminCookie !== adminSecret) {
    redirect(`/${params.locale}`);
  }

  return (
    <div>
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2">
        <div className="max-w-7xl mx-auto flex items-center gap-2 text-sm text-amber-800">
          <span className="font-medium">Admin Panel</span>
          <span className="text-amber-500">|</span>
          <a href={`/${params.locale}/admin/tags`} className="hover:underline">Tags</a>
        </div>
      </div>
      {children}
    </div>
  );
}
