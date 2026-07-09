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
export function calcDuesBasis(joinDate, leaveDate, asOfDate, member) {
  const start = getDuesStartMonth(joinDate);
  const endDate = leaveDate ? parseDate(leaveDate) : (asOfDate ? parseDate(asOfDate) : new Date());
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  
  if (end < start) return { months: 0, basis: 0 };
  
  let months = 0;
  let basis = 0;
  
  const memberType = member?.type || '직장인';
  
  let curr = new Date(start.getFullYear(), start.getMonth(), 1);
  while (curr <= end) {
    months++;
    const y = curr.getFullYear();
    const m = curr.getMonth() + 1; // 1 ~ 12
    
    // 2025년 2월부터 모금 시작 (이전은 0원)
    if (y < 2025 || (y === 2025 && m < 2)) {
      basis += 0;
    } 
    // 2025년 2월 ~ 7월 (6개월간 직장인 2.0 / 학생 0.5)
    else if (y === 2025 && m >= 2 && m <= 7) {
      basis += (memberType === '학생' ? 5000 : 20000);
    } 
    // 2025년 8월 이후 (일괄 1만원)
    else {
      basis += 10000;
    }
    
    curr = new Date(curr.getFullYear(), curr.getMonth() + 1, 1);
  }
  
  // 2025년도 특별 예외/보정 금액 적용 (휴식 등 개인별 사유)
  if (member && member.offset2025 && end.getFullYear() >= 2025) {
    basis += member.offset2025;
  }
  
  return { months, basis };
}

/**
 * 회원별 납부 집계
 */
export function calcMemberDues(member, transactions) {
  if (!member || !member.joinDate) return { basis: 0, paid: 0, diff: 0, status: '정보없음', history: [] };
  const { basis } = calcDuesBasis(member.joinDate, member.leaveDate, null, member);
  let paid = 0;
  const history = [];

  transactions.forEach(tx => {
    if (tx.type !== 'income') return;
    
    const txDate = tx.datetime.slice(0, 10);
    
    // 가입일 이전이나 탈퇴일 이후의 입금 내역은 회비로 취급하지 않음 (개인 정산 등)
    if (txDate < member.joinDate) return;
    if (member.leaveDate && txDate > member.leaveDate) return;
    
    if (tx.splitItems && tx.splitItems.length > 0) {
      tx.splitItems.forEach(item => {
        // 부모(tx)가 상계되었거나, 개별 아이템(item)이 상계된 경우 모두 제외
        if (!tx.linkedTxId && !item.linkedTxId && item.memberId === member.id && item.category === '회비') {
          const amt = Number(item.amount) || 0;
          paid += amt;
          history.push({ ...tx, amount: amt, isSplit: true, splitDesc: item.desc });
        }
      });
    } else {
      if (!tx.linkedTxId && tx.memberId === member.id && tx.category === '회비') {
        paid += tx.amount;
        history.push(tx);
      }
    }
  });
  history.sort((a, b) => b.datetime.localeCompare(a.datetime));
  const diff = paid - basis;
  return { basis, paid, diff, status: diff >= 0 ? '완납' : '미납부', history };
}

/**
 * 파트별 잔액
 */
export function calcPartBalances(transactions) {
  const balances = { VOIX: 0, DANCE: 0, SESSION: 0, 공통: 0 };
  transactions.forEach(tx => {
    const sign = tx.type === 'income' ? 1 : -1;
    if (tx.splitItems && tx.splitItems.length > 0) {
      tx.splitItems.forEach(item => {
        const part = item.part || '공통';
        const amount = Number(item.amount) || 0;
        if (part in balances) balances[part] += sign * amount;
      });
    } else {
      const part = tx.part || '공통';
      if (part in balances) balances[part] += sign * tx.amount;
    }
  });
  return balances;
}

/**
 * 월별 수입/지출 집계
 */
export function calcMonthlyStats(transactions) {
  const map = {};
  transactions.forEach(tx => {
    if (tx.linkedTxId) return; // 전체 상계된 거래 제외
    const month = tx.datetime.slice(0, 7);
    if (!map[month]) map[month] = { month, income: 0, expense: 0 };
    
    let validAmount = 0;
    if (tx.splitItems && tx.splitItems.length > 0) {
      validAmount = tx.splitItems.filter(it => !it.linkedTxId).reduce((s, it) => s + (Number(it.amount) || 0), 0);
    } else {
      validAmount = Number(tx.amount) || 0;
    }
    
    if (tx.type === 'income') map[month].income += validAmount;
    else map[month].expense += validAmount;
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
