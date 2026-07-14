import { useState, useEffect, useCallback } from 'react';

const LS_SHOWS = 'lumique_performances';
const LS_ORDERS = 'lumique_ticket_orders';
const TICKET_PRICE = 5000;
const SUPPORT_ACCOUNT = '토스뱅크 1001-7629-3105 강맥';

const loadLS = (key) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : []; } catch { return []; } };
const saveLS = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} };

/* ── Badge ── */
function Badge({ label, color }) {
  const map = {
    green: { bg: '#f0fdf4', text: '#16a34a', border: '#bbf7d0' },
    amber: { bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
    blue:  { bg: '#f0f9ff', text: '#0369a1', border: '#bae6fd' },
    slate: { bg: '#f8fafc', text: '#64748b', border: '#e2e8f0' },
    red:   { bg: '#fff1f2', text: '#e11d48', border: '#fecdd3' },
  };
  const s = map[color] || map.slate;
  return <span style={{ display:'inline-block', padding:'2px 9px', borderRadius:20, fontSize:11, fontWeight:700, background:s.bg, color:s.text, border:`1px solid ${s.border}`, whiteSpace:'nowrap' }}>{label}</span>;
}

/* ── 통계 위젯 ── */
function StatsRow({ orders }) {
  const confirmed = orders.filter(o => o.depositStatus === '입금완료');
  const totalAmt = confirmed.reduce((s, o) => s + (o.totalPrice || 0), 0);
  const totalTix = orders.reduce((s, o) => s + (o.ticketCount || 0), 0);
  const entered = orders.filter(o => o.attendanceStatus === '입장완료').length;
  const items = [
    { label:'총 예매 매수', value:`${totalTix}매`, icon:'🎟️' },
    { label:'입금완료 총액', value:`${totalAmt.toLocaleString()}원`, icon:'💰' },
    { label:'신청 인원', value:`${orders.length}명`, icon:'👤' },
    { label:'입장 완료', value:`${entered}명`, icon:'✅' },
  ];
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10, marginBottom:16 }}>
      {items.map(it => (
        <div key={it.label} style={{ background:'#fff', border:'1px solid #e8edf2', borderRadius:12, padding:'12px 14px' }}>
          <div style={{ fontSize:18, marginBottom:3 }}>{it.icon}</div>
          <div style={{ fontSize:11, color:'#94a3b8', fontWeight:600, marginBottom:2 }}>{it.label}</div>
          <div style={{ fontSize:17, fontWeight:800, color:'#111827' }}>{it.value}</div>
        </div>
      ))}
    </div>
  );
}

/* ── 관객 명단 ── */
function OrderList({ orders, onUpdate, onDelete }) {
  const [q, setQ] = useState('');
  const filtered = orders.filter(o => (o.audienceName||'').toLowerCase().includes(q.toLowerCase()) || (o.phone||'').includes(q));
  const btnBase = { padding:'4px 8px', borderRadius:7, fontSize:11, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap', border:'none' };

  return (
    <div>
      <div style={{ position:'relative', marginBottom:12 }}>
        <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }}>🔍</span>
        <input type="text" placeholder="이름 또는 전화번호 검색..." value={q} onChange={e=>setQ(e.target.value)}
          style={{ width:'100%', padding:'9px 12px 9px 36px', border:'1.5px solid #e2e8f0', borderRadius:10, fontSize:13, outline:'none', background:'#f9fafb', boxSizing:'border-box' }} />
      </div>
      {filtered.length === 0 ? (
        <div style={{ textAlign:'center', padding:'36px 0', color:'#94a3b8', fontSize:13 }}>
          {orders.length === 0 ? '아직 예매 신청이 없습니다. 링크를 관객에게 공유해보세요!' : '검색 결과가 없습니다.'}
        </div>
      ) : (
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, minWidth:640 }}>
            <thead>
              <tr style={{ background:'#f9fafb', borderBottom:'1.5px solid #e8edf2' }}>
                {['신청자','연락처','매수','후원금','총금액','입금','입장',''].map(h =>
                  <th key={h} style={{ padding:'9px 10px', textAlign:'left', fontWeight:700, color:'#6b7280', whiteSpace:'nowrap' }}>{h}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map(o => (
                <tr key={o.id} style={{ borderBottom:'1px solid #f3f4f6', background: o.attendanceStatus==='입장완료' ? '#f9fafb' : '#fff' }}>
                  <td style={{ padding:'10px', fontWeight:700, color:'#111827' }}>{o.audienceName}</td>
                  <td style={{ padding:'10px', color:'#4b5563' }}>{o.phone}</td>
                  <td style={{ padding:'10px', fontWeight:700 }}>{o.ticketCount}매</td>
                  <td style={{ padding:'10px', color:'#6b7280' }}>{(o.supportAmount||0).toLocaleString()}원</td>
                  <td style={{ padding:'10px', fontWeight:700, color:'#111827' }}>{(o.totalPrice||0).toLocaleString()}원</td>
                  <td style={{ padding:'10px' }}><Badge label={o.depositStatus} color={o.depositStatus==='입금완료'?'green':'amber'} /></td>
                  <td style={{ padding:'10px' }}><Badge label={o.attendanceStatus} color={o.attendanceStatus==='입장완료'?'blue':'slate'} /></td>
                  <td style={{ padding:'10px' }}>
                    <div style={{ display:'flex', gap:4 }}>
                      {o.depositStatus !== '입금완료' && (
                        <button onClick={()=>onUpdate(o.id,{depositStatus:'입금완료'})} style={{ ...btnBase, background:'#f0fdf4', color:'#16a34a', border:'1px solid #bbf7d0' }}>입금확인</button>
                      )}
                      {o.attendanceStatus !== '입장완료' && (
                        <button onClick={()=>onUpdate(o.id,{attendanceStatus:'입장완료'})} style={{ ...btnBase, background:'#f0f9ff', color:'#0369a1', border:'1px solid #bae6fd' }}>입장체크</button>
                      )}
                      <button onClick={()=>onDelete(o.id)} style={{ ...btnBase, background:'#fff1f2', color:'#e11d48', border:'1px solid #fecdd3', padding:'4px 7px' }}>🗑</button>
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

/* ── 공연 추가 모달 ── */
function AddShowModal({ onClose, onAdd }) {
  const [form, setForm] = useState({ title:'', date:'', location:'', price:TICKET_PRICE, description:'', status:'예매중' });
  const set = (k,v) => setForm(p=>({...p,[k]:v}));
  const fStyle = { width:'100%', padding:'10px 12px', borderRadius:9, border:'1.5px solid #e2e8f0', fontSize:13, outline:'none', boxSizing:'border-box', fontFamily:'inherit' };

  const handleSubmit = e => {
    e.preventDefault();
    if (!form.title.trim() || !form.date || !form.location.trim()) return alert('공연명, 날짜, 장소는 필수입니다.');
    onAdd({ id:`show-${Date.now()}`, supportAccount:SUPPORT_ACCOUNT, ...form, price:Number(form.price)||TICKET_PRICE });
    onClose();
  };

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'#fff', borderRadius:'20px 20px 0 0', padding:'24px 22px 36px', width:'100%', maxWidth:480, maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ width:32, height:4, background:'#e2e8f0', borderRadius:9, margin:'0 auto 18px' }} />
        <h3 style={{ fontSize:17, fontWeight:800, margin:'0 0 18px', color:'#111827' }}>🎭 신규 공연 등록</h3>
        <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:11 }}>
          {[['공연 타이틀 *','text','title','예: 2026 루미크 여름 정기공연'],['공연 날짜 *','date','date',''],['장소 *','text','location','예: 홍대 상상마당']].map(([label,type,key,ph])=>(
            <div key={key}>
              <label style={{ fontSize:11, fontWeight:700, color:'#6b7280', display:'block', marginBottom:4 }}>{label}</label>
              <input type={type} style={fStyle} value={form[key]} onChange={e=>set(key,e.target.value)} placeholder={ph} />
            </div>
          ))}
          <div>
            <label style={{ fontSize:11, fontWeight:700, color:'#6b7280', display:'block', marginBottom:4 }}>티켓 가격 (원)</label>
            <input type="number" min="0" step="500" style={fStyle} value={form.price} onChange={e=>set('price',e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize:11, fontWeight:700, color:'#6b7280', display:'block', marginBottom:4 }}>공연 소개</label>
            <textarea rows={3} style={{ ...fStyle, resize:'vertical', lineHeight:1.5 }} value={form.description} onChange={e=>set('description',e.target.value)} placeholder="공연 소개 및 유의사항" />
          </div>
          <div>
            <label style={{ fontSize:11, fontWeight:700, color:'#6b7280', display:'block', marginBottom:4 }}>상태</label>
            <select style={{ ...fStyle, background:'#f9fafb' }} value={form.status} onChange={e=>set('status',e.target.value)}>
              <option value="예매중">예매중</option>
              <option value="종료">종료</option>
            </select>
          </div>
          <div style={{ display:'flex', gap:8, marginTop:4 }}>
            <button type="button" onClick={onClose} style={{ flex:1, padding:'11px', borderRadius:11, border:'1.5px solid #e2e8f0', background:'#f9fafb', color:'#6b7280', fontWeight:700, fontSize:13, cursor:'pointer' }}>취소</button>
            <button type="submit" style={{ flex:2, padding:'11px', borderRadius:11, border:'none', background:'#111827', color:'#fff', fontWeight:800, fontSize:13, cursor:'pointer' }}>공연 등록</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── 메인 ── */
export default function PerformancePage() {
  const [shows, setShows] = useState(() => loadLS(LS_SHOWS));
  const [orders, setOrders] = useState(() => loadLS(LS_ORDERS));
  const [selectedId, setSelectedId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [copyDone, setCopyDone] = useState(false);

  useEffect(() => {
    if (!selectedId && shows.length > 0) setSelectedId(shows[0].id);
  }, [shows, selectedId]);

  const addShow = useCallback((show) => {
    const next = [...shows, show].sort((a,b)=>a.date.localeCompare(b.date));
    setShows(next); saveLS(LS_SHOWS, next); setSelectedId(show.id);
  }, [shows]);

  const deleteShow = useCallback((id) => {
    if (!window.confirm('공연과 연결된 모든 예매 내역이 영구 삭제됩니다.')) return;
    const ns = shows.filter(s=>s.id!==id); const no = orders.filter(o=>o.concertId!==id);
    setShows(ns); saveLS(LS_SHOWS, ns); setOrders(no); saveLS(LS_ORDERS, no);
    setSelectedId(ns[0]?.id || null);
  }, [shows, orders]);

  const updateOrder = useCallback((oid, changes) => {
    const next = orders.map(o=>o.id===oid?{...o,...changes}:o);
    setOrders(next); saveLS(LS_ORDERS, next);
  }, [orders]);

  const deleteOrder = useCallback((oid) => {
    if (!window.confirm('이 예매 내역을 삭제할까요?')) return;
    const next = orders.filter(o=>o.id!==oid);
    setOrders(next); saveLS(LS_ORDERS, next);
  }, [orders]);

  const copyLink = (id) => {
    navigator.clipboard.writeText(`${window.location.origin}/form/${id}`).then(()=>{ setCopyDone(true); setTimeout(()=>setCopyDone(false),2000); });
  };

  const sel = shows.find(s=>s.id===selectedId);
  const showOrders = orders.filter(o=>o.concertId===selectedId);

  /* 공통 버튼 스타일 */
  const btnBlack = { height:38, padding:'0 16px', borderRadius:9, border:'none', background:'#111827', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:5, whiteSpace:'nowrap' };
  const card = { background:'#fff', border:'1px solid #e8edf2', borderRadius:14 };

  return (
    <div style={{ padding:'18px 18px 48px', maxWidth:1200, margin:'0 auto' }}>

      {/* ── 헤더 ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10, marginBottom:20 }}>
        <div>
          <h2 style={{ fontSize:19, fontWeight:900, margin:0, color:'#111827' }}>🎭 공연 관리</h2>
          <p style={{ fontSize:12, color:'#9ca3af', margin:'3px 0 0' }}>공연 등록 · 예매 관리 · 입금확인 · 현장 입장 체크</p>
        </div>
        <button onClick={()=>setShowModal(true)} style={btnBlack}>
          <span style={{ fontSize:16, lineHeight:1 }}>+</span> 신규 공연 추가
        </button>
      </div>

      {/* ── 공연 없음 ── */}
      {shows.length === 0 && (
        <div style={{ ...card, padding:'56px 24px', textAlign:'center' }}>
          <div style={{ fontSize:44, marginBottom:12 }}>🎭</div>
          <p style={{ fontSize:15, fontWeight:700, color:'#374151', margin:'0 0 6px' }}>등록된 공연이 없습니다</p>
          <p style={{ fontSize:13, color:'#9ca3af', margin:'0 0 20px' }}>[신규 공연 추가] 버튼으로 첫 공연을 등록해보세요</p>
          <button onClick={()=>setShowModal(true)} style={btnBlack}>첫 공연 등록하기</button>
        </div>
      )}

      {/* ── 2컬럼 그리드 ── */}
      {shows.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'minmax(200px,260px) 1fr', gap:16, alignItems:'start' }}
          className="perf-grid">
          
          {/* 좌: 공연 목록 */}
          <div style={{ ...card, overflow:'hidden' }}>
            <div style={{ padding:'12px 14px', borderBottom:'1px solid #f3f4f6', fontSize:13, fontWeight:800, color:'#374151' }}>등록된 공연 ({shows.length})</div>
            <div>
              {shows.map(s => (
                <button key={s.id} onClick={()=>setSelectedId(s.id)}
                  style={{ width:'100%', textAlign:'left', padding:'12px 14px', border:'none', borderBottom:'1px solid #f9fafb',
                    borderLeft: selectedId===s.id ? '3px solid #111827' : '3px solid transparent',
                    background: selectedId===s.id ? '#f9fafb' : '#fff', cursor:'pointer', transition:'background 0.15s' }}>
                  <div style={{ fontSize:12, fontWeight:800, color:'#111827', marginBottom:2 }}>{s.title}</div>
                  <div style={{ fontSize:11, color:'#9ca3af', marginBottom:5 }}>📅 {s.date}</div>
                  <Badge label={s.status} color={s.status==='예매중'?'green':'slate'} />
                </button>
              ))}
            </div>
          </div>

          {/* 우: 상세 */}
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {sel && (
              <>
                {/* 공연 상세 카드 */}
                <div style={card}>
                  <div style={{ padding:'16px 18px', borderBottom:'1px solid #f3f4f6' }}>
                    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10, flexWrap:'wrap' }}>
                      <div style={{ flex:1 }}>
                        <div style={{ marginBottom:6 }}><Badge label={sel.status} color={sel.status==='예매중'?'green':'slate'} /></div>
                        <h3 style={{ fontSize:17, fontWeight:900, color:'#111827', margin:'0 0 4px' }}>{sel.title}</h3>
                        {sel.description && <p style={{ fontSize:12, color:'#6b7280', margin:0, lineHeight:1.5 }}>{sel.description}</p>}
                      </div>
                      <button onClick={()=>deleteShow(sel.id)}
                        style={{ padding:'6px 12px', borderRadius:8, border:'1px solid #fecdd3', background:'#fff1f2', color:'#e11d48', fontSize:12, fontWeight:700, cursor:'pointer', flexShrink:0 }}>
                        공연 삭제
                      </button>
                    </div>
                  </div>
                  <div style={{ padding:'14px 18px', display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:10, borderBottom:'1px solid #f3f4f6' }}>
                    {[['📅','날짜',sel.date],['📍','장소',sel.location],['🪙','티켓가',`${(sel.price??TICKET_PRICE).toLocaleString()}원/매`],['🏦','계좌',sel.supportAccount]].map(([ic,lb,vl])=>(
                      <div key={lb}>
                        <div style={{ fontSize:10, color:'#9ca3af', fontWeight:600, marginBottom:2 }}>{ic} {lb}</div>
                        <div style={{ fontSize:12, fontWeight:700, color:'#111827' }}>{vl}</div>
                      </div>
                    ))}
                  </div>
                  {/* 링크 복사 */}
                  <div style={{ padding:'12px 18px', display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                    <span style={{ fontSize:11, fontWeight:700, color:'#6b7280', whiteSpace:'nowrap' }}>관객 예매 링크</span>
                    <input readOnly value={`${window.location.origin}/form/${sel.id}`}
                      style={{ flex:1, padding:'7px 10px', border:'1.5px solid #e2e8f0', borderRadius:8, fontSize:11, background:'#f9fafb', color:'#6b7280', minWidth:180, boxSizing:'border-box' }} />
                    <button onClick={()=>copyLink(sel.id)}
                      style={{ ...btnBlack, height:33, padding:'0 12px', fontSize:12, background: copyDone ? '#f0fdf4' : '#111827', color: copyDone ? '#16a34a' : '#fff', border: copyDone ? '1px solid #bbf7d0' : 'none' }}>
                      {copyDone ? '✅ 복사완료' : '🔗 링크 복사'}
                    </button>
                  </div>
                </div>

                {/* 통계 위젯 */}
                <StatsRow orders={showOrders} />

                {/* 관객 명단 */}
                <div style={{ ...card, padding:'16px 18px' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12, flexWrap:'wrap', gap:6 }}>
                    <span style={{ fontSize:14, fontWeight:800, color:'#111827' }}>🎟️ 관객 신청 명단</span>
                    <span style={{ fontSize:12, color:'#9ca3af' }}>총 {showOrders.length}건</span>
                  </div>
                  <OrderList orders={showOrders} onUpdate={updateOrder} onDelete={deleteOrder} />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showModal && <AddShowModal onClose={()=>setShowModal(false)} onAdd={addShow} />}

      <style>{`
        @media (max-width: 680px) {
          .perf-grid { grid-template-columns: 1fr !important; }
        }
        @media (min-width: 1024px) {
          .perf-grid { grid-template-columns: 260px 1fr !important; }
        }
      `}</style>
    </div>
  );
}
