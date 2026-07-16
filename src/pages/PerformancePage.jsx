import { useAuth } from '../context/AuthContext';
import { useEffect, useMemo, useState } from 'react';
import './PageStyles.css';

const LS_SHOWS = 'lumique_concerts';
const LS_ORDERS = 'lumique_ticket_orders';
const SUPPORT_ACCOUNT = '토스뱅크 1001-7629-3105 강맥';
const PRICE = 5000;
const OPEN = '진행중';
const CLOSED = '종료';
const TYPES = ['text', 'input_text', 'input_textarea', 'input_radio', 'input_checkbox', 'input_number', 'fixed_name', 'fixed_phone', 'fixed_qty', 'fixed_afterparty', 'fixed_comment'];

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

import { firebaseStorage } from '../utils/firebaseStorage';


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

const cleanSection = (s = {}) => {
  let type = s.type;
  if (s.id === '__fixed_name') type = 'fixed_name';
  if (s.id === '__fixed_phone') type = 'fixed_phone';
  if (s.id === '__fixed_qty') type = 'fixed_qty';
  if (s.id === '__fixed_afterparty') type = 'fixed_afterparty';
  if (s.id === '__fixed_comment') type = 'fixed_comment';

  return {
    id: String(s.id || '').trim() || id('sec'),
    type: TYPES.includes(type) ? type : 'text',
    title: String(s.title || '').trim(),
    content: String(s.content || '').trim(),
    options: Array.isArray(s.options) ? s.options.map(v => String(v || '').trim()).filter(Boolean) : [],
    min: Number.isFinite(Number(s.min)) ? Number(s.min) : 1,
    max: Number.isFinite(Number(s.max)) ? Number(s.max) : 10,
    required: Boolean(s.required),
    active: s.active !== false
  };
};

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

function SectionEditor({ section, index, totalLength, onChange, onRemove, onMove }) {
  const [isEditing, setIsEditing] = useState(!section.title);
  const isFixed = section.type?.startsWith('fixed_');
  const isActive = section.active !== false;

  if (!isEditing) {
    return (
      <div 
        onClick={() => setIsEditing(true)}
        style={{ border: '1px solid var(--slate-200)', borderRadius: 8, padding: 16, background: isActive ? '#fafafa' : '#f1f5f9', cursor: 'pointer', transition: 'border-color 0.2s', display: 'flex', flexDirection: 'column', gap: 8, opacity: isActive ? 1 : 0.6 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: isFixed ? 'var(--blue-600)' : 'var(--indigo-600)' }}>
              {isFixed ? (section.type === 'fixed_qty' ? '고정 예매 항목 (수량 질문)' : section.type === 'fixed_afterparty' ? '고정 예매 항목 (체크박스)' : section.type === 'fixed_comment' ? '고정 예매 항목 (장문형)' : '고정 예매 항목 (단답형)') : section.type === 'text' ? '안내 텍스트' : section.type === 'input_radio' || section.type === 'input_checkbox' ? '객관식 질문' : '주관식 질문'}
              {section.required && isActive && <span style={{ color: 'var(--red-500)', marginLeft: 4 }}>*</span>}
              {!isActive && <span style={{ color: 'var(--slate-500)', marginLeft: 8 }}>(비활성화됨)</span>}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              <button type="button" onClick={(e) => { e.stopPropagation(); onMove(index, -1); }} disabled={index === 0} style={{ background: '#e2e8f0', border: 'none', borderRadius: 4, width: 26, height: 26, cursor: index === 0 ? 'not-allowed' : 'pointer', opacity: index === 0 ? 0.3 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>⬆️</button>
              <button type="button" onClick={(e) => { e.stopPropagation(); onMove(index, 1); }} disabled={index === totalLength - 1} style={{ background: '#e2e8f0', border: 'none', borderRadius: 4, width: 26, height: 26, cursor: index === totalLength - 1 ? 'not-allowed' : 'pointer', opacity: index === totalLength - 1 ? 0.3 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>⬇️</button>
            </div>
            <span style={{ fontSize: 12, color: 'var(--slate-400)' }}>클릭하여 수정</span>
          </div>
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--slate-900)' }}>
          {section.title || '(제목 없음)'}
        </div>
        {section.type === 'text' && <div style={{ fontSize: 13, color: 'var(--slate-500)', whiteSpace: 'pre-wrap' }}>{section.content || '(내용 없음)'}</div>}
      </div>
    );
  }

  return (
    <div style={{ border: `1px solid ${isFixed ? 'var(--blue-300)' : 'var(--indigo-300)'}`, borderRadius: 8, padding: 16, background: '#fff', display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
        {isFixed ? (
          <div style={{ height: 40, flex: 1, background: '#f8fafc', border: '1px solid var(--slate-200)', borderRadius: 8, display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 14, fontWeight: 700, color: 'var(--slate-700)' }}>
            고정 항목: {section.title}
          </div>
        ) : (
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
        )}
        <div style={{ display: 'flex', gap: 4 }}>
          <button type="button" onClick={() => onMove(index, -1)} disabled={index === 0} style={{ background: '#f1f5f9', border: 'none', borderRadius: 4, width: 28, height: 28, cursor: index === 0 ? 'not-allowed' : 'pointer', opacity: index === 0 ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>⬆️</button>
          <button type="button" onClick={() => onMove(index, 1)} disabled={index === totalLength - 1} style={{ background: '#f1f5f9', border: 'none', borderRadius: 4, width: 28, height: 28, cursor: index === totalLength - 1 ? 'not-allowed' : 'pointer', opacity: index === totalLength - 1 ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>⬇️</button>
        </div>
        {!isFixed && <button type="button" onClick={() => onRemove(section.id)} style={{ background: 'none', border: 'none', color: 'var(--red-500)', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: '8px 4px' }}>항목 삭제</button>}
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

      {isFixed && (
        <div style={{ borderTop: '1px solid var(--slate-100)', paddingTop: 16, marginTop: 4 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#374151' }}>
            <input type="checkbox" checked={isActive} onChange={(e) => onChange(section.id, { active: e.target.checked })} style={{ width: 16, height: 16 }} />
            이 항목 사용하기 (폼에 노출)
          </label>
        </div>
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

  const ensureFixedFields = (sections = []) => {
    let s = [...sections];
    if (!s.some(x => x.type === 'fixed_name')) s.push({ id: '__fixed_name', type: 'fixed_name', title: '신청자 성함', required: true, active: true });
    if (!s.some(x => x.type === 'fixed_phone')) s.push({ id: '__fixed_phone', type: 'fixed_phone', title: '연락처', required: true, active: true });
    if (!s.some(x => x.type === 'fixed_qty')) s.push({ id: '__fixed_qty', type: 'fixed_qty', title: '신청 매수', required: true, active: true });
    if (!s.some(x => x.type === 'fixed_afterparty')) s.push({ id: '__fixed_afterparty', type: 'fixed_afterparty', title: '뒤풀이 참여 여부', required: false, active: true });
    if (!s.some(x => x.type === 'fixed_comment')) s.push({ id: '__fixed_comment', type: 'fixed_comment', title: '기타 남기실 말씀', content: '추가 문의사항이 있다면 적어주세요', required: false, active: true });
    return s;
  };

  useEffect(() => {
    if (!show) { 
      setForm({
        ...blankShow,
        customSections: ensureFixedFields([])
      }); 
      return; 
    }
    const loadedSections = Array.isArray(show.customSections) ? show.customSections.map(cleanSection) : [];
    setForm({
      title: show.title || '',
      date: show.date || '',
      time: show.time || '19:00',
      location: show.location || '',
      price: Number(show.price) > 0 ? Number(show.price) : PRICE,
      description: show.description || '',
      status: show.status === CLOSED ? CLOSED : OPEN,
      imageUrl: show.imageUrl || '',
      customSections: ensureFixedFields(loadedSections),
      supportAccount: show.supportAccount || SUPPORT_ACCOUNT
    });
  }, [show]);

  const update = (f, v) => setForm(p => ({ ...p, [f]: v }));
  const sec = (id, patch) => setForm(p => ({ ...p, customSections: p.customSections.map(s => s.id === id ? { ...s, ...patch } : s) }));
  const add = (type) => setForm(p => ({ ...p, customSections: [...p.customSections, cleanSection({ type })] }));
  const del = (id) => setForm(p => ({ ...p, customSections: p.customSections.filter(s => s.id !== id) }));
  const move = (idx, dir) => setForm(p => {
    const copy = [...p.customSections];
    if (idx + dir < 0 || idx + dir >= copy.length) return p;
    [copy[idx], copy[idx + dir]] = [copy[idx + dir], copy[idx]];
    return { ...p, customSections: copy };
  });

  const handleImageUpload = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => update('imageUrl', e.target.result);
    reader.readAsDataURL(file);
  };

  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        handleImageUpload(items[i].getAsFile());
        break;
      }
    }
  };

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
        
        <div style={{ padding: 24, overflowY: 'auto', flex: 1 }} onPaste={handlePaste}>
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
                <label style={labelStyle}>티켓 금액 (원)</label>
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
              <label style={labelStyle}>포스터 이미지 첨부 <span style={{ fontWeight: 400, color: 'var(--slate-500)', fontSize: 12 }}>(클립보드 이미지 붙여넣기 Ctrl+V 지원)</span></label>
              <input type="file" accept="image/*" onChange={e => handleImageUpload(e.target.files[0])} style={{ ...inputStyle, padding: '8px' }} />
              {form.imageUrl && (
                <div style={{ position: 'relative', marginTop: 8, width: 'max-content' }}>
                  <img src={form.imageUrl} style={{ maxWidth: '100%', maxHeight: 240, borderRadius: 8, objectFit: 'contain', border: '1px solid var(--slate-200)', background: '#f8fafc' }} />
                  <button type="button" onClick={() => update('imageUrl', '')} style={{ position: 'absolute', top: -8, right: -8, background: 'var(--red-500)', color: '#fff', border: 'none', borderRadius: '50%', width: 24, height: 24, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 'bold', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>✕</button>
                </div>
              )}
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
                    <SectionEditor key={s.id} section={s} index={idx} totalLength={form.customSections.length} onChange={sec} onRemove={del} onMove={move} />
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
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {isAdmin && (
                  <button type="button" onClick={onEdit} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--indigo-300)', background: '#f8fafc', color: 'var(--indigo-600)', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    공연 수정
                  </button>
                )}
                <button type="button" onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--slate-300)', background: 'transparent', color: 'var(--slate-600)', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>닫기</button>
                <button 
                  onClick={() => window.open(`/manage/${show.id}`, '_blank')}
                  className="btn-primary"
                  style={{ background: 'var(--blue-600)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 14, whiteSpace: 'nowrap' }}
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
                <div><strong>티켓 금액:</strong> {Number(show.price || 0).toLocaleString()}원</div>
                <div style={{ marginTop: 16 }}>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>관객용 신청 폼 링크</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <a href={formUrl} target="_blank" rel="noopener noreferrer" style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#f8fafc', color: 'var(--blue-600)', textDecoration: 'underline', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {formUrl}
                    </a>
                    <button onClick={copyUrl} className="btn-secondary" style={{ height: 36, fontSize: 13, padding: '0 12px', whiteSpace: 'nowrap' }}>복사</button>
                  </div>
                </div>
              </div>
            ))}
            {card('포스터', show.imageUrl ? <img src={show.imageUrl} style={{ width: '100%', borderRadius: 8 }} /> : <div style={{ height: 160, background: '#f1f5f9', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>포스터 없음</div>)}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useParams, useNavigate } from 'react-router-dom';

export default function PerformancePage() {
  const [shows, setShows] = useState([]);
  const [orders, setOrders] = useState([]);
  const [editing, setEditing] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
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

  useEffect(() => {
    async function loadData() {
      // First try to load from Firebase
      let fbConcerts = await firebaseStorage.loadConcerts();
      let fbOrders = await firebaseStorage.loadOrders();

      // Fallback from localStorage if Firebase is empty
      let localShows = lsGet(LS_SHOWS);
      
      if (fbConcerts.length === 0 && localShows.length > 0) {
        fbConcerts = normShows(localShows);
        await firebaseStorage.saveConcerts(fbConcerts);
      }
      if (fbOrders.length === 0 && lsGet(LS_ORDERS).length > 0) {
        fbOrders = lsGet(LS_ORDERS);
        await firebaseStorage.saveOrders(fbOrders);
      }
      
      setShows(normShows(fbConcerts));
      setOrders(fbOrders);
      setIsLoading(false);
    }
    loadData();
  }, []);

  const showsByYear = useMemo(() => {
    const grouped = {};
    const sortedShows = [...shows].sort((a, b) => score(b.date, b.time) - score(a.date, a.time));
    sortedShows.forEach(show => {
      const year = show.date ? show.date.slice(0, 4) : '기타';
      if (!grouped[year]) grouped[year] = [];
      grouped[year].push(show);
    });
    return Object.keys(grouped).sort((a, b) => b.localeCompare(a)).map(year => ({ year, shows: grouped[year] }));
  }, [shows]);

  const saveShow = async (next) => {
    const nextShows = normShows(shows.some(s => s.id === next.id) ? shows.map(s => s.id === next.id ? next : s) : [...shows, next]);
    setShows(nextShows);
    lsSet(LS_SHOWS, nextShows);
    await firebaseStorage.saveConcerts(nextShows);
  };
  
  const delShow = async (id, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm('공연을 삭제할까요?')) return;
    const nextShows = shows.filter(s => s.id !== id);
    const nextOrders = orders.filter(o => o.concertId !== id);
    setShows(nextShows);
    setOrders(nextOrders);
    lsSet(LS_SHOWS, nextShows);
    lsSet(LS_ORDERS, nextOrders);
    if (detail?.id === id) setDetail(null);
    await firebaseStorage.saveConcerts(nextShows);
    await firebaseStorage.saveOrders(nextOrders);
  };

  const editShow = (show, e) => {
    if (e) e.stopPropagation();
    setEditing(show);
  };

  return (
    <div className="page fade-in">
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 24 }}>
        {isAdmin && (
          <button className="btn-primary" onClick={() => setEditing(blankShow)} style={{ padding: '10px 16px', borderRadius: 8, fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap' }}>
            + 새 공연 등록
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: 16 }}>
          <div className="loading-spinner" style={{ width: 40, height: 40, borderWidth: 4 }}></div>
          <p className="loading-text" style={{ color: 'var(--slate-500)', fontSize: 15, fontWeight: 600, margin: 0 }}>공연 정보를 불러오는 중입니다...</p>
        </div>
      ) : showsByYear.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', background: '#fff', borderRadius: 12, border: '1px solid var(--slate-200)' }}>
          <p style={{ color: 'var(--slate-500)', fontSize: 15 }}>등록된 공연이 없습니다.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
          {showsByYear.map(({ year, shows }) => (
            <div key={year}>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--slate-800)', marginBottom: 16, paddingBottom: 8, borderBottom: '2px solid var(--slate-100)' }}>
                {year}년 <span style={{ fontSize: 14, color: 'var(--slate-400)', fontWeight: 600, marginLeft: 8 }}>총 {shows.length}건</span>
              </h2>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
                gap: 20 
              }}>
                {shows.map(show => (
                  <div 
                    key={show.id}
                    onClick={() => setDetail(show)}
                    style={{ 
                      position: 'relative',
                      border: '1px solid var(--slate-200)', 
                      borderRadius: 16, 
                      padding: 16, 
                      cursor: 'pointer', 
                      backgroundColor: '#fff',
                      display: 'flex',
                      flexDirection: 'column',
                      transition: 'transform 0.2s, box-shadow 0.2s',
                      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.transform = 'translateY(-4px)';
                      e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.1)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.transform = 'none';
                      e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.05)';
                    }}
                  >
                    <div style={{ 
                      width: '100%', 
                      aspectRatio: '16/9', 
                      background: show.imageUrl ? `url(${show.imageUrl}) center/cover` : '#f1f5f9', 
                      borderRadius: 12, 
                      marginBottom: 16,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--slate-400)',
                      fontSize: 14,
                      fontWeight: 600
                    }}>
                      {!show.imageUrl && '포스터 없음'}
                    </div>

                    {isAdmin && (
                      <div style={{ position: 'absolute', top: 24, right: 24, display: 'flex', gap: 6 }}>
                        <button 
                          onClick={(e) => editShow(show, e)} 
                          style={{ background: 'rgba(255,255,255,0.9)', border: '1px solid var(--slate-200)', borderRadius: 6, padding: '6px 10px', fontSize: 12, fontWeight: 700, color: 'var(--blue-600)', cursor: 'pointer', backdropFilter: 'blur(4px)' }}
                        >수정</button>
                        <button 
                          onClick={(e) => delShow(show.id, e)} 
                          style={{ background: 'rgba(255,255,255,0.9)', border: '1px solid var(--slate-200)', borderRadius: 6, padding: '6px 10px', fontSize: 12, fontWeight: 700, color: 'var(--red-500)', cursor: 'pointer', backdropFilter: 'blur(4px)' }}
                        >삭제</button>
                      </div>
                    )}

                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                        <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: 'var(--slate-900)', lineHeight: 1.3, wordBreak: 'keep-all' }}>{show.title}</h3>
                        <span className={`badge ${show.status === CLOSED ? 'badge-gray-light' : 'badge-success-light'}`} style={{ whiteSpace: 'nowrap' }}>
                          {show.status === CLOSED ? '종료' : '예매 중'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--slate-500)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>🗓️ {fmtDT(show.date, show.time)}</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>📍 {show.location}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && <ShowFormModal show={editing === blankShow ? null : editing} onClose={() => setEditing(null)} onSave={saveShow} />}
      {detail && <ShowDetailModal show={detail} onClose={() => setDetail(null)} onEdit={() => { setEditing(detail); setDetail(null); }} isAdmin={isAdmin} />}
    </div>
  );
}
