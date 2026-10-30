// 공연 티켓의 기간별(얼리버드 등) 가격 계산 유틸.
// show.pricingMode === 'tiered'일 때만 priceTiers를 사용하고, 그 외(기본값 'fixed')에는
// show.price를 그대로 쓴다. 기존 데이터와 완전히 하위 호환된다.

// priceTiers는 시간순으로 적용되는 가격 구간 배열: [{ id, label, price, until, quantityLimit }]
// until과 quantityLimit은 서로 독립적인 마감 조건이며, 둘 다(혹은 하나만) 설정할 수 있다.
// 둘 다 설정된 경우 둘 중 하나라도 먼저 도달하면 그 구간은 마감되고 다음 구간으로 넘어간다.
// (예: "24시간 내 20장" → 24시간이 지나거나 20장이 먼저 팔리면 마감)
// 마지막 구간은 보통 조건 없이(until, quantityLimit 모두 비움) 계속 적용되도록 둔다.

const genTierId = () => `tier-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// 가격 구간 하나를 저장 가능한 형태로 정규화한다. (공연 관리 / 티켓 관리 양쪽에서 공용으로 사용)
export function cleanPriceTier(t = {}) {
  return {
    id: String(t.id || '').trim() || genTierId(),
    label: String(t.label || '').trim(),
    price: Number(t.price) > 0 ? Number(t.price) : 0,
    until: String(t.until || '').trim() || null,
    quantityLimit: Number(t.quantityLimit) > 0 ? Number(t.quantityLimit) : null,
  };
}

// soldByTier: { [tierId]: 판매된 매수 } — countSoldByTier()로 주문 목록에서 계산한다.
export function resolveActivePrice(show, now = new Date(), soldByTier = {}) {
  const fallbackPrice = Number(show?.price) || 0;
  const tiers = Array.isArray(show?.priceTiers) ? show.priceTiers : [];

  if (show?.pricingMode !== 'tiered' || tiers.length === 0) {
    return { price: fallbackPrice, tier: null, tierIndex: -1, nextCutoff: null, nextTier: null, remainingQty: null, soldOut: false };
  }

  const isClosedByDate = (t) => {
    const until = t.until ? new Date(t.until) : null;
    return Boolean(until && now.getTime() >= until.getTime());
  };
  const isClosedByQuantity = (t) => {
    const limit = Number(t.quantityLimit) || 0;
    const sold = Number(soldByTier[t.id]) || 0;
    return limit > 0 && sold >= limit;
  };
  const isClosed = (t) => isClosedByDate(t) || isClosedByQuantity(t);

  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i];
    if (isClosed(t)) continue;

    const hasDateLimit = Boolean(t.until) && !isClosedByDate(t);
    const hasQuantityLimit = Number(t.quantityLimit) > 0;
    const until = hasDateLimit ? new Date(t.until) : null;
    const sold = Number(soldByTier[t.id]) || 0;
    const remainingQty = hasQuantityLimit ? Math.max(0, Number(t.quantityLimit) - sold) : null;

    return {
      price: Number(t.price) || 0,
      tier: t,
      tierIndex: i,
      nextCutoff: until,
      nextTier: (hasDateLimit || hasQuantityLimit) ? (tiers[i + 1] || null) : null,
      remainingQty,
      soldOut: false,
    };
  }

  // 모든 구간이 마감된 경우: 마지막 구간 가격을 보여주되, 그 구간마저 마감 조건에 걸렸다면 매진 처리.
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
// 한 주문이 여러 구간에 걸쳐 있는 경우(구간별로 매수를 나눠 신청) priceBreakdown을 우선 사용하고,
// 없는 과거 주문(단일 구간 또는 수량 제한 기능 도입 이전)은 tierId/priceTierLabel로 집계한다.
export function countSoldByTier(orders = [], showId, tiers = []) {
  const idByLabel = new Map(tiers.filter(t => t.label).map(t => [t.label, t.id]));
  const result = {};
  for (const o of orders) {
    if (String(o.concertId) !== String(showId)) continue;
    if (Array.isArray(o.priceBreakdown) && o.priceBreakdown.length > 0) {
      for (const item of o.priceBreakdown) {
        const tierId = item.tierId || (item.label ? idByLabel.get(item.label) : null);
        if (!tierId) continue;
        result[tierId] = (result[tierId] || 0) + (Number(item.qty) || 0);
      }
      continue;
    }
    const tierId = o.tierId || (o.priceTierLabel ? idByLabel.get(o.priceTierLabel) : null);
    if (!tierId) continue;
    result[tierId] = (result[tierId] || 0) + (Number(o.ticketCount) || 0);
  }
  return result;
}

// 날짜로 마감되지 않은(아직 구매 가능한) 구간 목록을 반환한다. 각 구간에 수량 제한에 따른
// 잔여 수량(remainingQty, 무제한이면 null)과 신청 입력란의 상한(max, 잔여/cap 중 작은 값)을 덧붙인다.
// 예매 페이지에서 구간별로 매수를 따로 선택하게 할 때 사용한다.
export function openTiersWithAvailability(show, now = new Date(), soldByTier = {}, cap = 10) {
  const tiers = Array.isArray(show?.priceTiers) ? show.priceTiers : [];
  if (show?.pricingMode !== 'tiered' || tiers.length === 0) return [];

  const isClosedByDate = (t) => {
    const until = t.until ? new Date(t.until) : null;
    return Boolean(until && now.getTime() >= until.getTime());
  };

  return tiers.filter(t => !isClosedByDate(t)).map(t => {
    const limit = Number(t.quantityLimit) || 0;
    const sold = Number(soldByTier[t.id]) || 0;
    const remainingQty = limit > 0 ? Math.max(0, limit - sold) : null;
    const max = remainingQty != null ? Math.min(cap, remainingQty) : cap;
    return { ...t, remainingQty, max };
  });
}

// 공연의 "일반(상시 적용)" 가격 — 얼리버드 등 한시적 할인 구간과 무관하게,
// 마지막 가격 구간(보통 마감 조건 없이 계속 적용되는 구간)의 가격을 반환한다.
// 부원 회비 차감 처리처럼 할인가를 적용받으면 안 되는 경우에 사용한다.
export function regularPriceOf(show) {
  const tiers = Array.isArray(show?.priceTiers) ? show.priceTiers : [];
  if (show?.pricingMode === 'tiered' && tiers.length > 0) {
    return Number(tiers[tiers.length - 1]?.price) || 0;
  }
  return Number(show?.price) || 0;
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
