import { MONTHLY_DUES, DUES_START_DAY_THRESHOLD } from '../data/constants';

/**
 * 상호 연결된(linked) 두 거래 중 어느 것이 '반환/회수(환불)' 거래인지 판별합니다.
 * 나중에 발생한 거래를 환불 거래로 간주합니다.
 */
export function isRefundTx(tx, allTransactionsMap) {
  if (!tx.linkedTxId) return false;
  const linked = allTransactionsMap[tx.linkedTxId];
  if (!linked) return true; // 연결된 원본이 없으면 환불로 간주
  if (tx.datetime > linked.datetime) return true;
  if (tx.datetime === linked.datetime) return tx.id > linked.id;
  return false;
}

export function sortByPartAndName(arr) {
  const partOrder = { 'VOIX': 1, 'DANCE': 2, 'SESSION': 3, '공통': 4 };
  const getPartWeight = p => partOrder[p] || 99;

  return [...arr].sort((a, b) => {
    const wA = getPartWeight(a.part);
    const wB = getPartWeight(b.part);
    if (wA !== wB) return wA - wB;
    return a.name.localeCompare(b.name, 'ko');
  });
}

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

  const txMap = {};
  transactions.forEach(t => txMap[t.id] = t);

  transactions.forEach(tx => {
    const isRefund = isRefundTx(tx, txMap);
    const isIncome = tx.type === 'income' && !isRefund;
    const isRecovery = tx.type === 'expense' && isRefund;
    if (!isIncome && !isRecovery) return;
    
    const txDate = tx.datetime.slice(0, 10);
    
    // 가입일 이전이나 탈퇴일 이후의 입금/회수 내역은 회비로 취급하지 않음 (개인 정산 등)
    if (txDate < member.joinDate) return;
    if (member.leaveDate && txDate > member.leaveDate) return;
    
    const multiplier = isRecovery ? -1 : 1;

    if (tx.splitItems && tx.splitItems.length > 0) {
      tx.splitItems.forEach(item => {
        const itemCat = normalizeCategory(item.category, 'income');
        if (!item.linkedTxId && item.memberId === member.id && itemCat === '회비수익') {
          const amt = (Number(item.amount) || 0) * multiplier;
          paid += amt;
          history.push({ ...tx, amount: amt, isSplit: true, splitDesc: item.desc });
        }
      });
    } else {
      const txCat = normalizeCategory(tx.category, tx.type);
      if (tx.memberId === member.id && txCat === '회비수익') {
        const amt = tx.amount * multiplier;
        paid += amt;
        history.push({ ...tx, amount: amt });
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
  const txMap = {};
  transactions.forEach(t => txMap[t.id] = t);

  transactions.forEach(tx => {
    const month = tx.datetime.slice(0, 7);
    if (!map[month]) map[month] = { month, income: 0, expense: 0 };
    
    let amount = 0;
    if (tx.splitItems && tx.splitItems.length > 0) {
      amount = tx.splitItems.reduce((s, it) => s + (Number(it.amount) || 0), 0);
    } else {
      amount = Number(tx.amount) || 0;
    }
    
    const isRefund = isRefundTx(tx, txMap);

    if (tx.type === 'income') {
      if (isRefund) map[month].expense -= amount; // 지출 반환 -> 지출 차감
      else map[month].income += amount;
    } else {
      if (isRefund) map[month].income -= amount; // 수입 회수 -> 수입 차감
      else map[month].expense += amount;
    }
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

export function normalizeCategory(category, type) {
  const cat = category ? category.trim() : '기타';
  
  // 이미 8대 표준 계정과목인 경우, 그대로 즉시 반환하여 값의 유실을 방지합니다.
  const STANDARD_CATEGORIES = [
    '회비수익', '사업수익', '기타수익',
    '임차료', '비품', '외주비', '소모품비', '복리후생비'
  ];
  if (STANDARD_CATEGORIES.includes(cat)) {
    return cat;
  }
  
  if (type === 'income') {
    if (cat === '회비' || cat.includes('회비') || cat.includes('가입비')) {
      return '회비수익';
    }
    if (cat === '공연 수입' || cat === '공연 수익' || cat.includes('공연') || cat.includes('티켓') || cat.includes('행사') || cat.includes('찬조')) {
      return '사업수익';
    }
    if (cat === '이자/기타' || cat.includes('이자') || cat.includes('기타') || cat === '') {
      return '기타수익';
    }
    return '기타수익';
  } else {
    if (cat === '연습실 대여' || cat.includes('대여') || cat.includes('대관') || cat.includes('연습실') || cat.includes('임차')) {
      return '임차료';
    }
    if (cat === '비품' || cat.includes('스피커') || cat.includes('마이크') || cat.includes('장비') || cat.includes('비품')) {
      return '비품';
    }
    if (cat === '사례비' || cat === '주차비' || cat.includes('스태프') || cat.includes('사례비') || cat.includes('주차') || cat.includes('외주') || cat.includes('용역') || cat.includes('강사')) {
      return '외주비';
    }
    if (cat === '소모품' || cat.includes('의상') || cat.includes('소품') || cat.includes('메이크업') || cat.includes('화장') || cat.includes('소모품')) {
      return '소모품비';
    }
    if (cat === '식대' || cat.includes('식대') || cat.includes('밥') || cat.includes('엠티') || cat.includes('MT') || cat.includes('회식') || cat.includes('단합') || cat.includes('복리') || cat.includes('간식')) {
      return '복리후생비';
    }
    return '소모품비';
  }
}
