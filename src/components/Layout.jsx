import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { TABS, MOBILE_TABS, PAGE_TITLES } from '../utils/navigation';
import ChangePwdModal from './ChangePwdModal';
import ExcelImportModal from './ExcelImportModal';
import LoginModal from './LoginModal';

export default function Layout({ children }) {
  const { isAdmin, runWithAdmin, logout, showLoginModal } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  
  const currentPath = location.pathname;
  // Match path exactly, or handle cases if needed (e.g. default to '/')
  const currentTab = Object.keys(PAGE_TITLES).includes(currentPath) ? currentPath : '/';

  const [showExcelModal, setShowExcelModal] = useState(false);
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [activeSubmenu, setActiveSubmenu] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState({ dues: true, activity: true });

  useEffect(() => {
    window.scrollTo(0, 0);
    setActiveSubmenu(null);
  }, [currentPath]);

  const toggleGroup = (key) => {
    setExpandedGroups(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleAddClick = () => {
    runWithAdmin(() => {
      navigate('/ledger');
      setShowExcelModal(true);
    });
  };

  return (
    <div className="app-root">
      {/* PC 사이드바 */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-mark">
            <img src="/logo.png" alt="Lumique" />
          </div>
          <div><h1>Lumique</h1><p>동아리 운영 관리 시스템</p></div>
        </div>
        <nav style={{ flex: 1, overflowY: 'auto', paddingBottom: 20 }}>
          {/* 대시보드 (독립 탭) */}
          <div style={{ marginTop: 12 }}>
            {(() => {
              const t = TABS.find(x => x.id === 'home');
              return (
                <button key={t.id}
                  className={`sidebar-nav-item ${currentPath === t.path ? 'active' : ''}`}
                  onClick={() => navigate(t.path)}>
                  {t.icon}<span>{t.label}</span>
                </button>
              );
            })()}
          </div>

          {/* 그룹 탭들 (아코디언 트리 구조) */}
          {[
            { 
              key: 'dues', 
              title: '회비 관리', 
              paths: ['/ledger', '/dues', '/analytics'],
              icon: <svg viewBox="0 0 24 24"><path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            },
            { 
              key: 'activity', 
              title: '활동 관리', 
              paths: ['/members', '/concerts', '/calendar'],
              icon: <svg viewBox="0 0 24 24"><path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
            }
          ].map((g) => {
            const isExpanded = !!expandedGroups[g.key];
            const hasActiveChild = g.paths.includes(currentPath);
            
            return (
              <div key={g.key} className="sidebar-group-accordion" style={{ marginTop: 20 }}>
                {/* 아코디언 헤더 */}
                <button
                  type="button"
                  className={`sidebar-group-header ${hasActiveChild ? 'has-active' : ''}`}
                  onClick={() => toggleGroup(g.key)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {g.icon}
                    <span>{g.title}</span>
                  </div>
                  <span className={`chevron ${isExpanded ? 'rotated' : ''}`}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 9l-7 7-7-7"/></svg>
                  </span>
                </button>

                {/* 하위 아이템 */}
                <div className={`sidebar-group-content ${isExpanded ? 'expanded' : ''}`}>
                  <div className="sidebar-group-content-inner">
                    {g.paths.map(path => {
                      const t = TABS.find(x => x.path === path);
                      if (!t) return null;
                      return (
                        <button key={t.id}
                          className={`sidebar-nav-item sub-item ${currentPath === t.path ? 'active' : ''}`}
                          onClick={() => navigate(t.path)}>
                          <span className="dot" />
                          <span>{t.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}

          {/* 설정 (독립 탭) */}
          <div style={{ marginTop: 20 }}>
            {(() => {
              const t = TABS.find(x => x.id === 'settings');
              return (
                <button key={t.id}
                  className={`sidebar-nav-item ${currentPath === t.path ? 'active' : ''}`}
                  onClick={() => navigate(t.path)}>
                  {t.icon}<span>{t.label}</span>
                </button>
              );
            })()}
          </div>
        </nav>
        
        <div style={{ padding: '16px', background: 'var(--c-dark)', borderTop: '1px solid #333' }}>
          {isAdmin ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--emerald-500)' }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-white)' }}>접속 중</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setShowPwdModal(true)} style={{ background: 'none', border: 'none', color: 'var(--gray-400)', fontSize: 12, cursor: 'pointer', padding: 0 }}>암호변경</button>
                  <button onClick={logout} style={{ background: 'none', border: 'none', color: 'var(--gray-400)', fontSize: 12, cursor: 'pointer', padding: 0 }}>로그아웃</button>
                </div>
              </div>
            </div>
          ) : (
            <button className="sidebar-login-btn" onClick={() => runWithAdmin(() => {})}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg>
              관리자 로그인
            </button>
          )}
        </div>
      </aside>

      <div className="pc-main">
        <header className="pc-header">
          <span className="pc-header-title">{PAGE_TITLES[currentTab] || '대시보드'}</span>
          <span className="pc-header-sub">Lumique · 토스뱅크 1001-7629-3105</span>
        </header>

        <header className="mobile-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="logo-mark">
              <img src="/logo.png" alt="Lumique" />
            </div>
            <h1>
              <span style={{ color: '#fff', fontWeight: 800 }}>Lumique</span>
              <span style={{ margin: '0 8px', color: '#555', fontWeight: 300 }}>|</span>
              <span style={{ color: '#bbb', fontWeight: 500 }}>{PAGE_TITLES[currentTab] || '대시보드'}</span>
            </h1>
          </div>
        </header>

        <main className="main-content" onClick={() => setActiveSubmenu(null)}>
          {children}
        </main>
      </div>

      {/* 모바일 서브메뉴 백드롭 블러 오버레이 */}
      {activeSubmenu && (
        <div className="mobile-submenu-overlay" onClick={() => setActiveSubmenu(null)} />
      )}

      {/* 모바일 서브메뉴 플로팅 바 (Bottom Bar 바로 위) */}
      <div className={`mobile-submenu-bar ${activeSubmenu ? 'show' : ''}`}>
        {activeSubmenu === 'dues_group' && [
          { id: 'ledger', label: '입출금 내역', icon: '📋', path: '/ledger' },
          { id: 'dues', label: '납부 현황', icon: '✅', path: '/dues' },
          { id: 'analytics', label: '요약', icon: '📊', path: '/analytics' },
        ].map(item => (
          <button key={item.id} 
            className={`submenu-item ${currentPath === item.path ? 'active' : ''}`}
            onClick={() => {
              navigate(item.path);
              setActiveSubmenu(null);
            }}
          >
            <span className="submenu-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}

        {activeSubmenu === 'activity_group' && [
          { id: 'members', label: '회원 관리', icon: '👥', path: '/members' },
          { id: 'perf', label: '공연 관리', icon: '🎭', path: '/concerts' },
          { id: 'calendar', label: '연습 일정', icon: '📅', path: '/calendar' },
        ].map(item => (
          <button key={item.id} 
            className={`submenu-item ${currentPath === item.path ? 'active' : ''}`}
            onClick={() => {
              navigate(item.path);
              setActiveSubmenu(null);
            }}
          >
            <span className="submenu-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      <nav className="bottom-nav">
        {MOBILE_TABS.map(t => {
          const isActive = (() => {
            if (t.id === 'home') return currentPath === '/';
            if (t.id === 'dues_group') return ['/ledger', '/dues', '/analytics'].includes(currentPath);
            if (t.id === 'activity_group') return ['/members', '/concerts', '/calendar'].includes(currentPath) || currentPath.startsWith('/concerts/');
            if (t.id === 'settings') return currentPath === '/settings';
            return currentPath === t.path;
          })();
          
          return (
            <button key={t.id}
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => {
                if (t.id === 'dues_group' || t.id === 'activity_group') {
                  setActiveSubmenu(prev => prev === t.id ? null : t.id);
                } else {
                  navigate(t.path);
                  setActiveSubmenu(null);
                }
              }}>
              {t.icon}<span>{t.short}</span>
            </button>
          );
        })}
      </nav>
      {showPwdModal && <ChangePwdModal onClose={() => setShowPwdModal(false)} />}
      {showLoginModal && <LoginModal />}
      {showExcelModal && <ExcelImportModal onClose={() => setShowExcelModal(false)} />}
    </div>
  );
}
