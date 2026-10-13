// 공연 티켓의 기간별(얼리버드 등) 가격 계산 유틸.
// show.pricingMode === 'tiered'일 때만 priceTiers를 사용하고, 그 외(기본값 'fixed')에는
// show.price를 그대로 쓴다. 기존 데이터와 완전히 하위 호환된다.

// priceTiers는 시간순으로 적용되는 가격 구간 배열: [{ id, label, price, until, limitType, quantityLimit }]
// 각 구간은 limitType이 'quantity'면 quantityLimit매가 판매될 때까지, 그 외(기본 'date')에는
// now < until 인 동안 적용된다. 마감 조건에 도달하면 다음 구간으로 넘어가고,
// 마지막 구간은 보통 조건 없이(until 없음) 계속 적용되도록 둔다.

// soldByTier: { [tierId]: 판매된 매수 } — countSoldByTier()로 주문 목록에서 계산한다.
export function resolveActivePrice(show, now = new Date(), soldByTier = {}) {
  const fallbackPrice = Number(show?.price) || 0;
  const tiers = Array.isArray(show?.priceTiers) ? show.priceTiers : [];

  if (show?.pricingMode !== 'tiered' || tiers.length === 0) {
    return { price: fallbackPrice, tier: null, tierIndex: -1, nextCutoff: null, nextTier: null, remainingQty: null, soldOut: false };
  }

  const isClosed = (t) => {
    const sold = Number(soldByTier[t.id]) || 0;
    if (t.limitType === 'quantity') {
      const limit = Number(t.quantityLimit) || 0;
      return limit > 0 && sold >= limit;
    }
    const until = t.until ? new Date(t.until) : null;
    return Boolean(until && now.getTime() >= until.getTime());
  };

  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i];
    if (isClosed(t)) continue;

    const isQuantityLimited = t.limitType === 'quantity' && Number(t.quantityLimit) > 0;
    const until = !isQuantityLimited && t.until ? new Date(t.until) : null;
    const sold = Number(soldByTier[t.id]) || 0;
    const remainingQty = isQuantityLimited ? Math.max(0, Number(t.quantityLimit) - sold) : null;

    return {
      price: Number(t.price) || 0,
      tier: t,
      tierIndex: i,
      nextCutoff: until,
      nextTier: (until || isQuantityLimited) ? (tiers[i + 1] || null) : null,
      remainingQty,
      soldOut: false,
    };
  }

  // 모든 구간이 마감된 경우: 마지막 구간 가격을 보여주되, 그 구간마저 수량 마감이라면 매진 처리.
  const last = tiers[tiers.length - 1];
  const lastSoldOut = last ? isClosed(last) : false;
  return {
    price: Number(last?.price) || 0,
    tier: last || null,
    tierIndex: tiers.length - 1,
    nextCutoff: null,
    nextTier: null,
    remainingQty: lastSoldOut ? 0 : null,
    soldOut: lastSoldOut,
  };
}

// 공연의 주문 목록에서 가격 구간(tierId)별로 판매된 매수를 합산한다.
// tierId가 없는 과거 주문(수량 제한 기능 도입 이전에 신청된 건)은 당시 기록해 둔
// priceTierLabel을 현재 구간 이름과 매칭해 최대한 맞춰 집계한다.
export function countSoldByTier(orders = [], showId, tiers = []) {
  const idByLabel = new Map(tiers.filter(t => t.label).map(t => [t.label, t.id]));
  const result = {};
  for (const o of orders) {
    if (o.concertId !== showId) continue;
    const tierId = o.tierId || (o.priceTierLabel ? idByLabel.get(o.priceTierLabel) : null);
    if (!tierId) continue;
    result[tierId] = (result[tierId] || 0) + (Number(o.ticketCount) || 0);
  }
  return result;
}

export function formatCountdown(ms) {
  if (ms == null || ms <= 0) return '00:00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return days > 0 ? `${days}일 ${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export function formatTierUntil(until) {
  if (!until) return '';
  const d = new Date(until);
  if (Number.isNaN(d.getTime())) return '';
  const w = ['일', '월', '화', '수', '목', '금', '토'];
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()}(${w[d.getDay()]}) ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
