import { useAuth } from '../context/AuthContext';
import { useEffect, useMemo, useState } from 'react';
import './PageStyles.css';

const LS_SHOWS = 'lumique_concerts';
const LS_SHOWS_LEGACY = 'lumique_performances';
const LS_ORDERS = 'lumique_ticket_orders';
const SUPPORT_ACCOUNT = '토스뱅크 1001-7629-3105 강맥';
const PRICE = 5000;
const OPEN = '진행중';
const CLOSED = '종료';
const TYPES = ['text', 'input_text', 'input_textarea', 'input_radio', 'input_checkbox', 'input_number'];

const blankShow = {
  title: '',
  date: '',
  time: '19:00',
  location: '',
  price: PRICE,
  description: '',
  status: OPEN,
  imageUrl: '',
  customSections: [],
  supportAccount: SUPPORT_ACCOUNT
};

const id = (p) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const lsGet = (k) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : []; } catch { return []; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } };

const migrate = (v) => {
  const n = Array.isArray(v) ? v : [];
  lsSet(LS_SHOWS, n);
  try { localStorage.removeItem(LS_SHOWS_LEGACY); } catch { }
  return n;
};

const score = (d, t = '19:00') => {
  const n = new Date(`${d}T${t}`);
  return Number.isNaN(n.getTime()) ? 0 : n.getTime();
};

const fmtDT = (d, t = '19:00') => {
  if (!d) return '-';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return `${d} ${t}`.trim();
  const w = ['일', '월', '화', '수', '목', '금', '토'];
  const [y, m, day] = d.split('-');
  return `${y}.${Number(m)}.${Number(day)} (${w[x.getDay()]}) ${t}`;
};

const cleanSection = (s = {}) => ({
  id: String(s.id || '').trim() || id('sec'),
  type: TYPES.includes(s.type) ? s.type : 'text',
  title: String(s.title || '').trim(),
  content: String(s.content || '').trim(),
  options: Array.isArray(s.options) ? s.options.map(v => String(v || '').trim()).filter(Boolean) : [],
  min: Number.isFinite(Number(s.min)) ? Number(s.min) : 1,
  max: Number.isFinite(Number(s.max)) ? Number(s.max) : 10,
  required: Boolean(s.required)
});

const cleanShow = (s) => {
  if (!s || typeof s !== 'object') return null;
  const title = String(s.title || '').trim(), date = String(s.date || '').trim(), location = String(s.location || '').trim();
  if (!title || !date || !location) return null;
  return {
    ...s,
    id: String(s.id || '').trim() || id('show'),
    title, date, time: String(s.time || '19:00').trim() || '19:00',
    location, price: Number(s.price) > 0 ? Number(s.price) : PRICE,
    description: String(s.description || '').trim(),
    status: s.status === CLOSED ? CLOSED : OPEN,
    imageUrl: String(s.imageUrl || '').trim(),
    supportAccount: String(s.supportAccount || SUPPORT_ACCOUNT).trim() || SUPPORT_ACCOUNT,
    customSections: Array.isArray(s.customSections) ? s.customSections.map(cleanSection) : [],
    createdAt: String(s.createdAt || new Date().toISOString()),
    updatedAt: String(s.updatedAt || s.createdAt || new Date().toISOString())
  };
};

const normShows = (v) => {
  const seen = new Set();
  return (Array.isArray(v) ? v : [])
    .map(cleanShow)
    .filter(Boolean)
    .filter(s => {
      const k = s.id || `${s.title}|${s.date}|${s.time}|${s.location}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => score(b.createdAt) - score(a.createdAt) || score(b.date, b.time) - score(a.date, a.time));
};

const card = (title, children) => (
  <section className="card card-pad" style={{ display: 'grid', gap: 14 }}>
    <h4 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: 'var(--slate-900)' }}>{title}</h4>
    {children}
  </section>
);

function SectionEditor({ section, index, onChange, onRemove }) {
  const [isEditing, setIsEditing] = useState(!section.title);

  if (!isEditing) {
    return (
      <div 
        onClick={() => setIsEditing(true)}
        style={{ border: '1px solid var(--slate-200)', borderRadius: 8, padding: 16, background: '#fafafa', cursor: 'pointer', transition: 'border-color 0.2s', display: 'flex', flexDirection: 'column', gap: 8 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--indigo-600)' }}>
            {section.type === 'text' ? '안내 텍스트' : section.type === 'input_radio' || section.type === 'input_checkbox' ? '객관식 질문' : '주관식 질문'}
            {section.required && <span style={{ color: 'var(--red-500)', marginLeft: 4 }}>*</span>}
          </span>
          <span style={{ fontSize: 12, color: 'var(--slate-400)' }}>클릭하여 수정</span>
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--slate-900)' }}>
          {section.title || '(제목 없음)'}
        </div>
        {section.type === 'text' && <div style={{ fontSize: 13, color: 'var(--slate-500)', whiteSpace: 'pre-wrap' }}>{section.content || '(내용 없음)'}</div>}
      </div>
    );
  }

  return (
    <div style={{ border: '1px solid var(--indigo-300)', borderRadius: 8, padding: 16, background: '#fff', display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
        <select
          value={section.type}
          onChange={(e) => onChange(section.id, { type: e.target.value, options: e.target.value === 'text' ? [] : section.options })}
          className="search-input"
          style={{ height: 40, flex: 1, background: '#f8fafc', border: '1px solid var(--slate-200)', borderRadius: 8 }}
        >
          <option value="text">안내 텍스트</option>
          <option value="input_text">단답형 질문</option>
          <option value="input_textarea">장문형 질문</option>
          <option value="input_radio">단일 선택(라디오)</option>
          <option value="input_checkbox">복수 선택(체크박스)</option>
          <option value="input_number">수량(숫자) 질문</option>
        </select>
        <button type="button" onClick={() => onRemove(section.id)} style={{ background: 'none', border: 'none', color: 'var(--red-500)', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: '8px 4px' }}>항목 삭제</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label style={{ fontSize: 13, fontWeight: 700, color: '#374151', display: 'block', textAlign: 'left' }}>항목 제목 (질문)</label>
        <input
          value={section.title}
          onChange={(e) => onChange(section.id, { title: e.target.value })}
          placeholder="질문 내용을 입력하세요"
          className="search-input"
          style={{ background: '#fff', width: '100%', border: '1px solid var(--slate-200)', borderRadius: 8, padding: '10px 12px', boxSizing: 'border-box' }}
        />
      </div>

      {section.type === 'text' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: '#374151', display: 'block', textAlign: 'left' }}>안내 문구 상세</label>
          <textarea
            rows={3}
            value={section.content}
            onChange={(e) => onChange(section.id, { content: e.target.value })}
            placeholder="상세 안내 문구를 입력하세요"
            className="search-input"
            style={{ background: '#fff', minHeight: 90, width: '100%', border: '1px solid var(--slate-200)', borderRadius: 8, padding: '10px 12px', boxSizing: 'border-box', resize: 'vertical' }}
          />
        </div>
      ) : (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#374151' }}>
          <input type="checkbox" checked={section.required} onChange={(e) => onChange(section.id, { required: e.target.checked })} style={{ width: 16, height: 16 }} />
          필수 입력 항목으로 설정
        </label>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <button type="button" onClick={() => setIsEditing(false)} className="btn-primary" style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700 }}>편집 완료</button>
      </div>
    </div>
  );
}

function ShowFormModal({ show, onClose, onSave }) {
  const [form, setForm] = useState(blankShow);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!show) { setForm(blankShow); return; }
    setForm({
      title: show.title || '',
      date: show.date || '',
      time: show.time || '19:00',
      location: show.location || '',
      price: Number(show.price) > 0 ? Number(show.price) : PRICE,
      description: show.description || '',
      status: show.status === CLOSED ? CLOSED : OPEN,
      imageUrl: show.imageUrl || '',
      customSections: Array.isArray(show.customSections) ? show.customSections.map(cleanSection) : [],
      supportAccount: show.supportAccount || SUPPORT_ACCOUNT
    });
  }, [show]);

  const update = (f, v) => setForm(p => ({ ...p, [f]: v }));
  const sec = (id, patch) => setForm(p => ({ ...p, customSections: p.customSections.map(s => s.id === id ? { ...s, ...patch } : s) }));
  const add = (type) => setForm(p => ({ ...p, customSections: [...p.customSections, cleanSection({ type })] }));
  const del = (id) => setForm(p => ({ ...p, customSections: p.customSections.filter(s => s.id !== id) }));

  const submit = (e) => {
    e.preventDefault();
    const clean = cleanShow(form);
    if (!clean) return alert('공연명, 날짜, 장소는 반드시 입력해야 합니다.');
    
    setIsSaving(true);
    setTimeout(() => {
      onSave({ ...clean, id: show?.id || id('show'), createdAt: show?.createdAt || clean.createdAt, updatedAt: new Date().toISOString() });
      setIsSaving(false);
      onClose();
    }, 600); // 로딩 피드백 제공 (UX)
  };

  const inputStyle = { width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--slate-200)', fontSize: 14, boxSizing: 'border-box', background: '#fff' };
  const labelStyle = { display: 'block', textAlign: 'left', fontSize: 13, fontWeight: 700, color: 'var(--slate-700)' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(15,23,42,.45)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: '640px', background: '#fff', borderRadius: 20, boxShadow: '0 20px 50px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        <div style={{ padding: '24px 24px 16px', borderBottom: '1px solid var(--slate-100)' }}>
          <h3 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--slate-900)' }}>공연 {show?.id ? '정보 수정' : '신규 등록'}</h3>
        </div>
        
        <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
          <form id="show-form" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={labelStyle}>공연명 *</label>
              <input value={form.title} onChange={e => update('title', e.target.value)} style={inputStyle} placeholder="공연 제목을 입력하세요" />
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={labelStyle}>날짜 *</label>
                <input type="date" value={form.date} onChange={e => update('date', e.target.value)} style={inputStyle} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={labelStyle}>시간</label>
                <input type="time" value={form.time} onChange={e => update('time', e.target.value)} style={inputStyle} />
              </div>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={labelStyle}>장소 *</label>
              <input value={form.location} onChange={e => update('location', e.target.value)} style={inputStyle} placeholder="공연 장소" />
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={labelStyle}>티켓 가격 (원)</label>
                <input type="number" value={form.price} onChange={e => update('price', e.target.value)} style={inputStyle} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={labelStyle}>예매 상태</label>
                <select value={form.status} onChange={e => update('status', e.target.value)} style={inputStyle}>
                  <option value={OPEN}>예매 진행 중</option>
                  <option value={CLOSED}>예매 종료</option>
                </select>
              </div>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={labelStyle}>포스터 이미지 URL</label>
              <input value={form.imageUrl} onChange={e => update('imageUrl', e.target.value)} style={inputStyle} placeholder="https://..." />
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={labelStyle}>공연 상세 설명</label>
              <textarea rows={4} value={form.description} onChange={e => update('description', e.target.value)} style={{ ...inputStyle, height: 100, resize: 'vertical' }} placeholder="공연에 대한 설명을 입력하세요" />
            </div>

            <div style={{ borderTop: '1px solid var(--slate-100)', paddingTop: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--slate-900)' }}>커스텀 신청 항목 (폼 빌더)</h4>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--slate-500)' }}>예매자에게 추가로 받을 정보를 자유롭게 구성하세요.</p>
                </div>
                <button type="button" onClick={() => add('input_text')} className="btn-secondary" style={{ height: 36, padding: '0 16px', fontSize: 13, fontWeight: 700 }}>+ 항목 추가</button>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {form.customSections.length === 0 ? (
                  <div style={{ padding: '32px 0', textAlign: 'center', background: '#f8fafc', borderRadius: 8, border: '1px dashed var(--slate-300)' }}>
                    <span style={{ fontSize: 14, color: 'var(--slate-400)', fontWeight: 600 }}>추가 항목이 없습니다.</span>
                  </div>
                ) : (
                  form.customSections.map((s, idx) => (
                    <SectionEditor key={s.id} section={s} index={idx} onChange={sec} onRemove={del} />
                  ))
                )}
              </div>
            </div>
          </form>
        </div>
        
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--slate-100)', display: 'flex', justifyContent: 'flex-end', gap: 8, background: '#fafafa', borderBottomLeftRadius: 20, borderBottomRightRadius: 20 }}>
          <button type="button" onClick={onClose} disabled={isSaving} style={{ padding: '10px 24px', borderRadius: 8, border: '1px solid var(--slate-300)', background: 'transparent', color: 'var(--slate-600)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>취소</button>
          <button type="submit" form="show-form" disabled={isSaving} className="btn-primary" style={{ padding: '10px 32px', borderRadius: 8, fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            {isSaving ? '저장 중...' : '저장하기'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ShowDetailModal({ show, onClose, onEdit, isAdmin }) {
  if (!show) return null;
  const formUrl = `${window.location.origin}/form/${show.id}`;

  const copyUrl = () => {
    navigator.clipboard.writeText(formUrl);
    alert('신청 폼 링크가 복사되었습니다.');
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(15,23,42,.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: '800px', background: '#fff', borderRadius: 20, boxShadow: '0 24px 80px rgba(15,23,42,.2)', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '24px', borderBottom: '1px solid var(--slate-100)' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--slate-900)' }}>{show.title}</h3>
            <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--slate-500)' }}>{fmtDT(show.date, show.time)} · {show.location}</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {isAdmin && (
                <button type="button" onClick={onEdit} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--indigo-300)', background: '#f8fafc', color: 'var(--indigo-600)', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  공연 수정
                </button>
              )}
              <button type="button" onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--slate-300)', background: 'transparent', color: 'var(--slate-600)', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>닫기</button>
              <button 
                onClick={() => window.open(`/manage/${show.id}`, '_blank')}
                className="btn-primary"
                style={{ background: '#111827', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 14, whiteSpace: 'nowrap' }}
              >
                티켓 관리로 이동 ➔
              </button>
            </div>
          </div>
        </div>

        <div style={{ padding: 24, overflowY: 'auto', flex: 1, display: 'grid', gap: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
            {card('공연 정보', (
              <div style={{ display: 'grid', gap: 10, fontSize: 14 }}>
                <div><strong>상태:</strong> {show.status === CLOSED ? '종료' : '진행 중'}</div>
                <div><strong>장소:</strong> {show.location}</div>
                <div><strong>가격:</strong> {Number(show.price || 0).toLocaleString()}원</div>
                <div style={{ marginTop: 10 }}>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', mb: 4 }}>관객용 신청 폼 링크</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input readOnly value={formUrl} style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, background: '#f8fafc' }} />
                    <button onClick={copyUrl} className="btn-secondary" style={{ height: 34, fontSize: 12, px: 10 }}>복사</button>
                  </div>
                </div>
              </div>
            ))}
            {card('포스터', show.imageUrl ? <img src={show.imageUrl} style={{ width: '100%', borderRadius: 12 }} /> : <div style={{ height: 160, background: '#f1f5f9', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>포스터 없음</div>)}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useParams, useNavigate } from 'react-router-dom';

export default function PerformancePage() {
  const [shows, setShows] = useState(() => normShows(lsGet(LS_SHOWS).length ? lsGet(LS_SHOWS) : migrate(lsGet(LS_SHOWS_LEGACY))));
  const [orders, setOrders] = useState(() => lsGet(LS_ORDERS));
  const [editing, setEditing] = useState(null);
  const { isAdmin } = useAuth();
  
  const { id: paramId } = useParams();
  const navigate = useNavigate();
  
  const detail = useMemo(() => {
    return paramId ? shows.find(s => s.id === paramId) : null;
  }, [paramId, shows]);

  const setDetail = (show) => {
    if (show) {
      navigate(`/concerts/${show.id}`);
    } else {
      navigate('/concerts');
    }
  };

  useEffect(() => { lsSet(LS_SHOWS, shows); }, [shows]);
  useEffect(() => { lsSet(LS_ORDERS, orders); }, [orders]);

  const sorted = useMemo(() => [...shows].sort((a, b) => score(b.createdAt) - score(a.createdAt)), [shows]);

  const saveShow = (next) => setShows(prev => normShows(prev.some(s => s.id === next.id) ? prev.map(s => s.id === next.id ? next : s) : [...prev, next]));
  const delShow = (id) => {
    if (!confirm('공연을 삭제할까요?')) return;
    setShows(prev => prev.filter(s => s.id !== id));
    setOrders(prev => prev.filter(o => o.concertId !== id));
    if (detail?.id === id) setDetail(null);
  };

  return (
    <div className="page-shell">
      <div className="page-container" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0 }}>공연 목록</h1>
          {isAdmin && (
            <button className="btn-primary" onClick={() => setEditing(blankShow)} style={{ height: 40, padding: '0 20px', borderRadius: 10 }}>
              + 새 공연 등록
            </button>
          )}
        </div>

        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
          gap: '20px' 
        }}>
          {sorted.map(show => (
            <div 
              key={show.id}
              onClick={() => setDetail(show)}
              style={{ 
                border: '1px solid #e5e7eb', 
                borderRadius: '12px', 
                padding: '16px', 
                cursor: 'pointer', 
                backgroundColor: '#fff',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              <div style={{ 
                width: '100%', 
                height: '160px', 
                background: show.imageUrl ? `url(${show.imageUrl}) center/cover` : '#f3f4f6', 
                borderRadius: '8px', 
                marginBottom: '16px' 
              }} />
              <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>{show.title}</h2>
              <p style={{ fontSize: '14px', color: '#6b7280' }}>
                {show.date} | {show.status === CLOSED ? '종료' : '예매 중'}
              </p>
            </div>
          ))}
        </div>

        {editing && <ShowFormModal show={editing === blankShow ? null : editing} onClose={() => setEditing(null)} onSave={saveShow} />}
        {detail && <ShowDetailModal show={detail} onClose={() => setDetail(null)} onEdit={() => { setEditing(detail); setDetail(null); }} isAdmin={isAdmin} />}
      </div>
    </div>
  );
}
