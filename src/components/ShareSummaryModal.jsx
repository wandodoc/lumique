import { useState, useMemo, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { formatKRW, getDuesStartMonth, calcPartBalances, isRefundTx, normalizeCategory } from '../utils/calculations';
import { toPng } from 'html-to-image';

export default function ShareSummaryModal({ onClose }) {
  const { state } = useApp();
  const { transactions } = state;

  // 이용 가능한 연월 목록 추출 (최근 순)
  const availableMonths = useMemo(() => {
    const months = new Set();
    transactions.forEach(t => {
      if (t.datetime && t.datetime.length >= 7) {
        months.add(t.datetime.slice(0, 7)); // YYYY-MM
      }
    });
    return Array.from(months).sort((a, b) => b.localeCompare(a));
  }, [transactions]);

  // 기본값으로 가장 최근 월 설정
  const [targetYm, setTargetYm] = useState(availableMonths[0] || '');

  const cardRef = useRef(null);
  const [copyStatus, setCopyStatus] = useState(''); // '', 'text', 'image', 'error'
  const [scale, setScale] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [cardHeight, setCardHeight] = useState(650);

  useEffect(() => {
    const handleResize = () => {
      const modalBodyWidth = Math.min(window.innerWidth - 64, 460);
      if (modalBodyWidth < 420) {
        setScale(modalBodyWidth / 420);
      } else {
        setScale(1);
      }
      setIsMobile(window.innerWidth < 768);
      if (cardRef.current) {
        setCardHeight(cardRef.current.offsetHeight);
      }
    };
    
    // Run after a short tick to allow rendering
    const timer = setTimeout(handleResize, 100);
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timer);
    };
  }, [targetYm]);

  const targetMonthNum = parseInt(targetYm.split('-')[1], 10) || 0;

  // 현재 기준일 생성
  const now = new Date();
  const dateStr = `${now.getMonth() + 1}/${now.getDate()}(${['일', '월', '화', '수', '목', '금', '토'][now.getDay()]})`;

  const txMap = useMemo(() => {
    const map = {};
    transactions.forEach(t => map[t.id] = t);
    return map;
  }, [transactions]);

  // 수입/지출 합계 및 내역 집계
  const targetIncomes = useMemo(() => {
    return transactions.filter(t => {
      if (!t.datetime.startsWith(targetYm)) return false;
      const isRefund = isRefundTx(t, txMap);
      return (t.type === 'income' && !isRefund) || (t.type === 'expense' && isRefund);
    });
  }, [transactions, targetYm, txMap]);

  const targetExpenses = useMemo(() => {
    return transactions.filter(t => {
      if (!t.datetime.startsWith(targetYm)) return false;
      const isRefund = isRefundTx(t, txMap);
      return (t.type === 'expense' && !isRefund) || (t.type === 'income' && isRefund);
    });
  }, [transactions, targetYm, txMap]);

  // 유효한 금액 계산 (상계/반환 항목은 음수로 처리)
  const getValidAmount = (tx) => {
    const isRefund = isRefundTx(tx, txMap);
    const multiplier = isRefund ? -1 : 1;

    if (tx.splitItems && tx.splitItems.length > 0) {
      return tx.splitItems.reduce((s, it) => s + (Number(it.amount) || 0) * multiplier, 0);
    }
    return (Number(tx.amount) || 0) * multiplier;
  };

  const targetNet = useMemo(() => {
    const inc = targetIncomes.reduce((s, t) => s + getValidAmount(t), 0);
    const exp = targetExpenses.reduce((s, t) => s + getValidAmount(t), 0);
    return inc - exp;
  }, [targetIncomes, targetExpenses]);

  // 회비 파트별 소계
  const duesSummary = useMemo(() => {
    const duesTxs = targetIncomes.filter(t => {
      const cat = normalizeCategory(t.category, t.type);
      if (cat !== '회비수익') return false;
      if (t.memberId) {
        const m = state.members.find(x => x.id === t.memberId);
        if (m) {
          const txDate = t.datetime.slice(0, 10);
          if (txDate < m.joinDate) return false;
          if (m.leaveDate && txDate > m.leaveDate) return false;
        }
      }
      return true;
    });
    const total = duesTxs.reduce((s, t) => s + getValidAmount(t), 0);
    const dance = duesTxs.filter(t => t.part === 'DANCE').reduce((s, t) => s + getValidAmount(t), 0);
    const voiceSession = duesTxs.filter(t => t.part === 'VOIX' || t.part === 'SESSION').reduce((s, t) => s + getValidAmount(t), 0);
    const common = duesTxs.filter(t => t.part === '공통' || !t.part).reduce((s, t) => s + getValidAmount(t), 0);

    return { total, dance, voiceSession, common };
  }, [targetIncomes, state.members]);

  // 회비수익을 제외한 기타 입금 거래들 평탄화 (상계/반환 반영)
  const otherIncomesList = useMemo(() => {
    const otherTxs = targetIncomes.filter(t => {
      const cat = normalizeCategory(t.category, t.type);
      if (cat === '회비수익') {
        if (t.memberId) {
          const m = state.members.find(x => x.id === t.memberId);
          if (m) {
            const txDate = t.datetime.slice(0, 10);
            if (txDate < m.joinDate || (m.leaveDate && txDate > m.leaveDate)) return true; // 가입 전/탈퇴 후면 기타 수입으로 취급
          }
        }
        return false;
      }
      return true;
    });

    return otherTxs.flatMap(t => {
      const isRefund = isRefundTx(t, txMap);
      const multiplier = isRefund ? -1 : 1;
      let cat = normalizeCategory(t.category, t.type);
      if (cat === '회비수익') cat = '기타수익';
      else if (t.description.includes('이자')) cat = '기타수익';

      if (t.splitItems && t.splitItems.length > 0) {
        return t.splitItems.map(it => ({
          category: it.category || cat,
          desc: it.desc || t.note || t.description,
          amount: (Number(it.amount) || 0) * multiplier
        }));
      }
      return [{
        category: cat,
        desc: t.note || t.description,
        amount: (Number(t.amount) || 0) * multiplier
      }];
    }).filter(item => item.amount !== 0);
  }, [targetIncomes, state.members, txMap]);

  // 출금 거래들 평탄화 (상계/반환 반영)
  const otherExpensesList = useMemo(() => {
    return targetExpenses.flatMap(t => {
      const isRefund = isRefundTx(t, txMap);
      const multiplier = isRefund ? -1 : 1;
      const cat = normalizeCategory(t.category, t.type);

      if (t.splitItems && t.splitItems.length > 0) {
        return t.splitItems.map(it => ({
          category: it.category || cat || '소모품비',
          desc: it.desc || t.note || t.description,
          amount: (Number(it.amount) || 0) * multiplier
        }));
      }
      return [{
        category: cat || '소모품비',
        desc: t.note || t.description,
        amount: (Number(t.amount) || 0) * multiplier
      }];
    }).filter(item => item.amount !== 0);
  }, [targetExpenses, txMap]);

  // 특정 달의 회비 기준액 계산
  const targetMonthlyBasis = useMemo(() => {
    let basis = 0;
    if (!targetYm) return 0;
    const [y, m] = targetYm.split('-').map(Number);
    
    state.members.forEach(member => {
      if (!member.joinDate || member.status !== 'active') return;
      const joinMonth = getDuesStartMonth(member.joinDate);
      const targetDate = new Date(y, m - 1, 1);
      if (targetDate < joinMonth) return; // 아직 가입 안 함
      
      if (member.leaveDate) {
        const leaveDate = new Date(member.leaveDate + 'T00:00:00');
        const leaveMonth = new Date(leaveDate.getFullYear(), leaveDate.getMonth(), 1);
        if (targetDate > leaveMonth) return; // 이미 탈퇴함
      }
      
      const memberType = member.type || '직장인';
      if (y < 2025 || (y === 2025 && m < 2)) {
        // 0
      } else if (y === 2025 && m >= 2 && m <= 7) {
        basis += (memberType === '학생' ? 5000 : 20000);
      } else {
        basis += 10000;
      }
    });
    return basis;
  }, [state.members, targetYm]);

  // 출금 내역 평탄화 및 그룹화 (상계/반환 반영)
  const expenseSummaryByCategory = useMemo(() => {
    const flatTarget = targetExpenses.flatMap(tx => {
      const isRefund = isRefundTx(tx, txMap);
      const multiplier = isRefund ? -1 : 1;
      if (tx.splitItems && tx.splitItems.length > 0) {
        return tx.splitItems.map(it => ({
          category: it.category || tx.category || '소모품',
          desc: it.desc || tx.note || tx.description,
          amount: (Number(it.amount) || 0) * multiplier
        }));
      }
      return [{
        category: tx.category || '소모품',
        desc: tx.note || tx.description,
        amount: (Number(tx.amount) || 0) * multiplier
      }];
    }).filter(t => t.amount !== 0);

    const categories = Array.from(new Set(flatTarget.map(t => t.category)));
    return categories.map(cat => {
      const list = flatTarget.filter(t => t.category === cat);
      return { category: cat, list };
    });
  }, [targetExpenses, txMap]);

  // 1. 텍스트 요약문 생성 (당월 데이터만 콤팩트하게 포함)
  const summaryText = useMemo(() => {
    const incTotal = targetIncomes.reduce((s, t) => s + getValidAmount(t), 0);
    const expTotal = targetExpenses.reduce((s, t) => s + getValidAmount(t), 0);
    const netTotal = incTotal - expTotal;

    let txt = `📊 ${targetMonthNum}월 재정 요약 (${dateStr} 기준)\n`;
    txt += `💰 총수입: +${incTotal.toLocaleString()}원\n`;
    txt += `💸 총지출: -${expTotal.toLocaleString()}원\n`;
    if (netTotal >= 0) {
      txt += `🪙 순수입: +${netTotal.toLocaleString()}원\n\n`;
    } else {
      txt += `🪙 순지출: -${Math.abs(netTotal).toLocaleString()}원\n\n`;
    }

    txt += `📍 ${targetMonthNum}월 입금 내역\n`;
    let incIdx = 1;
    if (duesSummary.total > 0) {
      let statusText = '';
      if (duesSummary.total >= targetMonthlyBasis && targetMonthlyBasis > 0) {
        statusText = duesSummary.total === targetMonthlyBasis ? ' (완납)' : ' (초과 납부)';
      } else if (targetMonthlyBasis > 0) {
        statusText = ` (기준 ${targetMonthlyBasis.toLocaleString()}원)`;
      }

      txt += `${incIdx}. 회비수익 ${duesSummary.total.toLocaleString()}원${statusText}\n`;
      if (duesSummary.dance > 0) txt += `- 댄스 ${duesSummary.dance.toLocaleString()}원\n`;
      if (duesSummary.voiceSession > 0) txt += `- 보컬/세션 ${duesSummary.voiceSession.toLocaleString()}원\n`;
      if (duesSummary.common > 0) txt += `- 공통 ${duesSummary.common.toLocaleString()}원\n`;
      incIdx++;
    }

    otherIncomesList.forEach(item => {
      txt += `${incIdx}. ${item.category} (${item.desc}) ${item.amount.toLocaleString()}원\n`;
      incIdx++;
    });

    if (targetIncomes.length === 0) txt += `입금 내역 없음\n`;

    txt += `\n📍 ${targetMonthNum}월 출금 내역\n`;
    
    if (otherExpensesList.length === 0) {
      txt += `출금 내역 없음\n`;
    } else {
      otherExpensesList.forEach((item, idx) => {
        txt += `${idx + 1}. ${item.category} (${item.desc}) ${item.amount.toLocaleString()}원\n`;
      });
    }

    txt += `\n🔗 https://lumique-beta.vercel.app/`;

    return txt.trim();
  }, [dateStr, targetMonthNum, duesSummary, otherIncomesList, otherExpensesList, targetIncomes, targetExpenses, targetMonthlyBasis]);

  // 텍스트 복사 핸들러
  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(summaryText);
      showStatus('text');
    } catch (err) {
      showStatus('error');
    }
  };

  // 이미지 복사 핸들러 (Clipboard API)
  const handleCopyImage = async () => {
    if (!cardRef.current) return;
    try {
      // toPng를 사용하여 안정적으로 생성 후 Blob 변환
      const dataUrl = await toPng(cardRef.current, {
        backgroundColor: '#f8fafc',
        width: 420,
        pixelRatio: 2,
        style: {
          transform: 'scale(1)',
          borderRadius: '0px',
          margin: '0'
        }
      });
      const res = await fetch(dataUrl);
      const blob = await res.blob();

      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': blob
        })
      ]);
      showStatus('image');
    } catch (err) {
      console.error(err);
      showStatus('error');
    }
  };

  // 이미지 저장 핸들러
  const handleDownloadImage = async () => {
    if (!cardRef.current) return;
    try {
      const dataUrl = await toPng(cardRef.current, { 
        backgroundColor: '#f8fafc',
        width: 420,
        pixelRatio: 2,
        style: { margin: '0' }
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `Lumique_Summary_${targetYm}.png`;
      a.click();
    } catch (err) {
      alert('이미지 저장에 실패했습니다.');
    }
  };

  const showStatus = (status) => {
    setCopyStatus(status);
    setTimeout(() => setCopyStatus(''), 2000);
  };

  // 이미지 카드용 데이터 집계 (이번달 기준 + 전체 잔액)
  const imageStats = useMemo(() => {
    const realTotalBalance = transactions.reduce((s, tx) => tx.type === 'income' ? s + tx.amount : s - tx.amount, 0);
    const realPartBalances = calcPartBalances(transactions);
    
    const targetIncomeTotal = targetIncomes.reduce((s, t) => s + getValidAmount(t), 0);
    const targetExpenseTotal = targetExpenses.reduce((s, t) => s + getValidAmount(t), 0);
    
    const topIncomes = [];
    if (duesSummary.total > 0) topIncomes.push({ cat: '회비수익', amount: duesSummary.total });
    
    const otherIncomesGrouped = {};
    otherIncomesList.forEach(item => {
      otherIncomesGrouped[item.category] = (otherIncomesGrouped[item.category] || 0) + item.amount;
    });
    Object.entries(otherIncomesGrouped).forEach(([cat, amount]) => {
      if (amount > 0) {
        topIncomes.push({ cat, amount });
      }
    });
    topIncomes.sort((a, b) => b.amount - a.amount);
    
    const topExpenses = expenseSummaryByCategory.map(item => {
      const sum = item.list.reduce((s, t) => s + t.amount, 0);
      return { cat: item.category, amount: sum };
    }).filter(i => i.amount > 0).sort((a, b) => b.amount - a.amount);

    return { realTotalBalance, realPartBalances, targetIncomeTotal, targetExpenseTotal, topIncomes, topExpenses };
  }, [transactions, targetIncomes, targetExpenses, duesSummary, otherIncomesList, expenseSummaryByCategory]);

  const renderCardContent = (refToUse = null) => (
    <div ref={refToUse} style={{
      width: '420px',
      minWidth: '420px',
      margin: '0 auto',
      padding: '32px 24px',
      background: '#ffffff',
      borderRadius: 24,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      color: 'var(--slate-800)',
      boxSizing: 'border-box'
    }}>
      {/* 1. 상단 헤더 (로고 & 배지) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <img src="/logo.png" alt="Lumique" style={{ height: 18, width: 'auto', objectFit: 'contain' }} />
          <div style={{ fontFamily: '"Outfit", sans-serif', fontSize: 17, fontWeight: 800, color: '#334155', letterSpacing: '-0.5px' }}>Lumique</div>
        </div>
        <div style={{ background: '#eff6ff', color: '#1d4ed8', padding: '5px 12px', borderRadius: 99, fontSize: 13, fontWeight: 700 }}>
          {targetMonthNum}월 재무 현황
        </div>
      </div>

      {/* 2. 중앙 총 잔액 */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 14, color: 'var(--slate-500)', marginBottom: 4 }}>현재 총 잔액</div>
        <div style={{ fontSize: 36, fontWeight: 900, color: '#0f172a', letterSpacing: '-1px' }}>
          {imageStats.realTotalBalance < 0 ? '-' : ''}{Math.abs(imageStats.realTotalBalance).toLocaleString()}원
        </div>
        <div style={{ fontSize: 12, color: 'var(--slate-400)', marginTop: 8 }}>
          업데이트: {new Date().getFullYear()}.{String(new Date().getMonth() + 1).padStart(2, '0')}.{String(new Date().getDate()).padStart(2, '0')}
        </div>

        {/* 파트별 잔고 현황 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', marginTop: 20, paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
          {[
            { label: 'VOIX·SESSION', val: (imageStats.realPartBalances['VOIX'] || 0) + (imageStats.realPartBalances['SESSION'] || 0) },
            { label: 'DANCE', val: imageStats.realPartBalances['DANCE'] || 0 },
            { label: '공통', val: imageStats.realPartBalances['공통'] || 0 },
          ].map(p => (
            <div key={p.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, marginBottom: 4 }}>{p.label}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: p.val < 0 ? '#e11d48' : '#334155' }}>
                {p.val < 0 ? '-' : ''}{Math.abs(p.val).toLocaleString()}원
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 수입/지출 바 */}
      <div style={{ background: 'var(--slate-50)', padding: 16, borderRadius: 16, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--slate-500)', fontWeight: 600 }}>{targetMonthNum}월 수입</div>
            <div style={{ fontSize: 16, color: '#16a34a', fontWeight: 800 }}>+{imageStats.targetIncomeTotal.toLocaleString()}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, color: 'var(--slate-500)', fontWeight: 600 }}>{targetMonthNum}월 지출</div>
            <div style={{ fontSize: 16, color: '#e11d48', fontWeight: 800 }}>-{imageStats.targetExpenseTotal.toLocaleString()}</div>
          </div>
        </div>
        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: '#e2e8f0' }}>
          <div style={{ width: `${imageStats.targetIncomeTotal + imageStats.targetExpenseTotal > 0 ? (imageStats.targetIncomeTotal / (imageStats.targetIncomeTotal + imageStats.targetExpenseTotal)) * 100 : 50}%`, background: '#22c55e' }} />
          <div style={{ width: `${imageStats.targetIncomeTotal + imageStats.targetExpenseTotal > 0 ? (imageStats.targetExpenseTotal / (imageStats.targetIncomeTotal + imageStats.targetExpenseTotal)) * 100 : 50}%`, background: '#ef4444' }} />
        </div>
      </div>

      {/* 3. 수입/지출 핵심 항목 */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#334155', marginBottom: 12, borderBottom: '2px solid #e2e8f0', paddingBottom: 8 }}>수입 (Top 4)</div>
            {imageStats.topIncomes.slice(0, 4).map(item => (
              <div key={item.cat} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                <span style={{ color: 'var(--slate-600)' }}>{item.cat}</span>
                <span style={{ fontWeight: 700 }}>{item.amount.toLocaleString()}</span>
              </div>
            ))}
            {imageStats.topIncomes.length === 0 && <div style={{ fontSize: 12, color: 'var(--slate-400)' }}>수입 없음</div>}
          </div>
          <div style={{ width: 1, background: '#e2e8f0' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#334155', marginBottom: 12, borderBottom: '2px solid #e2e8f0', paddingBottom: 8 }}>지출 (Top 4)</div>
            {imageStats.topExpenses.slice(0, 4).map(item => (
              <div key={item.cat} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                <span style={{ color: 'var(--slate-600)' }}>{item.cat}</span>
                <span style={{ fontWeight: 700 }}>{item.amount.toLocaleString()}</span>
              </div>
            ))}
            {imageStats.topExpenses.length === 0 && <div style={{ fontSize: 12, color: 'var(--slate-400)' }}>지출 없음</div>}
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'center', marginTop: 24, fontSize: 11, color: '#cbd5e1', fontWeight: 600 }}>
        Lumique Financial Ledger
      </div>
    </div>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxWidth: isMobile ? '460px' : '900px', width: '100%', transition: 'all 0.3s ease' }}>
        <div className="modal-handle" />

        {/* 헤더 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>📊 월별 요약 공유</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--slate-400)' }}>✕</button>
        </div>

        {/* 선택 옵션 */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: 'var(--slate-500)', fontWeight: 600, display: 'block', marginBottom: 6 }}>공유 대상 월 선택</label>
          <select value={targetYm} onChange={e => setTargetYm(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--slate-200)', borderRadius: 10 }}>
            {availableMonths.map(m => <option key={m} value={m}>{m.replace('-', '년 ')}월</option>)}
          </select>
        </div>

        {/* 탭 / 컨트롤 버튼 */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <button className="btn-primary" style={{ flex: '1 1 120px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} onClick={handleCopyText}>
            📋 텍스트 복사
          </button>
          {!isMobile && (
            <button className="btn-primary" style={{ flex: '1 1 120px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'var(--emerald-600)' }} onClick={handleCopyImage}>
              🖼️ 이미지 복사
            </button>
          )}
          <button className="btn-secondary" style={{ flex: '1 1 80px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px', gap: 6 }} onClick={handleDownloadImage} title="이미지 다운로드">
            💾 이미지 저장
          </button>
        </div>

        {/* 복사 성공 메시지 */}
        {copyStatus && (
          <div style={{
            padding: '10px',
            borderRadius: 8,
            backgroundColor: copyStatus === 'error' ? '#fef2f2' : '#f0fdf4',
            color: copyStatus === 'error' ? 'var(--red-500)' : '#16a34a',
            fontSize: 13,
            fontWeight: 600,
            textAlign: 'center',
            marginBottom: 16
          }}>
            {copyStatus === 'text' && '📋 텍스트 요약이 클립보드에 복사되었습니다!'}
            {copyStatus === 'image' && '🖼️ 요약 카드 이미지가 클립보드에 복사되었습니다!'}
            {copyStatus === 'error' && '❌ 클립보드 복사에 실패했습니다. 브라우저 설정을 확인해주세요.'}
          </div>
        )}

        {/* 텍스트 미리보기 및 이미지 카드 렌더링 (반응형 2열 레이아웃) */}
        <div style={{
          maxHeight: 'calc(100vh - 280px)',
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          border: '1px solid var(--slate-200)',
          borderRadius: 12,
          padding: 16,
          background: 'var(--slate-50)',
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          gap: '20px'
        }}>
          {/* 1. 텍스트 미리보기 */}
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minWidth: isMobile ? '100%' : '300px'
          }}>
            <div style={{ fontSize: 11, color: 'var(--slate-400)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 8, textAlign: 'center' }}>
              📋 텍스트 복사 내용 미리보기
            </div>
            <textarea
              readOnly
              value={summaryText}
              style={{
                width: '100%',
                height: isMobile ? '240px' : '100%',
                minHeight: '280px',
                padding: '12px',
                borderRadius: '12px',
                border: '1px solid var(--slate-200)',
                background: '#ffffff',
                fontFamily: 'monospace',
                fontSize: '12px',
                lineHeight: '1.5',
                resize: 'none',
                outline: 'none',
                color: 'var(--slate-700)',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* 구분선 (PC 전용) */}
          {!isMobile && <div style={{ width: '1px', background: 'var(--slate-200)', alignSelf: 'stretch' }} />}

          {/* 2. 이미지 카드 미리보기 */}
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            minWidth: isMobile ? '100%' : '420px'
          }}>
            <div style={{ fontSize: 11, color: 'var(--slate-400)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 8, textAlign: 'center' }}>
              📷 공유 카드 이미지 미리보기 {scale < 1 && <span style={{ color: 'var(--blue-500)', textTransform: 'none' }}>(터치하여 크게 보기)</span>}
            </div>
            
            {/* 실제로 이미지로 변환될 DOM 영역 */}
            <div style={{
              width: '100%',
              overflow: 'hidden',
              display: 'flex',
              justifyContent: 'center'
            }}>
              <div style={{
                width: 420,
                height: cardHeight * scale,
                transform: `scale(${scale})`,
                transformOrigin: 'top center',
                cursor: 'pointer',
                marginBottom: cardHeight * (scale - 1)
              }} onClick={() => setIsFullscreen(true)}>
                {renderCardContent(cardRef)}
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* 전체화면 보기 모달 */}
      {isFullscreen && (
        <div className="modal-overlay" onClick={() => setIsFullscreen(false)} style={{ zIndex: 99999, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ 
            maxWidth: '100%', 
            width: 'auto', 
            background: 'none', 
            boxShadow: 'none', 
            padding: 0,
            overflow: 'visible',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            position: 'relative'
          }}>
            <button onClick={() => setIsFullscreen(false)} style={{
              position: 'absolute',
              top: -46,
              right: 12,
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              borderRadius: '50%',
              width: 36,
              height: 36,
              color: '#fff',
              fontSize: 20,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>✕</button>
            <div style={{
              transform: window.innerWidth < 460 ? `scale(${Math.min(1, (window.innerWidth - 32) / 420)})` : 'scale(1)',
              transformOrigin: 'center center',
              borderRadius: 24,
              overflow: 'hidden',
              boxShadow: '0 20px 40px rgba(0,0,0,0.4)'
            }}>
              {renderCardContent(null)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
