import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { NextResponse } from 'next/server';

export async function requireAdmin() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Please sign in' },
      { status: 401 }
    );
  }

  const userRole = (session.user as any).role;
  if (userRole !== 'admin' && userRole !== 'superadmin') {
    return NextResponse.json(
      { error: 'Forbidden', message: 'Admin access required' },
      { status: 403 }
    );
  }

  return null; // Auth passed
}

export async function getSessionUser() {
  const session = await getServerSession(authOptions);
  return session?.user || null;
}
