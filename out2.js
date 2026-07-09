import { useState } from "react";
import { useApp } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import "./Pages.css";
const PARTS = ["\uC804\uCCB4", "VOIX", "DANCE", "SESSION"];
const VIEWS = ["\uD68C\uC6D0 \uBAA9\uB85D", "\uACF5\uC5F0\uBCC4 \uD604\uD669"];
function fmtPerfLabel(key) {
  const parts = key.split("-");
  const y = parts[0], m = parseInt(parts[1], 10);
  if (parts.length === 3) return `${y}\uB144 ${m}\uC6D4 ${parseInt(parts[2], 10)}\uC77C`;
  return `${y}\uB144 ${m}\uC6D4`;
}
function sortByName(arr) {
  return [...arr].sort((a, b) => a.name.localeCompare(b.name, "ko"));
}
function MemberFormModal({ member, performances, onSave, onClose }) {
  const isEdit = !!member;
  const defaultPerfs = Object.fromEntries(performances.map((p) => [p.key, "\uBBF8\uCC38\uC5EC"]));
  const [form, setForm] = useState(
    member ? { ...member, performances: { ...defaultPerfs, ...member.performances || {} } } : { name: "", part: "VOIX", joinDate: "", leaveDate: "", status: "active", performances: defaultPerfs }
  );
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const setPerf = (k, v) => setForm((p) => ({ ...p, performances: { ...p.performances, [k]: v } }));
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name || !form.joinDate) return;
    onSave({
      ...form,
      id: form.id || "m_" + Date.now(),
      status: form.leaveDate ? "inactive" : "active"
    });
  };
  return /* @__PURE__ */ React.createElement("div", { className: "modal-overlay", onClick: onClose }, /* @__PURE__ */ React.createElement("div", { className: "modal-sheet", onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "modal-handle" }), /* @__PURE__ */ React.createElement("h3", { style: { fontSize: 20, fontWeight: 800, marginBottom: 20 } }, isEdit ? "\uD68C\uC6D0 \uC218\uC815" : "\uD68C\uC6D0 \uCD94\uAC00"), /* @__PURE__ */ React.createElement("form", { className: "add-form", onSubmit: handleSubmit }, /* @__PURE__ */ React.createElement("label", null, "\uC774\uB984", /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      value: form.name,
      placeholder: "\uD64D\uAE38\uB3D9",
      onChange: (e) => set("name", e.target.value),
      required: true
    }
  )), /* @__PURE__ */ React.createElement("label", null, "\uD30C\uD2B8", /* @__PURE__ */ React.createElement("select", { value: form.part, onChange: (e) => set("part", e.target.value) }, /* @__PURE__ */ React.createElement("option", { value: "VOIX" }, "VOIX"), /* @__PURE__ */ React.createElement("option", { value: "DANCE" }, "DANCE"), /* @__PURE__ */ React.createElement("option", { value: "SESSION" }, "SESSION"))), /* @__PURE__ */ React.createElement("label", null, "\uAC00\uC785\uC77C", /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "date",
      value: form.joinDate,
      onChange: (e) => set("joinDate", e.target.value),
      required: true
    }
  )), /* @__PURE__ */ React.createElement("label", null, "\uD0C8\uD1F4\uC77C (\uC120\uD0DD)", /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "date",
      value: form.leaveDate || "",
      onChange: (e) => set("leaveDate", e.target.value || null)
    }
  )), performances.length > 0 && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: "var(--slate-700)", marginTop: 4 } }, "\uACF5\uC5F0 \uCC38\uC5EC"), /* @__PURE__ */ React.createElement("div", { className: "perf-grid" }, performances.map((p) => {
    const joinMonth = form.joinDate?.slice(0, 7) ?? "9999-99";
    const disabled = joinMonth > p.key;
    return /* @__PURE__ */ React.createElement("div", { key: p.key, className: "perf-item" }, /* @__PURE__ */ React.createElement("span", { className: "text-muted", style: { fontSize: 11 } }, p.label), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        disabled,
        className: `perf-toggle ${form.performances?.[p.key] === "\uCC38\uC5EC" ? "active" : ""}`,
        style: { opacity: disabled ? 0.3 : 1, cursor: disabled ? "not-allowed" : "pointer" },
        onClick: () => !disabled && setPerf(p.key, form.performances?.[p.key] === "\uCC38\uC5EC" ? "\uBBF8\uCC38\uC5EC" : "\uCC38\uC5EC")
      },
      disabled ? "\u2014" : form.performances?.[p.key] === "\uCC38\uC5EC" ? "\uCC38\uC5EC" : "\uBBF8\uCC38\uC5EC"
    ));
  }))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 10, marginTop: 8 } }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn-secondary", style: { flex: 1 }, onClick: onClose }, "\uCDE8\uC18C"), /* @__PURE__ */ React.createElement("button", { type: "submit", className: "btn-primary", style: { flex: 2 } }, isEdit ? "\uC800\uC7A5" : "\uCD94\uAC00")))));
}
function AddPerfModal({ onSave, onClose, existing }) {
  const [date, setDate] = useState("");
  const [error, setError] = useState("");
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!date) return;
    const key = date;
    if (existing.some((p) => p.key === key)) {
      setError("\uC774\uBBF8 \uC874\uC7AC\uD558\uB294 \uACF5\uC5F0\uC785\uB2C8\uB2E4.");
      return;
    }
    onSave({ key, label: fmtPerfLabel(key) });
  };
  return /* @__PURE__ */ React.createElement("div", { className: "modal-overlay", onClick: onClose }, /* @__PURE__ */ React.createElement("div", { className: "modal-sheet", style: { maxWidth: 380 }, onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "modal-handle" }), /* @__PURE__ */ React.createElement("h3", { style: { fontSize: 18, fontWeight: 800, marginBottom: 16 } }, "\uACF5\uC5F0 \uC77C\uC815 \uCD94\uAC00"), /* @__PURE__ */ React.createElement("form", { className: "add-form", onSubmit: handleSubmit }, /* @__PURE__ */ React.createElement("label", null, "\uACF5\uC5F0 \uC77C\uC790", /* @__PURE__ */ React.createElement("input", { type: "date", value: date, onChange: (e) => setDate(e.target.value), required: true })), error && /* @__PURE__ */ React.createElement("div", { className: "text-red", style: { fontSize: 13 } }, error), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 10, marginTop: 8 } }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn-secondary", style: { flex: 1 }, onClick: onClose }, "\uCDE8\uC18C"), /* @__PURE__ */ React.createElement("button", { type: "submit", className: "btn-primary", style: { flex: 2 } }, "\uCD94\uAC00")))));
}
function PerfView({ performances, members }) {
  const [selectedPerf, setSelectedPerf] = useState(performances[0]?.key ?? null);
  if (performances.length === 0) {
    return /* @__PURE__ */ React.createElement("div", { className: "card card-pad", style: { textAlign: "center", color: "var(--slate-400)", padding: 40 } }, "\uB4F1\uB85D\uB41C \uACF5\uC5F0\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.");
  }
  const perf = performances.find((p) => p.key === selectedPerf);
  const eligible = sortByName(members.filter((m) => {
    const joinMonth = m.joinDate?.slice(0, 7) ?? "9999-99";
    return joinMonth <= selectedPerf;
  }));
  const participated = eligible.filter((m) => m.performances?.[selectedPerf] === "\uCC38\uC5EC");
  const notParticipated = eligible.filter((m) => m.performances?.[selectedPerf] !== "\uCC38\uC5EC");
  const pct = eligible.length > 0 ? Math.round(participated.length / eligible.length * 100) : 0;
  return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 16 } }, /* @__PURE__ */ React.createElement("div", { className: "segmented-control", style: { overflowX: "auto", whiteSpace: "nowrap", display: "flex" } }, performances.map((p) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: p.key,
      className: `segment-btn ${selectedPerf === p.key ? "active" : ""}`,
      onClick: () => setSelectedPerf(p.key)
    },
    p.label
  ))), perf && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "card card-pad" }, /* @__PURE__ */ React.createElement("div", { className: "flex-between", style: { marginBottom: 12 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 16, fontWeight: 800 } }, perf.label), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 22, fontWeight: 800, color: "var(--blue-500)" } }, pct, "%")), /* @__PURE__ */ React.createElement("div", { className: "progress-track" }, /* @__PURE__ */ React.createElement("div", { className: "progress-fill", style: { width: `${pct}%`, background: "var(--blue-500)" } })), /* @__PURE__ */ React.createElement("div", { className: "flex-between", style: { marginTop: 10, fontSize: 13, color: "var(--slate-500)" } }, /* @__PURE__ */ React.createElement("span", null, "\uB300\uC0C1 ", /* @__PURE__ */ React.createElement("strong", { style: { color: "var(--slate-700)" } }, eligible.length, "\uBA85")), /* @__PURE__ */ React.createElement("span", null, "\uCC38\uC5EC ", /* @__PURE__ */ React.createElement("strong", { style: { color: "var(--emerald-500)" } }, participated.length, "\uBA85")), /* @__PURE__ */ React.createElement("span", null, "\uBBF8\uCC38\uC5EC ", /* @__PURE__ */ React.createElement("strong", { style: { color: "var(--rose-500)" } }, notParticipated.length, "\uBA85")))), /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("div", { style: { padding: "10px 16px", background: "var(--emerald-50)", borderBottom: "1px solid #a7f3d0", display: "flex", justifyContent: "space-between", alignItems: "center" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 13, fontWeight: 700, color: "var(--emerald-600)" } }, "\u2713 \uCC38\uC5EC"), /* @__PURE__ */ React.createElement("span", { className: "badge badge-success" }, participated.length, "\uBA85")), participated.length === 0 ? /* @__PURE__ */ React.createElement("div", { style: { padding: "16px", textAlign: "center", fontSize: 13, color: "var(--slate-400)" } }, "\uCC38\uC5EC\uC790 \uC5C6\uC74C") : participated.map((m) => /* @__PURE__ */ React.createElement("div", { key: m.id, style: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 16px", borderBottom: "1px solid var(--slate-100)" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 14, fontWeight: 600 } }, m.name), m.status === "inactive" && /* @__PURE__ */ React.createElement("span", { className: "badge badge-gray" }, "\uD0C8\uD1F4")), /* @__PURE__ */ React.createElement("span", { className: `badge badge-${m.part.toLowerCase()}` }, m.part)))), /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("div", { style: { padding: "10px 16px", background: "var(--rose-50)", borderBottom: "1px solid #fca5a5", display: "flex", justifyContent: "space-between", alignItems: "center" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 13, fontWeight: 700, color: "var(--rose-600)" } }, "\u2717 \uBBF8\uCC38\uC5EC"), /* @__PURE__ */ React.createElement("span", { className: "badge badge-danger" }, notParticipated.length, "\uBA85")), notParticipated.length === 0 ? /* @__PURE__ */ React.createElement("div", { style: { padding: "16px", textAlign: "center", fontSize: 13, color: "var(--slate-400)" } }, "\uC804\uC6D0 \uCC38\uC5EC") : notParticipated.map((m) => /* @__PURE__ */ React.createElement("div", { key: m.id, style: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 16px", borderBottom: "1px solid var(--slate-100)" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 14, fontWeight: 600 } }, m.name), m.status === "inactive" && /* @__PURE__ */ React.createElement("span", { className: "badge badge-gray" }, "\uD0C8\uD1F4")), /* @__PURE__ */ React.createElement("span", { className: `badge badge-${m.part.toLowerCase()}` }, m.part))))));
}
export default function MembersPage() {
  const { state, dispatch } = useApp();
  const { isAdmin, requestLogin } = useAuth();
  const { members, performances } = state;
  const [partFilter, setPartFilter] = useState("\uC804\uCCB4");
  const [showInactive, setShowInactive] = useState(false);
  const [modal, setModal] = useState(null);
  const [showAddPerf, setShowAddPerf] = useState(false);
  const [view, setView] = useState("\uD68C\uC6D0 \uBAA9\uB85D");
  const togglePerformance = (e, member, perfKey) => {
    e.stopPropagation();
    if (!isAdmin) {
      requestLogin();
      return;
    }
    const current = member.performances?.[perfKey] === "\uCC38\uC5EC";
    dispatch({
      type: "UPDATE_MEMBER",
      member: { ...member, performances: { ...member.performances, [perfKey]: current ? "\uBBF8\uCC38\uC5EC" : "\uCC38\uC5EC" } }
    });
  };
  const handleSave = (member) => {
    if (members.find((m) => m.id === member.id)) dispatch({ type: "UPDATE_MEMBER", member });
    else dispatch({ type: "ADD_MEMBER", member });
    setModal(null);
  };
  const handleAddPerf = (perf) => {
    dispatch({ type: "ADD_PERFORMANCE", perf });
    setShowAddPerf(false);
  };
  const handleDeletePerf = (key) => {
    if (window.confirm(`"${fmtPerfLabel(key)}" \uACF5\uC5F0\uC744 \uC0AD\uC81C\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?`)) {
      dispatch({ type: "DELETE_PERFORMANCE", key });
    }
  };
  const filtered = sortByName(
    members.filter((m) => showInactive || m.status === "active").filter((m) => partFilter === "\uC804\uCCB4" || m.part === partFilter)
  );
  const grouped = {
    VOIX: filtered.filter((m) => m.part === "VOIX"),
    DANCE: filtered.filter((m) => m.part === "DANCE"),
    SESSION: filtered.filter((m) => m.part === "SESSION")
  };
  const counts = {
    total: members.filter((m) => m.status === "active").length,
    VOIX: members.filter((m) => m.status === "active" && m.part === "VOIX").length,
    DANCE: members.filter((m) => m.status === "active" && m.part === "DANCE").length,
    SESSION: members.filter((m) => m.status === "active" && m.part === "SESSION").length
  };
  return /* @__PURE__ */ React.createElement("div", { className: "page fade-in" }, /* @__PURE__ */ React.createElement("div", { className: "card card-pad" }, /* @__PURE__ */ React.createElement("div", { className: "flex-between", style: { marginBottom: 14 } }, /* @__PURE__ */ React.createElement("span", { className: "card-title", style: { margin: 0 } }, "\uC778\uC6D0 \uD604\uD669"), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 22, fontWeight: 800, color: "var(--blue-500)" } }, counts.total, "\uBA85")), /* @__PURE__ */ React.createElement("div", { className: "member-count-row" }, /* @__PURE__ */ React.createElement("div", { className: "member-count-chip", style: { background: "var(--voix-bg)", color: "var(--voix-color)" } }, "VOIX ", /* @__PURE__ */ React.createElement("strong", null, counts.VOIX)), /* @__PURE__ */ React.createElement("div", { className: "member-count-chip", style: { background: "var(--dance-bg)", color: "var(--dance-color)" } }, "DANCE ", /* @__PURE__ */ React.createElement("strong", null, counts.DANCE)), /* @__PURE__ */ React.createElement("div", { className: "member-count-chip", style: { background: "var(--session-bg)", color: "var(--session-color)" } }, "SESSION ", /* @__PURE__ */ React.createElement("strong", null, counts.SESSION)))), /* @__PURE__ */ React.createElement("div", { className: "card card-pad", style: { paddingBottom: 14 } }, /* @__PURE__ */ React.createElement("div", { className: "flex-between", style: { marginBottom: 10 } }, /* @__PURE__ */ React.createElement("span", { className: "card-title", style: { margin: 0 } }, "\uACF5\uC5F0 \uC77C\uC815"), isAdmin && /* @__PURE__ */ React.createElement("button", { className: "btn-sm", onClick: () => setShowAddPerf(true) }, "+ \uACF5\uC5F0 \uCD94\uAC00")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 8 } }, performances.length === 0 && /* @__PURE__ */ React.createElement("span", { className: "text-muted" }, "\uB4F1\uB85D\uB41C \uACF5\uC5F0\uC774 \uC5C6\uC2B5\uB2C8\uB2E4"), performances.map((p) => /* @__PURE__ */ React.createElement("div", { key: p.key, style: { display: "flex", alignItems: "center", gap: 4, background: "var(--slate-100)", borderRadius: 99, padding: "4px 10px 4px 14px" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 13, fontWeight: 600 } }, p.label), isAdmin && /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => handleDeletePerf(p.key),
      style: { background: "none", border: "none", color: "var(--slate-400)", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "0 2px" }
    },
    "\xD7"
  ))))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6, marginBottom: 4 } }, /* @__PURE__ */ React.createElement("div", { className: "segmented-control" }, VIEWS.map((v) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: v,
      className: `segment-btn ${view === v ? "active" : ""}`,
      onClick: () => setView(v)
    },
    v
  )))), view === "\uD68C\uC6D0 \uBAA9\uB85D" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "flex-between" }, /* @__PURE__ */ React.createElement("div", { className: "filter-row" }, PARTS.map((p) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: p,
      className: `filter-chip ${partFilter === p ? "active" : ""}`,
      onClick: () => setPartFilter(p)
    },
    p
  )), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: `filter-chip ${showInactive ? "active" : ""}`,
      onClick: () => setShowInactive((v) => !v)
    },
    "\uD0C8\uD1F4 \uD3EC\uD568"
  )), isAdmin && /* @__PURE__ */ React.createElement("button", { className: "btn-sm", onClick: () => setModal("add") }, "+ \uCD94\uAC00")), Object.entries(grouped).map(([part, list]) => list.length > 0 && /* @__PURE__ */ React.createElement("div", { key: part, className: "card", style: { overflowX: "auto" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", padding: "10px 16px", background: "var(--slate-50)", borderBottom: "1px solid var(--slate-100)", minWidth: "max-content" } }, /* @__PURE__ */ React.createElement("div", { style: { width: 130, flexShrink: 0 } }, /* @__PURE__ */ React.createElement("span", { className: `badge badge-${part.toLowerCase()}` }, part), /* @__PURE__ */ React.createElement("span", { className: "text-muted", style: { fontSize: 12, marginLeft: 6 } }, list.length, "\uBA85")), /* @__PURE__ */ React.createElement("div", { style: { width: 80, flexShrink: 0, fontSize: 11, fontWeight: 700, color: "var(--slate-500)", textAlign: "center", letterSpacing: ".2px" } }, "\uAC00\uC785\uC77C"), performances.map((p) => /* @__PURE__ */ React.createElement("div", { key: p.key, style: { width: 72, flexShrink: 0, fontSize: 11, fontWeight: 700, color: "var(--slate-500)", textAlign: "center" } }, p.label)), /* @__PURE__ */ React.createElement("div", { style: { width: 40, flexShrink: 0 } })), list.map((m) => /* @__PURE__ */ React.createElement(
    "div",
    {
      key: m.id,
      style: { display: "flex", alignItems: "center", padding: "11px 16px", borderBottom: "1px solid var(--slate-100)", minWidth: "max-content", transition: "background .12s" },
      onMouseEnter: (e) => e.currentTarget.style.background = "var(--slate-50)",
      onMouseLeave: (e) => e.currentTarget.style.background = ""
    },
    /* @__PURE__ */ React.createElement("div", { style: { width: 130, flexShrink: 0, display: "flex", alignItems: "center", gap: 6 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 14, fontWeight: 600 } }, m.name), m.status === "inactive" && /* @__PURE__ */ React.createElement("span", { className: "badge badge-gray" }, "\uD0C8\uD1F4")),
    /* @__PURE__ */ React.createElement("div", { style: { width: 80, flexShrink: 0, fontSize: 12, color: "var(--slate-500)", textAlign: "center" } }, m.joinDate?.replace(/-/g, ".")),
    performances.map((p) => {
      const joinMonth = m.joinDate?.slice(0, 7) ?? "9999-99";
      const joinedAfter = joinMonth > p.key;
      const participated = m.performances?.[p.key] === "\uCC38\uC5EC";
      return /* @__PURE__ */ React.createElement("div", { key: p.key, style: { width: 72, flexShrink: 0, textAlign: "center" } }, joinedAfter ? /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "var(--slate-300)", fontWeight: 500 } }, "\u2014") : /* @__PURE__ */ React.createElement(
        "button",
        {
          onClick: (e) => togglePerformance(e, m, p.key),
          style: {
            padding: "3px 8px",
            borderRadius: 99,
            fontSize: 11,
            fontWeight: 700,
            border: "none",
            cursor: isAdmin ? "pointer" : "default",
            background: participated ? "var(--emerald-50)" : "var(--rose-50)",
            color: participated ? "var(--emerald-600)" : "var(--rose-400)",
            transition: "all .15s",
            minWidth: 44
          }
        },
        participated ? "\uCC38\uC5EC" : "\uBBF8\uCC38\uC5EC"
      ));
    }),
    /* @__PURE__ */ React.createElement("div", { style: { width: 40, flexShrink: 0, textAlign: "right" } }, isAdmin && /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: (e) => {
          e.stopPropagation();
          setModal(m);
        },
        style: { background: "none", border: "none", color: "var(--slate-400)", cursor: "pointer", fontSize: 16, lineHeight: 1 }
      },
      "\u270E"
    ))
  ))))), view === "\uACF5\uC5F0\uBCC4 \uD604\uD669" && /* @__PURE__ */ React.createElement(PerfView, { performances, members: members.filter((m) => showInactive || m.status === "active") }), modal && /* @__PURE__ */ React.createElement(
    MemberFormModal,
    {
      member: modal === "add" ? null : modal,
      performances,
      onSave: handleSave,
      onClose: () => setModal(null)
    }
  ), showAddPerf && /* @__PURE__ */ React.createElement(
    AddPerfModal,
    {
      existing: performances,
      onSave: handleAddPerf,
      onClose: () => setShowAddPerf(false)
    }
  ));
}
