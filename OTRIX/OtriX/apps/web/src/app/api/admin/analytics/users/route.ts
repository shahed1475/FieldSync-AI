import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { subMonths, eachMonthOfInterval, startOfMonth, format } from 'date-fns';

export async function GET(request: NextRequest) {
  // Check admin authentication
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const months = parseInt(searchParams.get('months') || '12');
    const startDate = subMonths(new Date(), months);

    // Fetch all users in the date range
    const users = await prisma.user.findMany({
      where: {
        createdAt: { gte: startDate },
      },
      select: {
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by month
    const monthlyUsers = eachMonthOfInterval({
      start: startDate,
      end: new Date(),
    }).map(month => {
      const count = users.filter(u => {
        const userMonth = startOfMonth(u.createdAt);
        return userMonth.getTime() === startOfMonth(month).getTime();
      }).length;

      return {
        month: format(month, 'MMM yyyy'),
        count,
      };
    });

    return NextResponse.json(monthlyUsers);
  } catch (error) {
    console.error('[User Analytics API Error]:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch user analytics',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
