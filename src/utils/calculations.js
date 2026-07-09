import { MONTHLY_DUES, DUES_START_DAY_THRESHOLD } from '../data/constants';

// dayjs 없이 순수 JS Date로 구현

function parseDate(str) {
  return new Date(str + 'T00:00:00');
}

/**
 * 납부 기준 시작월 (YYYY-MM 문자열)
 * 가입일 > 15일이면 익월
 */
export function getDuesStartMonth(joinDate) {
  const d = parseDate(joinDate);
  if (d.getDate() > DUES_START_DAY_THRESHOLD) {
    // 익월 1일
    return new Date(d.getFullYear(), d.getMonth() + 1, 1);
  }
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/**
 * 납부 기준 개월 수 & 기준액
 */
export function calcDuesBasis(joinDate, leaveDate, asOfDate) {
  const start = getDuesStartMonth(joinDate);
  const endDate = leaveDate ? parseDate(leaveDate) : (asOfDate ? parseDate(asOfDate) : new Date());
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  const months = Math.max(0, (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1);
  return { months, basis: months * MONTHLY_DUES };
}

/**
 * 회원별 납부 집계
 */
export function calcMemberDues(member, transactions) {
  if (!member || !member.joinDate) return { basis: 0, paid: 0, diff: 0, status: '정보없음' };
  const { basis } = calcDuesBasis(member.joinDate, member.leaveDate);
  const paid = transactions
    .filter(tx => tx.memberId === member.id && tx.category === '회비' && tx.type === 'income')
    .reduce((sum, tx) => sum + tx.amount, 0);
  const diff = paid - basis;
  return { basis, paid, diff, status: diff >= 0 ? '완납' : '미납부' };
}

/**
 * 파트별 잔액
 */
export function calcPartBalances(transactions) {
  const balances = { VOIX: 0, DANCE: 0, SESSION: 0, 공통: 0 };
  transactions.forEach(tx => {
    const sign = tx.type === 'income' ? 1 : -1;
    const part = tx.part || '공통';
    if (part in balances) balances[part] += sign * tx.amount;
  });
  return balances;
}

/**
 * 월별 수입/지출 집계
 */
export function calcMonthlyStats(transactions) {
  const map = {};
  transactions.forEach(tx => {
    const month = tx.datetime.slice(0, 7);
    if (!map[month]) map[month] = { month, income: 0, expense: 0 };
    if (tx.type === 'income') map[month].income += tx.amount;
    else map[month].expense += tx.amount;
  });
  return Object.values(map).sort((a, b) => a.month.localeCompare(b.month));
}

export function formatKRW(amount) {
  return Math.abs(amount).toLocaleString('ko-KR') + '원';
}

export function formatDiff(diff) {
  if (diff > 0) return `+${diff.toLocaleString()}원`;
  return `${diff.toLocaleString()}원`;
}
