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

    // Fetch all revenue records in the date range
    const revenueRecords = await prisma.revenue.findMany({
      where: {
        createdAt: { gte: startDate },
      },
      select: {
        amount: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by month
    const monthlyRevenue = eachMonthOfInterval({
      start: startDate,
      end: new Date(),
    }).map(month => {
      const monthRevenue = revenueRecords
        .filter(r => {
          const recordMonth = startOfMonth(r.createdAt);
          return recordMonth.getTime() === startOfMonth(month).getTime();
        })
        .reduce((sum, r) => sum + r.amount, 0);

      return {
        month: format(month, 'MMM yyyy'),
        revenue: Math.round(monthRevenue * 100) / 100,
      };
    });

    return NextResponse.json(monthlyRevenue);
  } catch (error) {
    console.error('[Revenue Analytics API Error]:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch revenue analytics',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
