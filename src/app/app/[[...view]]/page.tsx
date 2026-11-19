import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import Workspace from '@/components/workspace';
export const dynamic = 'force-dynamic';
export default async function AppPage({ params }: { params: Promise<{ view?: string[] }> }) {
  const user = await currentUser();
  if (!user) redirect('/login');
  const { view = [] } = await params;
  return (
    <Workspace
      user={user}
      view={view[0] || 'overview'}
      caseId={view[0] === 'disputes' ? view[1] : undefined}
    />
  );
}
