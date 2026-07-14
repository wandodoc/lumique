import { useState, useEffect, useCallback } from 'react';
import './PageStyles.css';

const LS_SHOWS  = 'lumique_performances';
const LS_ORDERS = 'lumique_ticket_orders';
const TICKET_PRICE   = 5000;
const SUPPORT_ACCOUNT = '토스뱅크 1001-7629-3105 강맥';

const loadLS = (key) => {
  try {
    const v = localStorage.getItem(key);
    if (!v) return [];
    const parsed = JSON.parse(v);
    if (!Array.isArray(parsed)) return [];
    // 구버전 목업 데이터(더미 아이디 show-1, show-2, show-3 또는 객체가 아닌 값)가 잔존할 경우 영구 차단
    return parsed.filter(item => item && item.id && !String(item.id).startsWith('show-dummy') && item.id !== 'show-1' && item.id !== 'show-2' && item.id !== 'show-3');
  } catch {
    return [];
  }
};
const saveLS = (key, val) => {
  try {
    if (!val || (Array.isArray(val) && val.length === 0)) {
      localStorage.setItem(key, JSON.stringify([]));
    } else {
      localStorage.setItem(key, JSON.stringify(val));
    }
  } catch {}
};

// 날짜+시간 요일 포함 포맷터
const formatDateTime = (dateStr, timeStr) => {
  if (!dateStr) return '';
  const dateObj = new Date(dateStr);
  if (isNaN(dateObj.getTime())) return `${dateStr} ${timeStr || ''}`;
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const dow = days[dateObj.getDay()];
  const [y, m, d] = dateStr.split('-');
  const formattedM = parseInt(m, 10);
  const formattedD = parseInt(d, 10);
  const timeFormatted = timeStr || '00:00';
  return `${y}년 ${formattedM}월 ${formattedD}일 (${dow}) ${timeFormatted}`;
};

/* ────── Badge ────── */
function Badge({ label, color }) {
  const map = {
    green : { bg:'#f0fdf4', text:'#15803d', border:'#bbf7d0' },
    amber : { bg:'#fffbeb', text:'#b45309', border:'#fde68a' },
    blue  : { bg:'#eff6ff', text:'#1d4ed8', border:'#bfdbfe' },
    slate : { bg:'#f8fafc', text:'#475569', border:'#e2e8f0' },
    red   : { bg:'#fff1f2', text:'#be123c', border:'#fecdd3' },
  };
  const s = map[color] || map.slate;
  return (
    <span style={{ display:'inline-block', padding:'3px 10px', borderRadius:20, fontSize:12,
      fontWeight:700, background:s.bg, color:s.text, border:`1px solid ${s.border}`, whiteSpace:'nowrap' }}>
      {label}
    </span>
  );
}

/* ────── 통계 위젯 ────── */
function StatsRow({ orders }) {
  const confirmed  = orders.filter(o => o.depositStatus === '입금완료');
  const totalAmt   = confirmed.reduce((s, o) => s + (o.totalPrice || 0), 0);
  const totalTix   = orders.reduce((s, o) => s + (o.ticketCount || 0), 0);
  const entered    = orders.filter(o => o.attendanceStatus === '입장완료').length;
  const items = [
    { label:'총 예매 매수',    value:`${totalTix}매`,                   icon:'🎟️' },
    { label:'입금완료 총액',   value:`${totalAmt.toLocaleString()}원`,   icon:'💰' },
    { label:'신청 인원',       value:`${orders.length}명`,               icon:'👤' },
    { label:'입장 완료',       value:`${entered}명`,                     icon:'✅' },
  ];
  return (
    <div className="perf-stats-grid">
      {items.map(it => (
        <div key={it.label} className="card card-pad" style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <div style={{ fontSize:22 }}>{it.icon}</div>
          <div style={{ fontSize:13, color:'var(--text-muted)', fontWeight:600 }}>{it.label}</div>
          <div style={{ fontSize:20, fontWeight:800, color:'var(--slate-900)' }}>{it.value}</div>
        </div>
      ))}
    </div>
  );
}

/* ────── 관객 명단 ────── */
function OrderList({ orders, onUpdate, onDelete }) {
  const [q, setQ] = useState('');
  const filtered = orders.filter(o =>
    (o.audienceName || '').toLowerCase().includes(q.toLowerCase()) ||
    (o.phone || '').includes(q)
  );

  return (
    <div>
      {/* 검색창 */}
      <div style={{ position:'relative', marginBottom:16 }}>
        <span style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', pointerEvents:'none', fontSize:16 }}>🔍</span>
        <input
          type="text" placeholder="이름 또는 연락처 검색..."
          value={q} onChange={e => setQ(e.target.value)}
          className="search-input"
          style={{ width:'100%', paddingLeft:40, boxSizing:'border-box', height:42, fontSize:14 }}
        />
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign:'center', padding:'48px 0', color:'var(--text-muted)', fontSize:14 }}>
          {orders.length === 0 ? '예매 신청자가 없습니다. 위 링크를 관객들에게 공유해보세요!' : '검색 결과가 없습니다.'}
        </div>
      ) : (
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:14 }}>
            <thead>
              <tr style={{ borderBottom:'2px solid var(--slate-100)', background:'var(--slate-50)' }}>
                {['신청자','연락처','매수','후원금','총금액','입금 상태','입장 상태','관리'].map((h,i) => (
                  <th key={h} style={{ padding:'12px', textAlign: i===7 ?'right':'left', fontWeight:700, color:'var(--text-muted)', fontSize:13, whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(o => (
                <tr key={o.id} style={{ borderBottom:'1px solid var(--slate-100)', background: o.attendanceStatus==='입장완료' ? '#f9fafb' : '#fff' }}>
                  <td style={{ padding:'12px', fontWeight:700, color:'var(--slate-900)' }}>{o.audienceName}</td>
                  <td style={{ padding:'12px', color:'var(--slate-600)' }}>{o.phone}</td>
                  <td style={{ padding:'12px', fontWeight:700 }}>{o.ticketCount}매</td>
                  <td style={{ padding:'12px', color:'var(--slate-600)' }}>{(o.supportAmount||0).toLocaleString()}원</td>
                  <td style={{ padding:'12px', fontWeight:700, color:'var(--slate-900)' }}>{(o.totalPrice||0).toLocaleString()}원</td>
                  <td style={{ padding:'12px' }}><Badge label={o.depositStatus} color={o.depositStatus==='입금완료'?'green':'amber'} /></td>
                  <td style={{ padding:'12px' }}><Badge label={o.attendanceStatus} color={o.attendanceStatus==='입장완료'?'blue':'slate'} /></td>
                  <td style={{ padding:'12px', textAlign:'right' }}>
                    <div style={{ display:'flex', gap:6, justifyContent:'flex-end', flexWrap:'nowrap' }}>
                      {o.depositStatus !== '입금완료' && (
                        <button onClick={() => onUpdate(o.id, { depositStatus:'입금완료' })}
                          style={{ padding:'6px 12px', borderRadius:8, border:'1px solid #bbf7d0', background:'#f0fdf4', color:'#15803d', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
                          입금확인
                        </button>
                      )}
                      {o.attendanceStatus !== '입장완료' && (
                        <button onClick={() => onUpdate(o.id, { attendanceStatus:'입장완료' })}
                          style={{ padding:'6px 12px', borderRadius:8, border:'1px solid #bfdbfe', background:'#eff6ff', color:'#1d4ed8', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
                          입장체크
                        </button>
                      )}
                      <button onClick={() => onDelete(o.id)}
                        style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #fecdd3', background:'#fff1f2', color:'#be123c', fontSize:12, cursor:'pointer' }}>🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ────── 등록/수정 모달 ────── */
function ShowFormModal({ show, onClose, onSave }) {
  const isEdit = !!show;
  const [form, setForm] = useState({
    title: '',
    date: '',
    time: '19:00',
    location: '',
    price: TICKET_PRICE,
    description: '',
    status: '예매중',
    imageUrl: ''
  });

  useEffect(() => {
    if (isEdit && show) {
      setForm({
        title: show.title || '',
        date: show.date || '',
        time: show.time || '19:00',
        location: show.location || '',
        price: show.price ?? TICKET_PRICE,
        description: show.description || '',
        status: show.status || '예매중',
        imageUrl: show.imageUrl || ''
      });
    }
  }, [isEdit, show]);

  const set = (k, v) => setForm(p => ({ ...p, [k]:v }));

  const handleSubmit = e => {
    e.preventDefault();
    if (!form.title.trim() || !form.date || !form.location.trim()) {
      return alert('공연명, 날짜, 장소는 필수입니다.');
    }
    onSave({
      id: isEdit ? show.id : `show-${Date.now()}`,
      supportAccount: show?.supportAccount || SUPPORT_ACCOUNT,
      ...form,
      price: Number(form.price) ?? TICKET_PRICE
    });
    onClose();
  };

  const fieldStyle = { width:'100%', padding:'12px 14px', borderRadius:10, border:'1px solid var(--slate-200)', fontSize:14, outline:'none', boxSizing:'border-box', fontFamily:'inherit' };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" style={{ maxWidth:480 }} onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <h3 style={{ fontSize:20, fontWeight:800, margin:'0 0 20px', color:'var(--slate-900)' }}>
          {isEdit ? '📝 공연 정보 수정' : '🎭 신규 공연 등록'}
        </h3>
        <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div>
            <label style={{ fontSize:13, fontWeight:700, color:'var(--text-muted)', display:'block', marginBottom:6 }}>공연 타이틀 *</label>
            <input style={fieldStyle} value={form.title} onChange={e => set('title', e.target.value)} placeholder="예: 2026 루미크 여름 정기공연" required />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize:13, fontWeight:700, color:'var(--text-muted)', display:'block', marginBottom:6 }}>공연 날짜 *</label>
              <input type="date" style={fieldStyle} value={form.date} onChange={e => set('date', e.target.value)} required />
            </div>
            <div>
              <label style={{ fontSize:13, fontWeight:700, color:'var(--text-muted)', display:'block', marginBottom:6 }}>시작 시간 *</label>
              <input type="time" style={fieldStyle} value={form.time} onChange={e => set('time', e.target.value)} required />
            </div>
          </div>

          <div>
            <label style={{ fontSize:13, fontWeight:700, color:'var(--text-muted)', display:'block', marginBottom:6 }}>공연 장소 *</label>
            <input style={fieldStyle} value={form.location} onChange={e => set('location', e.target.value)} placeholder="예: 홍대 상상마당 라이브홀" required />
          </div>

          <div>
            <label style={{ fontSize:13, fontWeight:700, color:'var(--text-muted)', display:'block', marginBottom:6 }}>티켓 가격 (원)</label>
            <input type="number" min="0" step="500" style={fieldStyle} value={form.price} onChange={e => set('price', e.target.value)} />
          </div>

          <div>
            <label style={{ fontSize:13, fontWeight:700, color:'var(--text-muted)', display:'block', marginBottom:6 }}>포스터 이미지 URL</label>
            <input style={fieldStyle} value={form.imageUrl} onChange={e => set('imageUrl', e.target.value)} placeholder="https://example.com/poster.jpg (선택)" />
            {form.imageUrl && (
              <div style={{ marginTop: 8, width: '100%', maxHeight: 120, overflow: 'hidden', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <img src={form.imageUrl} alt="포스터 미리보기" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none'; }} />
              </div>
            )}
          </div>

          <div>
            <label style={{ fontSize:13, fontWeight:700, color:'var(--text-muted)', display:'block', marginBottom:6 }}>공연 소개 / 안내</label>
            <textarea rows={3} style={{ ...fieldStyle, resize:'vertical', lineHeight:1.6 }}
              value={form.description} onChange={e => set('description', e.target.value)} placeholder="공연 소개 및 유의사항" />
          </div>

          <div>
            <label style={{ fontSize:13, fontWeight:700, color:'var(--text-muted)', display:'block', marginBottom:6 }}>상태</label>
            <select style={{ ...fieldStyle, background:'#f9fafb' }} value={form.status} onChange={e => set('status', e.target.value)}>
              <option value="예매중">예매중</option>
              <option value="종료">종료</option>
            </select>
          </div>

          <div style={{ display:'flex', gap:10, marginTop:8 }}>
            <button type="button" onClick={onClose} className="btn-secondary" style={{ flex:1, height:44 }}>취소</button>
            <button type="submit" className="btn-primary" style={{ flex:2, height:44 }}>
              {isEdit ? '변경사항 저장' : '공연 등록'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ────── 메인 페이지 ────── */
export default function PerformancePage() {
  const [shows,      setShows]      = useState(() => loadLS(LS_SHOWS));
  const [orders,     setOrders]     = useState(() => loadLS(LS_ORDERS));
  const [selectedId, setSelectedId] = useState(null);
  const [modalState, setModalState] = useState({ open: false, editShow: null });
  const [copyDone,   setCopyDone]   = useState(false);

  useEffect(() => {
    if (!selectedId && shows.length > 0) setSelectedId(shows[0].id);
  }, [shows, selectedId]);

  const saveShow = useCallback(showData => {
    const isEdit = shows.some(s => s.id === showData.id);
    let next;
    if (isEdit) {
      next = shows.map(s => s.id === showData.id ? showData : s);
    } else {
      next = [...shows, showData];
    }
    next.sort((a,b) => a.date.localeCompare(b.date));
    setShows(next);
    saveLS(LS_SHOWS, next);
    setSelectedId(showData.id);
  }, [shows]);

  const deleteShow = useCallback(id => {
    if (!window.confirm('공연과 모든 예매 내역이 영구 삭제됩니다. 진행할까요?')) return;
    const ns = shows.filter(s => s.id !== id);
    const no = orders.filter(o => o.concertId !== id);
    setShows(ns);  saveLS(LS_SHOWS,  ns);
    setOrders(no); saveLS(LS_ORDERS, no);
    setSelectedId(ns[0]?.id || null);
  }, [shows, orders]);

  const updateOrder = useCallback((oid, changes) => {
    const next = orders.map(o => o.id===oid ? {...o,...changes} : o);
    setOrders(next); saveLS(LS_ORDERS, next);
  }, [orders]);

  const deleteOrder = useCallback(oid => {
    if (!window.confirm('이 예매 내역을 삭제할까요?')) return;
    const next = orders.filter(o => o.id !== oid);
    setOrders(next); saveLS(LS_ORDERS, next);
  }, [orders]);

  const copyLink = id => {
    navigator.clipboard.writeText(`${window.location.origin}/form/${id}`)
      .then(() => { setCopyDone(true); setTimeout(() => setCopyDone(false), 2000); });
  };

  const sel        = shows.find(s => s.id === selectedId);
  const showOrders = orders.filter(o => o.concertId === selectedId);

  return (
    <div className="page fade-in" style={{ width: '100%', maxWidth: '1200px', margin: '0 auto' }}>

      {/* ── 헤더 ── */}
      <div className="flex-between" style={{ flexWrap:'wrap', gap:10 }}>
        <div>
          <h2 style={{ fontSize:22, fontWeight:900, margin:0, color:'var(--slate-900)' }}>🎭 공연 및 관객 티켓 신청 관리</h2>
          <p style={{ fontSize:14, color:'var(--text-muted)', margin:'4px 0 0' }}>공연 등록 · 예매 신청 · 입금 확인 · 현장 입장 체크</p>
        </div>
        <button className="btn-primary" onClick={() => setModalState({ open: true, editShow: null })} style={{ display:'flex', alignItems:'center', gap:6, height:42, padding:'0 18px', fontSize:14 }}>
          <span style={{ fontSize:18, lineHeight:1 }}>+</span> 신규 공연 추가
        </button>
      </div>

      {/* ── 공연 없음 ── */}
      {shows.length === 0 && (
        <div className="card card-pad" style={{ textAlign:'center', padding:'80px 24px' }}>
          <div style={{ fontSize:56, marginBottom:16 }}>🎭</div>
          <p style={{ fontSize:18, fontWeight:700, color:'var(--slate-700)', margin:'0 0 8px' }}>등록된 공연이 없습니다</p>
          <p style={{ fontSize:14, color:'var(--text-muted)', margin:'0 0 24px' }}>[신규 공연 추가] 버튼으로 첫 공연을 등록해보세요</p>
          <button className="btn-primary" onClick={() => setModalState({ open: true, editShow: null })} style={{ height:42, padding:'0 24px', fontSize:14 }}>첫 공연 등록하기</button>
        </div>
      )}

      {/* ── 2컬럼 그리드 ── */}
      {shows.length > 0 && (
        <div className="perf-main-grid">

          {/* 좌: 공연 목록 */}
          <div className="card" style={{ overflow:'hidden' }}>
            <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--slate-100)', fontSize:15, fontWeight:800, color:'var(--slate-700)' }}>
              등록된 공연 <span style={{ color:'var(--text-muted)', fontWeight:500 }}>({shows.length})</span>
            </div>
            <div>
              {shows.map(s => (
                <button key={s.id} onClick={() => setSelectedId(s.id)}
                  style={{
                    width:'100%', textAlign:'left', padding:'16px 20px',
                    border:'none', borderBottom:'1px solid var(--slate-50)',
                    borderLeft: selectedId===s.id ? '4px solid #111827' : '4px solid transparent',
                    background: selectedId===s.id ? '#f9fafb' : '#fff',
                    cursor:'pointer', transition:'background 0.15s',
                  }}>
                  <div style={{ fontSize:15, fontWeight:800, color:'var(--slate-900)', marginBottom:4 }}>{s.title}</div>
                  <div style={{ fontSize:13, color:'var(--text-muted)', marginBottom:8 }}>📅 {formatDateTime(s.date, s.time).split(')')[0] + ')'}</div>
                  <Badge label={s.status} color={s.status==='예매중'?'green':'slate'} />
                </button>
              ))}
            </div>
          </div>

          {/* 우: 상세 + 통계 + 명단 */}
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            {sel && (
              <>
                {/* 공연 상세 카드 */}
                <div className="card" style={{ overflow:'hidden' }}>
                  {/* 포스터 이미지 */}
                  {sel.imageUrl && (
                    <div style={{ width:'100%', maxHeight:'340px', overflow:'hidden', borderBottom:'1px solid var(--slate-100)' }}>
                      <img src={sel.imageUrl} alt={sel.title} style={{ width:'100%', height:'340px', objectFit:'cover' }} />
                    </div>
                  )}

                  {/* 공연 제목 영역 */}
                  <div style={{ padding:'20px 24px', borderBottom:'1px solid var(--slate-100)' }}>
                    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
                      <div style={{ flex:1 }}>
                        <div style={{ marginBottom:8 }}>
                          <Badge label={sel.status} color={sel.status==='예매중'?'green':'slate'} />
                        </div>
                        <h3 style={{ fontSize:20, fontWeight:900, color:'var(--slate-900)', margin:'0 0 6px' }}>{sel.title}</h3>
                        {sel.description && (
                          <p style={{ fontSize:14, color:'var(--slate-600)', margin:0, lineHeight:1.6, whiteSpace:'pre-wrap' }}>{sel.description}</p>
                        )}
                      </div>
                      <div style={{ display:'flex', gap:8 }}>
                        <button onClick={() => setModalState({ open: true, editShow: sel })}
                          className="btn-secondary"
                          style={{ padding:'8px 14px', borderRadius:10, fontSize:13, fontWeight:700, cursor:'pointer', height:38 }}>
                          수정
                        </button>
                        <button onClick={() => deleteShow(sel.id)}
                          style={{ padding:'8px 14px', borderRadius:10, border:'1px solid #fecdd3', background:'#fff1f2', color:'#be123c', fontSize:13, fontWeight:700, cursor:'pointer', height:38 }}>
                          삭제
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 공연 정보 그리드 */}
                  <div style={{ padding:'18px 24px', display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:16, borderBottom:'1px solid var(--slate-100)' }}>
                    {[['📅','일시',formatDateTime(sel.date, sel.time)],['📍','장소',sel.location],
                      ['🪙','티켓 가격',`${(sel.price??TICKET_PRICE).toLocaleString()}원/매`],
                      ['🏦','예매용 계좌',sel.supportAccount]].map(([ic,lb,vl]) => (
                      <div key={lb}>
                        <div style={{ fontSize:12, color:'var(--text-muted)', fontWeight:600, marginBottom:4 }}>{ic} {lb}</div>
                        <div style={{ fontSize:14, fontWeight:700, color:'var(--slate-800)' }}>{vl}</div>
                      </div>
                    ))}
                  </div>

                  {/* 예매 링크 */}
                  <div style={{ padding:'16px 24px', display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
                    <span style={{ fontSize:14, fontWeight:700, color:'var(--text-muted)', whiteSpace:'nowrap' }}>🔗 외부 예매 신청 폼 링크</span>
                    <input readOnly value={`${window.location.origin}/form/${sel.id}`}
                      style={{ flex:1, padding:'10px 14px', border:'1px solid var(--slate-200)', borderRadius:10, fontSize:13, background:'var(--slate-50)', color:'var(--slate-600)', minWidth:220, boxSizing:'border-box', outline:'none' }} />
                    <button onClick={() => copyLink(sel.id)} className={copyDone ? 'btn-secondary' : 'btn-primary'}
                      style={{ height:42, padding:'0 18px', borderRadius:10, fontSize:13, fontWeight:700, whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:6 }}>
                      {copyDone ? '✅ 복사완료' : '링크 복사'}
                    </button>
                  </div>
                </div>

                {/* 통계 위젯 */}
                <StatsRow orders={showOrders} />

                {/* 관객 명단 */}
                <div className="card card-pad" style={{ padding:'20px 24px' }}>
                  <div className="flex-between" style={{ marginBottom:16, flexWrap:'wrap', gap:8 }}>
                    <span style={{ fontSize:16, fontWeight:800, color:'var(--slate-900)' }}>🎟️ 관객 신청 명단</span>
                    <span style={{ fontSize:14, color:'var(--text-muted)' }}>총 {showOrders.length}건</span>
                  </div>
                  <OrderList orders={showOrders} onUpdate={updateOrder} onDelete={deleteOrder} />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {modalState.open && (
        <ShowFormModal
          show={modalState.editShow}
          onClose={() => setModalState({ open: false, editShow: null })}
          onSave={saveShow}
        />
      )}
    </div>
  );
}
