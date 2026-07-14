import { useCallback, useEffect, useMemo, useState } from 'react';
import './PageStyles.css';

const LS_SHOWS = 'lumique_concerts';
const LS_SHOWS_LEGACY = 'lumique_performances';
const LS_ORDERS = 'lumique_ticket_orders';
const TICKET_PRICE = 5000;
const SUPPORT_ACCOUNT = '국민은행 1001-7629-3105 김민결';
const DEFAULT_TIME = '19:00';

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

const EMPTY_SHOW = {
  title: '',
  date: '',
  time: DEFAULT_TIME,
  location: '',
  price: TICKET_PRICE,
  description: '',
  status: '진행중',
  imageUrl: '',
  customSections: [],
};

const loadLS = (key) => {
  try {
    const value = localStorage.getItem(key);
    if (!value) return [];
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveLS = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};

const createId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const getDateScore = (dateStr, timeStr = DEFAULT_TIME) => {
  const parsed = new Date(`${dateStr}T${timeStr}`);
  const numeric = parsed.getTime();
  return Number.isNaN(numeric) ? 0 : numeric;
};

const formatDateTime = (dateStr, timeStr) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return `${dateStr} ${timeStr || ''}`.trim();
  const [year, month, day] = dateStr.split('-');
  return `${year}.${Number(month)}.${Number(day)} (${DAY_LABELS[date.getDay()]}) ${timeStr || DEFAULT_TIME}`;
};

const formatDeposit = (status) => (status === '입금완료' ? '입금 완료' : '입금 대기');
const formatAttendance = (status) => (status === '입장완료' ? '입장 완료' : '미입장');

function Badge({ label, tone = 'slate' }) {
  const palette = {
    green: { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
    blue: { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
    amber: { bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
    slate: { bg: '#f8fafc', text: '#475569', border: '#e2e8f0' },
    red: { bg: '#fff1f2', text: '#be123c', border: '#fecdd3' },
  };
  const style = palette[tone] || palette.slate;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        background: style.bg,
        color: style.text,
        border: `1px solid ${style.border}`,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

function SectionCard({ title, children }) {
  return (
    <section className="card card-pad" style={{ display: 'grid', gap: 14 }}>
      <h4 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: 'var(--slate-900)' }}>{title}</h4>
      {children}
    </section>
  );
}

function normalizeCustomSections(sections) {
  if (!Array.isArray(sections)) return [];
  return sections
    .map((section) => ({
      id: String(section?.id || '').trim() || createId('sec'),
      title: String(section?.title || '').trim(),
      content: String(section?.content || '').trim(),
    }))
    .filter((section) => section.title && section.content);
}

function sanitizeShow(show) {
  if (!show || typeof show !== 'object') return null;

  const title = String(show.title || '').trim();
  const date = String(show.date || '').trim();
  const location = String(show.location || '').trim();
  if (!title || !date || !location) return null;

  return {
    ...show,
    id: String(show.id || '').trim() || createId('show'),
    title,
    date,
    time: String(show.time || DEFAULT_TIME).trim() || DEFAULT_TIME,
    location,
    price: Number(show.price) > 0 ? Number(show.price) : TICKET_PRICE,
    description: String(show.description || '').trim(),
    status: show.status === '종료' ? '종료' : '진행중',
    imageUrl: String(show.imageUrl || '').trim(),
    supportAccount: String(show.supportAccount || SUPPORT_ACCOUNT).trim() || SUPPORT_ACCOUNT,
    customSections: normalizeCustomSections(show.customSections),
    createdAt: String(show.createdAt || show.updatedAt || new Date().toISOString()),
    updatedAt: String(show.updatedAt || show.createdAt || new Date().toISOString()),
  };
}

function normalizeShows(value) {
  const list = Array.isArray(value) ? value : [];
  const seen = new Set();
  const normalized = [];

  list.forEach((show) => {
    const clean = sanitizeShow(show);
    if (!clean) return;
    const signature = clean.id || `${clean.title}|${clean.date}|${clean.time}|${clean.location}`;
    if (!signature || seen.has(signature)) return;
    seen.add(signature);
    normalized.push(clean);
  });

  return normalized.sort((a, b) => {
    const createdDiff = getDateScore(b.createdAt, DEFAULT_TIME) - getDateScore(a.createdAt, DEFAULT_TIME);
    if (createdDiff !== 0) return createdDiff;
    return getDateScore(b.date, b.time) - getDateScore(a.date, a.time);
  });
}

function migrateShows(value) {
  const next = normalizeShows(value);
  saveLS(LS_SHOWS, next);
  try {
    localStorage.removeItem(LS_SHOWS_LEGACY);
  } catch {}
  return next;
}

function StatsRow({ orders }) {
  const confirmedOrders = orders.filter((order) => order.depositStatus === '입금완료');
  const totalTickets = orders.reduce((sum, order) => sum + (Number(order.ticketCount) || 0), 0);
  const totalAmount = confirmedOrders.reduce((sum, order) => sum + (Number(order.totalPrice) || 0), 0);
  const entered = orders.filter((order) => order.attendanceStatus === '입장완료').length;

  const items = [
    { label: '총 예매 수', value: `${totalTickets}장`, icon: '🎫' },
    { label: '입금 완료 금액', value: `${totalAmount.toLocaleString()}원`, icon: '💰' },
    { label: '예매자 수', value: `${orders.length}명`, icon: '👥' },
    { label: '입장 완료', value: `${entered}명`, icon: '✅' },
  ];

  return (
    <div className="perf-stats-grid">
      {items.map((item) => (
        <div key={item.label} className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 22 }}>{item.icon}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 700 }}>{item.label}</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--slate-900)' }}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

function OrderList({ orders, onUpdate, onDelete }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((order) => {
      return (
        String(order.audienceName || '').toLowerCase().includes(q) ||
        String(order.phone || '').toLowerCase().includes(q)
      );
    });
  }, [orders, query]);

  return (
    <div>
      <div style={{ position: 'relative', marginBottom: 12 }}>
        <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', fontSize: 16 }}>🔎</span>
        <input
          type="text"
          placeholder="이름 또는 전화번호 검색"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="search-input"
          style={{ width: '100%', paddingLeft: 40, boxSizing: 'border-box', height: 44, fontSize: 14 }}
        />
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '36px 0', color: 'var(--text-muted)', fontSize: 14 }}>
          {orders.length === 0 ? '아직 예매 내역이 없습니다.' : '검색 결과가 없습니다.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--slate-100)', background: 'var(--slate-50)' }}>
                {['예매자', '연락처', '매수', '총금액', '입금 상태', '입장 상태', '관리'].map((header, index) => (
                  <th
                    key={header}
                    style={{
                      padding: '12px',
                      textAlign: index === 6 ? 'right' : 'left',
                      fontWeight: 800,
                      color: 'var(--text-muted)',
                      fontSize: 13,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((order) => {
                const depositDone = order.depositStatus === '입금완료';
                const attendanceDone = order.attendanceStatus === '입장완료';
                return (
                  <tr
                    key={order.id}
                    style={{
                      borderBottom: '1px solid var(--slate-100)',
                      background: attendanceDone ? '#f9fafb' : '#fff',
                    }}
                  >
                    <td style={{ padding: '12px', fontWeight: 800, color: 'var(--slate-900)' }}>{order.audienceName}</td>
                    <td style={{ padding: '12px', color: 'var(--slate-600)' }}>{order.phone}</td>
                    <td style={{ padding: '12px', fontWeight: 800 }}>{order.ticketCount}장</td>
                    <td style={{ padding: '12px', fontWeight: 800, color: 'var(--slate-900)' }}>{(order.totalPrice || 0).toLocaleString()}원</td>
                    <td style={{ padding: '12px' }}>
                      <Badge label={formatDeposit(order.depositStatus)} tone={depositDone ? 'green' : 'amber'} />
                    </td>
                    <td style={{ padding: '12px' }}>
                      <Badge label={formatAttendance(order.attendanceStatus)} tone={attendanceDone ? 'blue' : 'slate'} />
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdate(order.id, {
                              depositStatus: depositDone ? '입금대기' : '입금완료',
                            })
                          }
                          style={{
                            padding: '7px 12px',
                            borderRadius: 10,
                            border: '1px solid #bbf7d0',
                            background: depositDone ? '#ecfdf5' : '#f0fdf4',
                            color: '#15803d',
                            fontSize: 12,
                            fontWeight: 800,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {depositDone ? '입금 대기' : '입금 완료'}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdate(order.id, {
                              attendanceStatus: attendanceDone ? '미입장' : '입장완료',
                            })
                          }
                          style={{
                            padding: '7px 12px',
                            borderRadius: 10,
                            border: '1px solid #bfdbfe',
                            background: attendanceDone ? '#dbeafe' : '#eff6ff',
                            color: '#1d4ed8',
                            fontSize: 12,
                            fontWeight: 800,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {attendanceDone ? '미입장' : '입장 완료'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(order.id)}
                          style={{
                            padding: '7px 10px',
                            borderRadius: 10,
                            border: '1px solid #fecdd3',
                            background: '#fff1f2',
                            color: '#be123c',
                            fontSize: 12,
                            fontWeight: 800,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ShowFormModal({ show, onClose, onSave }) {
  const isEdit = Boolean(show);
  const [form, setForm] = useState(EMPTY_SHOW);

  useEffect(() => {
    if (isEdit && show) {
      setForm({
        title: show.title || '',
        date: show.date || '',
        time: show.time || DEFAULT_TIME,
        location: show.location || '',
        price: Number(show.price) > 0 ? Number(show.price) : TICKET_PRICE,
        description: show.description || '',
        status: show.status === '종료' ? '종료' : '진행중',
        imageUrl: show.imageUrl || '',
        customSections: Array.isArray(show.customSections)
          ? show.customSections.map((section) => ({
              id: section.id || createId('sec'),
              title: section.title || '',
              content: section.content || '',
            }))
          : [],
      });
    } else {
      setForm(EMPTY_SHOW);
    }
  }, [isEdit, show]);

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const updateSection = (sectionId, field, value) => {
    setForm((prev) => ({
      ...prev,
      customSections: prev.customSections.map((section) =>
        section.id === sectionId ? { ...section, [field]: value } : section,
      ),
    }));
  };

  const addSection = () => {
    setForm((prev) => ({
      ...prev,
      customSections: [...prev.customSections, { id: createId('sec'), title: '', content: '' }],
    }));
  };

  const removeSection = (sectionId) => {
    setForm((prev) => ({
      ...prev,
      customSections: prev.customSections.filter((section) => section.id !== sectionId),
    }));
  };

  const handlePosterUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      updateField('imageUrl', String(readerEvent.target?.result || ''));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const clean = sanitizeShow(form);
    if (!clean) {
      alert('공연명, 날짜, 장소는 반드시 입력해야 합니다.');
      return;
    }
    onSave({
      ...clean,
      id: isEdit && show?.id ? show.id : createId('show'),
      createdAt: show?.createdAt || clean.createdAt,
      updatedAt: new Date().toISOString(),
      supportAccount: show?.supportAccount || SUPPORT_ACCOUNT,
    });
    onClose();
  };

  const inputStyle = {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 10,
    border: '1px solid var(--slate-200)',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    background: '#fff',
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" style={{ maxWidth: 680 }} onClick={(event) => event.stopPropagation()}>
        <div className="modal-handle" />
        <h3 style={{ fontSize: 20, fontWeight: 900, margin: '0 0 20px', color: 'var(--slate-900)' }}>
          {isEdit ? '공연 정보 수정' : '신규 공연 등록'}
        </h3>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>공연 타이틀 *</label>
            <input
              style={inputStyle}
              value={form.title}
              onChange={(event) => updateField('title', event.target.value)}
              placeholder="예: 2026 루미크 여름 정기공연"
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>공연 날짜 *</label>
              <input type="date" style={inputStyle} value={form.date} onChange={(event) => updateField('date', event.target.value)} required />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>시작 시간 *</label>
              <input type="time" style={inputStyle} value={form.time} onChange={(event) => updateField('time', event.target.value)} required />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>공연 장소 *</label>
            <input
              style={inputStyle}
              value={form.location}
              onChange={(event) => updateField('location', event.target.value)}
              placeholder="예: 대학 강당 / 공연장 이름"
              required
            />
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>예매 가격(원)</label>
            <input type="number" min="0" step="500" style={inputStyle} value={form.price} onChange={(event) => updateField('price', event.target.value)} />
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>포스터 이미지</label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input type="file" accept="image/*" onChange={handlePosterUpload} style={{ ...inputStyle, padding: '8px 12px' }} />
              {form.imageUrl ? (
                <button
                  type="button"
                  onClick={() => updateField('imageUrl', '')}
                  style={{
                    padding: '8px 12px',
                    background: '#fff1f2',
                    border: '1px solid #fecdd3',
                    color: '#be123c',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 800,
                    whiteSpace: 'nowrap',
                  }}
                >
                  삭제
                </button>
              ) : null}
            </div>
            {form.imageUrl ? (
              <div style={{ marginTop: 8, width: '100%', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', padding: 8 }}>
                <img src={form.imageUrl} alt="포스터 미리보기" style={{ width: '100%', height: 'auto', objectFit: 'contain', display: 'block' }} />
              </div>
            ) : null}
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>공연 소개</label>
            <textarea
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
              value={form.description}
              onChange={(event) => updateField('description', event.target.value)}
              placeholder="공연 소개 및 유의사항"
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <label style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-muted)' }}>상세 안내 섹션</label>
            <button type="button" className="btn-secondary" onClick={addSection} style={{ height: 36, padding: '0 14px', fontSize: 13 }}>
              + 섹션 추가
            </button>
          </div>

          {form.customSections.map((section, index) => (
            <div
              key={section.id}
              style={{
                border: '1px solid var(--slate-200)',
                borderRadius: 12,
                padding: 14,
                display: 'grid',
                gap: 10,
                background: '#fafafa',
              }}
            >
              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  value={section.title}
                  onChange={(event) => updateSection(section.id, 'title', event.target.value)}
                  placeholder={`섹션 제목 ${index + 1}`}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button
                  type="button"
                  onClick={() => removeSection(section.id)}
                  className="btn-secondary"
                  style={{ height: 44, padding: '0 14px', fontSize: 13 }}
                >
                  삭제
                </button>
              </div>
              <textarea
                rows={3}
                value={section.content}
                onChange={(event) => updateSection(section.id, 'content', event.target.value)}
                placeholder="상세 안내"
                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
              />
            </div>
          ))}

          <div>
            <label style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>상태</label>
            <select
              style={{ ...inputStyle, background: '#f9fafb' }}
              value={form.status}
              onChange={(event) => updateField('status', event.target.value)}
            >
              <option value="진행중">진행중</option>
              <option value="종료">종료</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button type="button" onClick={onClose} className="btn-secondary" style={{ flex: 1, height: 44 }}>
              취소
            </button>
            <button type="submit" className="btn-primary" style={{ flex: 2, height: 44 }}>
              {isEdit ? '변경사항 저장' : '공연 등록'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ShowDetailModal({
  show,
  orders,
  onClose,
  onEdit,
  onDeleteShow,
  onUpdateOrder,
  onDeleteOrder,
  onCopyLink,
  copied,
}) {
  if (!show) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-sheet"
        style={{ maxWidth: 1120, width: 'min(1120px, calc(100vw - 24px))', maxHeight: 'calc(100dvh - 24px)', overflow: 'auto' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-handle" />

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ marginBottom: 8 }}>
              <Badge label={show.status === '종료' ? '종료' : '진행중'} tone={show.status === '종료' ? 'slate' : 'green'} />
            </div>
            <h3 style={{ fontSize: 28, lineHeight: 1.2, fontWeight: 950, margin: '0 0 10px', color: 'var(--slate-900)' }}>{show.title}</h3>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0, lineHeight: 1.7 }}>
              목록에서는 핵심 정보만 보이고, 상세 정보는 이 패널에서 정갈하게 확인할 수 있습니다.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onEdit} className="btn-secondary" style={{ height: 40, padding: '0 14px' }}>
              수정
            </button>
            <button
              type="button"
              onClick={onDeleteShow}
              style={{
                height: 40,
                padding: '0 14px',
                borderRadius: 10,
                border: '1px solid #fecdd3',
                background: '#fff1f2',
                color: '#be123c',
                fontSize: 14,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              삭제
            </button>
            <button type="button" onClick={onClose} className="btn-secondary" style={{ height: 40, padding: '0 14px' }}>
              닫기
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 16, marginTop: 18 }}>
          {show.imageUrl ? (
            <SectionCard title="포스터">
              <img
                src={show.imageUrl}
                alt={show.title}
                style={{ width: '100%', height: 'auto', objectFit: 'contain', display: 'block', borderRadius: 16 }}
              />
            </SectionCard>
          ) : null}

          <SectionCard title="공연 정보">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
              {[
                ['일시', formatDateTime(show.date, show.time)],
                ['장소', show.location],
                ['예매 가격', `${Number(show.price || TICKET_PRICE).toLocaleString()}원`],
                ['계좌', show.supportAccount || SUPPORT_ACCOUNT],
              ].map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--slate-800)', lineHeight: 1.5 }}>{value}</div>
                </div>
              ))}
            </div>
          </SectionCard>

          {show.description ? (
            <SectionCard title="공연 소개">
              <p style={{ fontSize: 14, color: 'var(--slate-600)', margin: 0, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{show.description}</p>
            </SectionCard>
          ) : null}

          {(show.customSections || []).length > 0 ? (
            <SectionCard title="상세 안내">
              <div style={{ display: 'grid', gap: 12 }}>
                {show.customSections.map((section) => (
                  <div key={section.id} style={{ padding: 14, borderRadius: 14, background: '#f8fafc', border: '1px solid var(--slate-100)' }}>
                    <h4 style={{ fontSize: 15, fontWeight: 900, color: 'var(--slate-900)', margin: '0 0 6px' }}>{section.title}</h4>
                    <p style={{ fontSize: 14, color: 'var(--slate-600)', margin: 0, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{section.content}</p>
                  </div>
                ))}
              </div>
            </SectionCard>
          ) : null}

          <SectionCard title="관객 신청 현황 및 제어">
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>예매 링크</span>
              <input
                readOnly
                value={`${window.location.origin}/form/${show.id}`}
                style={{
                  flex: 1,
                  minWidth: 220,
                  padding: '10px 14px',
                  border: '1px solid var(--slate-200)',
                  borderRadius: 10,
                  fontSize: 13,
                  background: 'var(--slate-50)',
                  color: 'var(--slate-600)',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
              />
              <button type="button" onClick={() => onCopyLink(show.id)} className={copied ? 'btn-secondary' : 'btn-primary'} style={{ height: 42, padding: '0 18px', borderRadius: 10, fontSize: 13, fontWeight: 800 }}>
                {copied ? '복사 완료' : '링크 복사'}
              </button>
            </div>

            <StatsRow orders={orders} />

            <div className="card card-pad" style={{ padding: '18px 20px', background: '#fff' }}>
              <div className="flex-between" style={{ marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 900, color: 'var(--slate-900)' }}>예매 명단</span>
                <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>총 {orders.length}건</span>
              </div>
              <OrderList orders={orders} onUpdate={onUpdateOrder} onDelete={onDeleteOrder} />
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

export default function PerformancePage() {
  const [shows, setShows] = useState(() => {
    const primary = normalizeShows(loadLS(LS_SHOWS));
    if (primary.length > 0) return primary;
    const legacy = normalizeShows(loadLS(LS_SHOWS_LEGACY));
    if (legacy.length > 0) return migrateShows(legacy);
    return [];
  });
  const [orders, setOrders] = useState(() => loadLS(LS_ORDERS));
  const [selectedId, setSelectedId] = useState(null);
  const [formState, setFormState] = useState({ open: false, show: null });
  const [detailOpen, setDetailOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    saveLS(LS_SHOWS, normalizeShows(shows));
  }, [shows]);

  useEffect(() => {
    saveLS(LS_ORDERS, orders);
  }, [orders]);

  useEffect(() => {
    if (shows.length === 0) {
      setSelectedId(null);
      setDetailOpen(false);
      return;
    }
    if (!selectedId || !shows.some((show) => show.id === selectedId)) {
      setSelectedId(shows[0].id);
    }
  }, [shows, selectedId]);

  const selectedShow = useMemo(() => shows.find((show) => show.id === selectedId) || null, [shows, selectedId]);
  const selectedOrders = useMemo(() => orders.filter((order) => order.concertId === selectedId), [orders, selectedId]);

  const openDetail = useCallback((show) => {
    setSelectedId(show.id);
    setDetailOpen(true);
  }, []);

  const closeDetail = () => setDetailOpen(false);

  const saveShow = useCallback((showData) => {
    const nextShow = sanitizeShow(showData);
    if (!nextShow) {
      alert('공연명, 날짜, 장소는 반드시 입력해야 합니다.');
      return;
    }

    setShows((prev) => {
      const exists = prev.some((show) => show.id === nextShow.id);
      const next = exists
        ? prev.map((show) => (show.id === nextShow.id ? { ...nextShow, createdAt: show.createdAt || nextShow.createdAt } : show))
        : [...prev, nextShow];
      return normalizeShows(next);
    });
    setSelectedId(nextShow.id);
    setDetailOpen(true);
  }, []);

  const deleteShow = useCallback((id) => {
    if (!window.confirm('공연과 모든 예매 내역을 삭제할까요?')) return;
    setShows((prev) => prev.filter((show) => show.id !== id));
    setOrders((prev) => prev.filter((order) => order.concertId !== id));
    setSelectedId((current) => (current === id ? null : current));
    setDetailOpen(false);
  }, []);

  const updateOrder = useCallback((orderId, changes) => {
    setOrders((prev) =>
      prev.map((order) => {
        if (order.id !== orderId) return order;
        return { ...order, ...changes };
      }),
    );
  }, []);

  const deleteOrder = useCallback((orderId) => {
    if (!window.confirm('예매 내역을 삭제할까요?')) return;
    setOrders((prev) => prev.filter((order) => order.id !== orderId));
  }, []);

  const copyLink = useCallback(async (id) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/form/${id}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      alert('링크 복사에 실패했습니다.');
    }
  }, []);

  const sortedShows = useMemo(() => {
    return [...shows].sort((a, b) => {
      const createdDiff = getDateScore(b.createdAt, DEFAULT_TIME) - getDateScore(a.createdAt, DEFAULT_TIME);
      if (createdDiff !== 0) return createdDiff;
      return getDateScore(b.date, b.time) - getDateScore(a.date, a.time);
    });
  }, [shows]);

  return (
    <div className="page fade-in" style={{ width: '100%', maxWidth: 1400, margin: '0 auto' }}>
      <div className="flex-between" style={{ flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 950, margin: 0, color: 'var(--slate-900)' }}>공연 관리 · 관객 예매 관리</h2>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '4px 0 0' }}>신규 등록 · 예매 신청 · 입금 확인 · 현장 입장 체크</p>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={() => setFormState({ open: true, show: null })}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 40, padding: '0 14px', fontSize: 14, whiteSpace: 'nowrap' }}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> 공연 추가
        </button>
      </div>

      {shows.length === 0 ? (
        <div className="card card-pad" style={{ textAlign: 'center', padding: '72px 24px', marginTop: 16 }}>
          <div style={{ fontSize: 54, marginBottom: 14 }}>🎭</div>
          <p style={{ fontSize: 18, fontWeight: 800, color: 'var(--slate-700)', margin: '0 0 8px' }}>등록된 공연이 없습니다</p>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 24px' }}>우측 상단 버튼으로 첫 공연을 등록해보세요.</p>
          <button type="button" className="btn-primary" onClick={() => setFormState({ open: true, show: null })} style={{ height: 42, padding: '0 20px', fontSize: 14 }}>
            첫 공연 등록하기
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 16, display: 'grid', gap: 16 }}>
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--slate-100)', display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--slate-700)' }}>
                등록된 공연 <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>({sortedShows.length})</span>
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>최신 등록순 · 카드 클릭 시 상세 열림</span>
            </div>

            <div className="perf-list-grid">
              {sortedShows.map((show) => {
                const active = show.id === selectedId;
                return (
                  <button
                    key={show.id}
                    type="button"
                    onClick={() => openDetail(show)}
                    className="perf-show-item"
                    style={{
                      textAlign: 'left',
                      border: active ? '1px solid #111827' : '1px solid var(--slate-100)',
                      borderRadius: 18,
                      background: active ? '#f8fafc' : '#fff',
                      padding: 16,
                      cursor: 'pointer',
                      display: 'grid',
                      gap: 10,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 17, fontWeight: 900, color: 'var(--slate-900)', lineHeight: 1.35 }}>{show.title}</div>
                        <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-muted)' }}>📅 {formatDateTime(show.date, show.time)}</div>
                      </div>
                      <Badge label={show.status === '종료' ? '종료' : '진행중'} tone={show.status === '종료' ? 'slate' : 'green'} />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, color: 'var(--slate-600)' }}>📍 {show.location}</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--slate-900)' }}>{Number(show.price || TICKET_PRICE).toLocaleString()}원</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>클릭해서 상세 보기</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--slate-500)' }}>{new Date(show.createdAt || show.updatedAt || show.date).toLocaleString()}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {detailOpen && selectedShow ? (
            <ShowDetailModal
              show={selectedShow}
              orders={selectedOrders}
              onClose={closeDetail}
              onEdit={() => setFormState({ open: true, show: selectedShow })}
              onDeleteShow={() => deleteShow(selectedShow.id)}
              onUpdateOrder={updateOrder}
              onDeleteOrder={deleteOrder}
              onCopyLink={copyLink}
              copied={copied}
            />
          ) : null}
        </div>
      )}

      {formState.open ? (
        <ShowFormModal
          show={formState.show}
          onClose={() => setFormState({ open: false, show: null })}
          onSave={saveShow}
        />
      ) : null}
    </div>
  );
}
