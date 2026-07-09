import { useState } from "react";
import { AppProvider } from "./context/AppContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import DashboardPage from "./pages/DashboardPage";
import MemberDuesPage from "./pages/MemberDuesPage";
import MembersPage from "./pages/MembersPage";
import TransactionPage from "./pages/TransactionPage";
import AddTransactionPage from "./pages/AddTransactionPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import SettingsPage from "./pages/SettingsPage";
import LoginModal from "./components/LoginModal";
import "./App.css";
const TABS = [
  {
    id: "home",
    label: "\uB300\uC2DC\uBCF4\uB4DC",
    short: "\uD648",
    icon: /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24" }, /* @__PURE__ */ React.createElement("path", { d: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" }))
  },
  {
    id: "members",
    label: "\uD68C\uC6D0 \uAD00\uB9AC",
    short: "\uD68C\uC6D0",
    icon: /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24" }, /* @__PURE__ */ React.createElement("path", { d: "M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" }))
  },
  {
    id: "dues",
    label: "\uB0A9\uBD80 \uD604\uD669",
    short: "\uB0A9\uBD80",
    icon: /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24" }, /* @__PURE__ */ React.createElement("path", { d: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" }))
  },
  {
    id: "ledger",
    label: "\uC785\uCD9C\uAE08 \uB0B4\uC5ED",
    short: "\uB0B4\uC5ED",
    icon: /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24" }, /* @__PURE__ */ React.createElement("path", { d: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 12h6m-6 4h4" }))
  },
  {
    id: "analytics",
    label: "\uBD84\uC11D",
    short: "\uBD84\uC11D",
    icon: /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24" }, /* @__PURE__ */ React.createElement("path", { d: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" }))
  },
  {
    id: "settings",
    label: "\uC124\uC815",
    short: "\uC124\uC815",
    icon: /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24" }, /* @__PURE__ */ React.createElement("path", { d: "M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28z" }), /* @__PURE__ */ React.createElement("path", { d: "M15 12a3 3 0 11-6 0 3 3 0 016 0z" }))
  }
];
const PAGE_TITLES = {
  home: "\uB300\uC2DC\uBCF4\uB4DC",
  members: "\uD68C\uC6D0 \uAD00\uB9AC",
  dues: "\uB0A9\uBD80 \uD604\uD669",
  ledger: "\uC785\uCD9C\uAE08 \uB0B4\uC5ED",
  analytics: "\uBD84\uC11D",
  settings: "\uC124\uC815"
};
function ChangePwdModal({ onClose }) {
  const { changePassword } = useAuth();
  const [pwd, setPwd] = useState("");
  const handleSubmit = (e) => {
    e.preventDefault();
    if (pwd.length < 4) return alert("\uBE44\uBC00\uBC88\uD638\uB294 4\uC790\uB9AC \uC774\uC0C1\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.");
    changePassword(pwd);
    alert("\uBE44\uBC00\uBC88\uD638\uAC00 \uBCC0\uACBD\uB418\uC5C8\uC2B5\uB2C8\uB2E4.");
    onClose();
  };
  return /* @__PURE__ */ React.createElement("div", { className: "modal-overlay", onClick: onClose }, /* @__PURE__ */ React.createElement("div", { className: "modal-sheet", style: { maxWidth: 360 }, onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "modal-handle" }), /* @__PURE__ */ React.createElement("h3", { style: { fontSize: 18, fontWeight: 800, marginBottom: 16 } }, "\uAD00\uB9AC\uC790 \uBE44\uBC00\uBC88\uD638 \uBCC0\uACBD"), /* @__PURE__ */ React.createElement("form", { onSubmit: handleSubmit }, /* @__PURE__ */ React.createElement("input", { type: "password", value: pwd, onChange: (e) => setPwd(e.target.value), placeholder: "\uC0C8 \uBE44\uBC00\uBC88\uD638 \uC785\uB825", autoFocus: true, style: { width: "100%", padding: "12px 16px", borderRadius: 8, border: "1px solid var(--slate-200)", fontSize: 15, marginBottom: 16 } }), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 10 } }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn-secondary", style: { flex: 1 }, onClick: onClose }, "\uCDE8\uC18C"), /* @__PURE__ */ React.createElement("button", { type: "submit", className: "btn-primary", style: { flex: 2 } }, "\uBCC0\uACBD\uD558\uAE30")))));
}
function AppInner() {
  const [tab, setTab] = useState("home");
  const [showAdd, setShowAdd] = useState(false);
  const [showPwdModal, setShowPwdModal] = useState(false);
  const { isAdmin, requestLogin, logout, showLoginModal } = useAuth();
  const handleAddClick = () => {
    if (isAdmin) setShowAdd(true);
    else requestLogin();
  };
  const renderPage = () => {
    if (showAdd) return /* @__PURE__ */ React.createElement(AddTransactionPage, { onClose: () => setShowAdd(false) });
    switch (tab) {
      case "home":
        return /* @__PURE__ */ React.createElement(DashboardPage, null);
      case "members":
        return /* @__PURE__ */ React.createElement(MembersPage, null);
      case "dues":
        return /* @__PURE__ */ React.createElement(MemberDuesPage, null);
      case "ledger":
        return /* @__PURE__ */ React.createElement(TransactionPage, null);
      case "analytics":
        return /* @__PURE__ */ React.createElement(AnalyticsPage, null);
      case "settings":
        return /* @__PURE__ */ React.createElement(SettingsPage, null);
      default:
        return /* @__PURE__ */ React.createElement(DashboardPage, null);
    }
  };
  return /* @__PURE__ */ React.createElement("div", { className: "app-root" }, /* @__PURE__ */ React.createElement("aside", { className: "sidebar" }, /* @__PURE__ */ React.createElement("div", { className: "sidebar-logo" }, /* @__PURE__ */ React.createElement("div", { className: "logo-mark" }, /* @__PURE__ */ React.createElement("img", { src: "/logo.png", alt: "Lumique" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h1", null, "Lumique"), /* @__PURE__ */ React.createElement("p", null, "\uB3D9\uC544\uB9AC \uD68C\uBE44 \uAD00\uB9AC"))), /* @__PURE__ */ React.createElement("nav", { style: { flex: 1, overflowY: "auto", paddingBottom: 20 } }, [
    { title: "\uD68C\uBE44 \uAD00\uB9AC", ids: ["home", "ledger", "dues", "analytics"] },
    { title: "\uC778\uC6D0 \uAD00\uB9AC", ids: ["members", "settings"] }
  ].map((g, i) => /* @__PURE__ */ React.createElement("div", { key: g.title, style: { marginTop: i === 0 ? 12 : 24 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 800, color: "var(--gray-500)", padding: "0 24px", marginBottom: 4 } }, g.title), g.ids.map((id) => {
    const t = TABS.find((x) => x.id === id);
    return /* @__PURE__ */ React.createElement(
      "button",
      {
        key: t.id,
        className: `sidebar-nav-item ${tab === t.id && !showAdd ? "active" : ""}`,
        onClick: () => {
          setTab(t.id);
          setShowAdd(false);
        }
      },
      t.icon,
      /* @__PURE__ */ React.createElement("span", null, t.label)
    );
  })))), /* @__PURE__ */ React.createElement("div", { style: { padding: "16px", background: "var(--c-dark)", borderTop: "1px solid #333" } }, isAdmin ? /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 12 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } }, /* @__PURE__ */ React.createElement("div", { style: { width: 8, height: 8, borderRadius: "50%", background: "var(--emerald-500)" } }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 13, fontWeight: 700, color: "var(--c-white)" } }, "\uC811\uC18D \uC911")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8 } }, /* @__PURE__ */ React.createElement("button", { onClick: () => setShowPwdModal(true), style: { background: "none", border: "none", color: "var(--gray-400)", fontSize: 12, cursor: "pointer", padding: 0 } }, "\uC554\uD638\uBCC0\uACBD"), /* @__PURE__ */ React.createElement("button", { onClick: logout, style: { background: "none", border: "none", color: "var(--gray-400)", fontSize: 12, cursor: "pointer", padding: 0 } }, "\uB85C\uADF8\uC544\uC6C3"))), /* @__PURE__ */ React.createElement("button", { className: "sidebar-add-btn", onClick: handleAddClick, style: { background: "#3A3A3A", color: "var(--c-white)", border: "none", width: "100%", justifyContent: "center" } }, /* @__PURE__ */ React.createElement("svg", { width: "15", height: "15", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5" }, /* @__PURE__ */ React.createElement("path", { d: "M12 5v14M5 12h14" })), "\uC0C8 \uAC70\uB798 \uCD94\uAC00")) : /* @__PURE__ */ React.createElement("button", { className: "sidebar-login-btn", onClick: requestLogin }, /* @__PURE__ */ React.createElement("svg", { width: "15", height: "15", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" }, /* @__PURE__ */ React.createElement("path", { d: "M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3" })), "\uAD00\uB9AC\uC790 \uB85C\uADF8\uC778"))), /* @__PURE__ */ React.createElement("div", { className: "pc-main" }, /* @__PURE__ */ React.createElement("header", { className: "pc-header" }, /* @__PURE__ */ React.createElement("span", { className: "pc-header-title" }, showAdd ? "\uAC70\uB798 \uCD94\uAC00" : PAGE_TITLES[tab]), /* @__PURE__ */ React.createElement("span", { className: "pc-header-sub" }, "Lumique \xB7 \uD1A0\uC2A4\uBC45\uD06C 1001-7629-3105")), /* @__PURE__ */ React.createElement("header", { className: "mobile-header" }, /* @__PURE__ */ React.createElement("div", { className: "logo-mark" }, /* @__PURE__ */ React.createElement("img", { src: "/logo.png", alt: "Lumique" })), /* @__PURE__ */ React.createElement("h1", null, showAdd ? "\uAC70\uB798 \uCD94\uAC00" : PAGE_TITLES[tab])), /* @__PURE__ */ React.createElement("main", { className: "main-content" }, renderPage())), /* @__PURE__ */ React.createElement("nav", { className: "bottom-nav" }, TABS.map((t) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: t.id,
      className: `nav-item ${tab === t.id && !showAdd ? "active" : ""}`,
      onClick: () => {
        setTab(t.id);
        setShowAdd(false);
      }
    },
    t.icon,
    /* @__PURE__ */ React.createElement("span", null, t.short)
  ))), !showAdd && /* @__PURE__ */ React.createElement("button", { className: "fab", onClick: handleAddClick, title: "\uAC70\uB798 \uCD94\uAC00" }, "\uFF0B"), showPwdModal && /* @__PURE__ */ React.createElement(ChangePwdModal, { onClose: () => setShowPwdModal(false) }), showLoginModal && /* @__PURE__ */ React.createElement(LoginModal, null));
}
export default function App() {
  return /* @__PURE__ */ React.createElement(AuthProvider, null, /* @__PURE__ */ React.createElement(AppProvider, null, /* @__PURE__ */ React.createElement(AppInner, null)));
}
