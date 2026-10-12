// 공연 티켓의 기간별(얼리버드 등) 가격 계산 유틸.
// show.pricingMode === 'tiered'일 때만 priceTiers를 사용하고, 그 외(기본값 'fixed')에는
// show.price를 그대로 쓴다. 기존 데이터와 완전히 하위 호환된다.

// priceTiers는 시간순으로 적용되는 가격 구간 배열: [{ id, label, price, until }]
// 각 구간은 now < until 인 동안 적용되고, until이 비어 있으면(보통 마지막 구간) 그 뒤로 계속 적용된다.
export function resolveActivePrice(show, now = new Date()) {
  const fallbackPrice = Number(show?.price) || 0;
  const tiers = Array.isArray(show?.priceTiers) ? show.priceTiers : [];

  if (show?.pricingMode !== 'tiered' || tiers.length === 0) {
    return { price: fallbackPrice, tier: null, tierIndex: -1, nextCutoff: null };
  }

  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i];
    const until = t.until ? new Date(t.until) : null;
    if (!until || now.getTime() < until.getTime()) {
      return { price: Number(t.price) || 0, tier: t, tierIndex: i, nextCutoff: until };
    }
  }

  const last = tiers[tiers.length - 1];
  return { price: Number(last?.price) || 0, tier: last, tierIndex: tiers.length - 1, nextCutoff: null };
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
