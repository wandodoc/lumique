import { BrowserRouter, Routes, Route, useParams, useNavigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { AuthProvider } from './context/AuthContext';
import Layout from './components/Layout';
import DashboardPage from './pages/DashboardPage';
import MemberDuesPage from './pages/MemberDuesPage';
import MembersPage from './pages/MembersPage';
import TransactionPage from './pages/TransactionPage';
import AnalyticsPage from './pages/AnalyticsPage';
import SettingsPage from './pages/SettingsPage';
import CalendarPage from './pages/CalendarPage';
import PerformancePage from './pages/PerformancePage';
import ReservationManagementPage from './pages/ReservationManagementPage';
import TicketOrderForm from './pages/TicketOrderForm';
import { TABS } from './utils/navigation';
import './App.css';
import './loading.css';

function TransactionPageWrapper() {
  return <TransactionPage openExcelImport={() => {}} />;
}

function TicketOrderFormWrapper() {
  const { showId } = useParams();
  return <TicketOrderForm showId={showId} />;
}

function DashboardPageWrapper() {
  const navigate = useNavigate();
  const setTab = (tabId) => {
    const tab = TABS.find(t => t.id === tabId);
    if (tab) navigate(tab.path);
  };
  return <DashboardPage setTab={setTab} />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppProvider>
          <Routes>
            {/* 레이아웃 없이 독립적으로 렌더링되는 페이지들 */}
            <Route path="/reservations" element={<ReservationManagementPage />} />
            <Route path="/manage/:id" element={<ReservationManagementPage />} />
            <Route path="/form/:showId" element={<TicketOrderFormWrapper />} />
            <Route path="/events/:showId" element={<TicketOrderFormWrapper />} />

            {/* Layout이 적용되는 메인 앱 라우트 */}
            <Route path="/*" element={
              <Layout>
                <Routes>
                  <Route path="/" element={<DashboardPageWrapper />} />
                  <Route path="/members" element={<MembersPage initialView="회원 목록" />} />
                  <Route path="/concerts" element={<PerformancePage />} />
                  <Route path="/concerts/:id" element={<PerformancePage />} />
                  <Route path="/calendar" element={<CalendarPage />} />
                  <Route path="/calendar/detail/:id" element={<CalendarPage />} />
                  <Route path="/dues" element={<MemberDuesPage />} />
                  <Route path="/ledger" element={<TransactionPageWrapper />} />
                  <Route path="/analytics" element={<AnalyticsPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="*" element={<DashboardPageWrapper />} />
                </Routes>
              </Layout>
            } />
          </Routes>
        </AppProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
