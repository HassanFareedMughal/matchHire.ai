import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Activity,
  ArrowUpRight,
  BriefcaseBusiness,
  Check,
  Clipboard,
  ChevronRight,
  Download,
  FileText,
  Heart,
  Info,
  LayoutDashboard,
  LogIn,
  LogOut,
  MapPin,
  Menu,
  Moon,
  Search,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  UserRound,
  X,
  Eye,
  EyeOff,
  Upload,
} from "lucide-react";
import "./App.css";

const API = "http://localhost:5000/api";
const nav = [
  ["dashboard", "Overview", LayoutDashboard],
  ["find", "Find jobs", Search],
  ["saved", "Saved jobs", Heart],
  ["applied", "Applied jobs", Check],
  ["documents", "Resume & cover letter", FileText],
  ["settings", "Profile & settings", Settings],
];
function Button({ children, variant = "primary", icon: Icon, ...props }) {
  const isTourHost =
    children === "Find jobs" || children === "Find matching jobs";
  const [stage, setStage] = useState(() =>
    isTourHost &&
    localStorage.getItem("mh_token") &&
    !localStorage.getItem("mh_onboarding_done")
      ? localStorage.getItem("mh_onboarding_stage") ||
        (children === "Find jobs" ? "welcome" : null)
      : null,
  );
  const [stepIndex, setStepIndex] = useState(() =>
    Number(localStorage.getItem("mh_onboarding_step") || 0),
  );
  const navigate = (target) => {
    const label = target === "find" ? "Find jobs" : "Overview";
    [...document.querySelectorAll("nav button")]
      .find((button) => button.textContent.includes(label))
      ?.click();
  };
  return (
    <>
      {
        <button className={`button button-${variant}`} {...props}>
          {Icon && React.createElement(Icon, { size: 16 })}
          {children}
        </button>
      }
      {isTourHost && (
        <Onboarding
          stage={stage}
          stepIndex={stepIndex}
          setStage={setStage}
          setStepIndex={setStepIndex}
          setPage={navigate}
        />
      )}
    </>
  );
}
function Stat({ label, value, icon: Icon, tone = "blue" }) {
  return (
    <div className="stat-card">
      <span className={`stat-icon ${tone}`}>
        {React.createElement(Icon, { size: 18 })}
      </span>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}
function AuthDialog({ mode, setMode, onClose, onSubmit, loading, error }) {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [visible, setVisible] = useState(false);
  const change = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="auth-dialog">
        <button
          className="icon-button close"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={18} />
        </button>
        <div className="auth-heading">
          <span className="brand-mark small">
            <Sparkles size={17} />
          </span>
          <p className="eyebrow">Welcome to MatchHire</p>
          <h2>
            {mode === "login"
              ? "Find work that fits."
              : "Build your next move."}
          </h2>
          <p>Sign in to continue to your workspace.</p>
        </div>
        {error && (
          <div className="alert error">
            <Info size={16} />
            {error}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(
              mode === "login"
                ? { email: form.email, password: form.password }
                : form,
            );
          }}
        >
          {mode === "register" && (
            <label>
              Full name
              <input
                value={form.name}
                onChange={change("name")}
                required
                minLength="2"
              />
            </label>
          )}
          <label>
            Email address
            <input
              type="email"
              value={form.email}
              onChange={change("email")}
              required
            />
          </label>
          <label>
            Password
            <div className="password-input">
              <input
                type={visible ? "text" : "password"}
                value={form.password}
                onChange={change("password")}
                required
                minLength="8"
              />
              <button
                type="button"
                onClick={() => setVisible(!visible)}
                aria-label="Toggle password visibility"
              >
                {visible ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>
          <Button type="submit" disabled={loading}>
            {loading
              ? "Please wait..."
              : mode === "login"
                ? "Sign in"
                : "Create account"}
          </Button>
        </form>
        <div className="auth-divider">
          <span>or continue with</span>
        </div>
        <div id={`google-button-${mode}`} className="google-button" />
        <p className="switch-auth">
          {mode === "login" ? "New to MatchHire?" : "Already have an account?"}{" "}
          <button
            onClick={() => setMode(mode === "login" ? "register" : "login")}
          >
            {mode === "login" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
function Breakdown({ job, open, toggle }) {
  const b = job.score_breakdown;
  if (!b) return null;
  const rows = [
    ["Skill recall", b.skill_recall],
    ["Semantic match", b.tfidf_semantic],
    ["Placement bonus", b.position_bonus],
    ["Extra skills", b.extra_skills],
  ];
  return (
    <div className="breakdown">
      <button className="text-button" onClick={toggle}>
        {open ? "Hide match breakdown" : "Why this matches"}{" "}
        <ChevronRight size={15} />
      </button>
      {open && (
        <div className="breakdown-content">
          {rows.map(([label, value]) => (
            <div className="bar-row" key={label}>
              <div>
                <span>{label}</span>
                <b>{Math.round((value || 0) * 100)}%</b>
              </div>
              <div className="bar">
                <i style={{ width: `${Math.round((value || 0) * 100)}%` }} />
              </div>
            </div>
          ))}
          <div className="chips">
            {(b.matched_skills || []).map((skill) => (
              <span className="chip success-chip" key={skill}>
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
function JobCard({ job, open, toggle }) {
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const baseline = Math.round(
    Number(job.score ?? job.matchScore ?? job.baseline_score ?? 0) * 100,
  );
  const hybrid =
    job.improved_score == null ? null : Math.round(Number(job.improved_score));
  useEffect(() => {
    if (!job.jobId) return;
    axios
      .get(`${API}/favorites`)
      .then((response) =>
        setSaved(
          response.data.favorites.some(
            (favorite) => favorite.jobId === String(job.jobId),
          ),
        ),
      )
      .catch(() => {});
  }, [job.jobId]);
  const toggleFavorite = async () => {
    if (!job.jobId || busy) return;
    setBusy(true);
    try {
      if (saved) {
        await axios.delete(`${API}/favorites/${encodeURIComponent(job.jobId)}`);
        setSaved(false);
      } else {
        await axios.post(`${API}/favorites`, {
          jobId: job.jobId,
          title: job.title || job.job_title,
          company: job.company || job.company_name,
          location: job.location,
          applyLink: job.applyLink || job.apply_link || job.job_apply_link,
          score: job.score,
          baseline_score: job.baseline_score,
          improved_score: job.improved_score,
          score_breakdown: job.score_breakdown,
        });
        setSaved(true);
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className="job-card">
      <div className="job-card-top">
        <span className="company-logo">
          <BriefcaseBusiness size={18} />
        </span>
        <div className="job-title">
          <h3>{job.title || job.job_title || "Untitled role"}</h3>
          <p>
            {job.company || job.company_name || "Company"} <span>·</span>{" "}
            {job.location || "Location not listed"}
          </p>
        </div>
        <button
          className={`icon-button save-button ${saved ? "saved" : ""}`}
          aria-label={saved ? "Remove saved job" : "Save job"}
          aria-pressed={saved}
          disabled={busy || !job.jobId}
          onClick={toggleFavorite}
        >
          <Heart size={18} fill={saved ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="score-row">
        <div className="score-primary">
          <strong>{hybrid == null ? baseline : hybrid}%</strong>
          <span>FYP-II hybrid match</span>
        </div>
        {hybrid != null && (
          <div className="score-secondary">
            Baseline <b>{baseline}%</b>
          </div>
        )}
        <a
          className="apply-link"
          href={job.applyLink || job.apply_link || job.job_apply_link || "#"}
          target="_blank"
          rel="noreferrer"
        >
          Apply now <ArrowUpRight size={15} />
        </a>
      </div>
      <Breakdown job={job} open={open} toggle={toggle} />
    </article>
  );
}
function Empty({ icon: Icon, title, text, setPage }) {
  const isFavorites = title === "Saved jobs";
  const [favorites, setFavorites] = useState(null);
  useEffect(() => {
    if (isFavorites)
      axios
        .get(`${API}/favorites`)
        .then((response) => setFavorites(response.data.favorites || []))
        .catch(() => setFavorites([]));
  }, [isFavorites]);
  if (isFavorites && favorites?.length)
    return (
      <div>
        <div className="page-heading">
          <div>
            <p className="eyebrow">Your collection</p>
            <h1>Saved jobs</h1>
            <p>Keep the opportunities worth another look close at hand.</p>
          </div>
        </div>
        <div className="favorite-list">
          {favorites.map((job) => (
            <JobCard key={job.jobId} job={job} open={false} toggle={() => {}} />
          ))}
        </div>
      </div>
    );
  return (
    <div className="center-empty">
      <span className="empty-icon">
        {React.createElement(Icon, { size: 23 })}
      </span>
      <p className="eyebrow">Workspace</p>
      <h1>{title}</h1>
      <p>
        {isFavorites && favorites === null
          ? "Loading your saved jobs..."
          : text}
      </p>
      <Button variant="secondary" icon={Search} onClick={() => setPage("find")}>
        Find jobs
      </Button>
    </div>
  );
}
function Loading() {
  return (
    <div className="loading-state">
      <span className="loader">
        <Sparkles size={21} />
      </span>
      <p className="eyebrow">Working on your shortlist</p>
      <h2>Finding the signal in your experience.</h2>
      <div className="loading-steps">
        <span className="done">
          <Check size={14} /> Resume received
        </span>
        <span className="active">
          <Activity size={14} /> Matching skills and roles
        </span>
        <span>
          <Search size={14} /> Ranking opportunities
        </span>
      </div>
    </div>
  );
}
const tourSteps = [
  {
    target: ".page-heading",
    page: "dashboard",
    title: "Your workspace at a glance",
    text: "Start here for your search health, recent matches, and the next useful action.",
  },
  {
    target: ".sidebar nav",
    page: "dashboard",
    title: "Move through MatchHire",
    text: "Use the sidebar to move between your overview, job search, documents, and settings.",
  },
  {
    target: ".form-panel .upload-zone",
    page: "find",
    title: "Bring your resume",
    text: "Upload a PDF or paste your resume text. MatchHire uses it as the source for every recommendation.",
  },
  {
    target: ".form-panel .two-fields",
    page: "find",
    title: "Set your search",
    text: "Add a role and location so the matching service can focus the opportunity set.",
  },
  {
    target: ".results-panel",
    page: "find",
    title: "Understand every match",
    text: "Your real results show hybrid and baseline scores, apply links, and an explainable breakdown.",
  },
  {
    target: ".top-actions",
    page: "dashboard",
    title: "Make it yours",
    text: "Switch between light and dark mode any time. Your preference is saved on this device.",
  },
];
function Onboarding({ stage, stepIndex, setStage, setStepIndex, setPage }) {
  const [spotlight, setSpotlight] = useState(null);
  const isWelcome = stage === "welcome";
  useEffect(() => {
    if (stage !== "tour") return;
    const step = tourSteps[stepIndex];
    setPage(step.page);
  }, [stage, stepIndex, setPage]);
  useEffect(() => {
    if (stage !== "tour") return;
    let frame;
    const locate = () => {
      const node = document.querySelector(tourSteps[stepIndex].target);
      if (!node) {
        setSpotlight(null);
        return;
      }
      const rect = node.getBoundingClientRect();
      setSpotlight({
        top: rect.top - 8,
        left: rect.left - 8,
        width: rect.width + 16,
        height: rect.height + 16,
      });
    };
    frame = requestAnimationFrame(locate);
    window.addEventListener("resize", locate);
    window.addEventListener("scroll", locate, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", locate);
      window.removeEventListener("scroll", locate, true);
    };
  }, [stage, stepIndex]);
  const finish = () => {
    localStorage.setItem("mh_onboarding_done", "true");
    localStorage.removeItem("mh_onboarding_stage");
    localStorage.removeItem("mh_onboarding_step");
    setStage(null);
  };
  useEffect(() => {
    if (
      stage === "welcome" &&
      localStorage.getItem("mh_onboarding_stage") === "tour"
    ) {
      localStorage.setItem("mh_onboarding_done", "true");
      localStorage.removeItem("mh_onboarding_stage");
      localStorage.removeItem("mh_onboarding_step");
      setStage(null);
      return;
    }
    if (stage) {
      localStorage.setItem("mh_onboarding_stage", stage);
      localStorage.setItem("mh_onboarding_step", String(stepIndex));
    }
  }, [stage, stepIndex, setStage]);
  if (!stage) return null;
  if (isWelcome)
    return (
      <div className="tour-backdrop">
        <section
          className="tour-welcome"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tour-title"
        >
          <span className="tour-icon">
            <Sparkles size={22} />
          </span>
          <p className="eyebrow">A quick orientation</p>
          <h2 id="tour-title">Welcome to your job search workspace.</h2>
          <p>
            Take a short tour of the tools that turn your resume into a focused
            shortlist.
          </p>
          <div className="tour-actions">
            <Button variant="secondary" onClick={finish}>
              Skip for now
            </Button>
            <Button onClick={() => setStage("tour")} icon={ArrowUpRight}>
              Take a tour
            </Button>
          </div>
        </section>
      </div>
    );
  const step = tourSteps[stepIndex];
  const last = stepIndex === tourSteps.length - 1;
  return (
    <div
      className="tour-layer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-step-title"
    >
      <div className="tour-dim" />
      {spotlight && <div className="tour-spotlight" style={spotlight} />}
      <section className={`tour-card ${spotlight ? "anchored" : ""}`}>
        <div className="tour-card-head">
          <span>Product tour</span>
          <strong>
            {stepIndex + 1} / {tourSteps.length}
          </strong>
        </div>
        <p className="eyebrow">
          {step.page === "find" ? "Find jobs" : "Workspace"}
        </p>
        <h2 id="tour-step-title">{step.title}</h2>
        <p>{step.text}</p>
        <div className="tour-progress">
          <i
            style={{ width: `${((stepIndex + 1) / tourSteps.length) * 100}%` }}
          />
        </div>
        <div className="tour-actions">
          <button className="text-button" onClick={() => setStage("welcome")}>
            Skip
          </button>
          <span className="tour-spacer" />
          {stepIndex > 0 && (
            <Button
              variant="secondary"
              onClick={() => setStepIndex(stepIndex - 1)}
            >
              Back
            </Button>
          )}
          <Button onClick={last ? finish : () => setStepIndex(stepIndex + 1)}>
            {last ? "Finish" : "Next"}
          </Button>
        </div>
      </section>
    </div>
  );
}

function Dashboard({ user, setPage, results }) {
  const [stage, setStage] = useState(null);
  const [stepIndex, setStepIndex] = useState(0);
  useEffect(() => {
    if (!user || localStorage.getItem("mh_onboarding_done")) return undefined;
    const timer = setTimeout(() => {
      setStage("welcome");
      setStepIndex(0);
    }, 0);
    return () => clearTimeout(timer);
  }, [user]);
  return (
    <>
      <Onboarding
        stage={stage}
        stepIndex={stepIndex}
        setStage={setStage}
        setStepIndex={setStepIndex}
        setPage={setPage}
      />
      <DashboardContent user={user} setPage={setPage} results={results} />
    </>
  );
}
export default function App() {
  const [theme, setTheme] = useState(
    localStorage.getItem("mh_theme") || "light",
  );
  const [page, setPage] = useState("dashboard");
  const [mobile, setMobile] = useState(false);
  const [authMode, setAuthMode] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("mh_token"));
  const [user, setUser] = useState(
    JSON.parse(localStorage.getItem("mh_user") || "null"),
  );
  const [form, setForm] = useState({ resume: "", keyword: "", location: "" });
  const [fileName, setFileName] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState({});
  const [sort, setSort] = useState("hybrid");
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("mh_theme", theme);
  }, [theme]);
  useEffect(() => {
    if (token) axios.defaults.headers.common.Authorization = `Bearer ${token}`;
    else delete axios.defaults.headers.common.Authorization;
  }, [token]);
  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId || document.getElementById("google-identity")) return;
    const script = document.createElement("script");
    script.id = "google-identity";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (!window.google?.accounts) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response) => {
          setAuthLoading(true);
          setAuthError(null);
          try {
            const result = await axios.post(`${API}/auth/google`, {
              credential: response.credential,
            });
            setToken(result.data.token);
            setUser(result.data.user);
            localStorage.setItem("mh_token", result.data.token);
            localStorage.setItem("mh_user", JSON.stringify(result.data.user));
            setAuthMode(null);
          } catch (e) {
            setAuthError(e.response?.data?.message || "Google sign-in failed");
          } finally {
            setAuthLoading(false);
          }
        },
      });
    };
    document.head.appendChild(script);
  }, []);
  useEffect(() => {
    if (!authMode || !window.google?.accounts) return;
    const id = `google-button-${authMode}`;
    const node = document.getElementById(id);
    if (node) {
      node.replaceChildren();
      window.google.accounts.id.renderButton(node, {
        theme: theme === "dark" ? "filled_black" : "outline",
        size: "large",
        width: 340,
        text: authMode === "login" ? "signin_with" : "signup_with",
      });
    }
  }, [authMode, theme]);
  const auth = async (path, data) => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const response = await axios.post(`${API}/auth/${path}`, data);
      setToken(response.data.token);
      setUser(response.data.user);
      localStorage.setItem("mh_token", response.data.token);
      localStorage.setItem("mh_user", JSON.stringify(response.data.user));
      setAuthMode(null);
    } catch (e) {
      setAuthError(e.response?.data?.message || `${path} failed`);
    } finally {
      setAuthLoading(false);
    }
  };
  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("mh_token");
    localStorage.removeItem("mh_user");
    setPage("dashboard");
  };
  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      setError("Please upload a PDF resume.");
      return;
    }
    setUploading(true);
    setError(null);
    setFileName(file.name);
    const body = new FormData();
    body.append("resume", file);
    try {
      const response = await axios.post(`${API}/upload-resume`, body);
      setForm((v) => ({ ...v, resume: response.data.text || "" }));
    } catch (err) {
      setFileName("");
      setError(err.response?.data?.message || "Resume extraction failed.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };
  const find = async () => {
    if (!token) {
      setAuthMode("login");
      return;
    }
    if (!form.resume.trim() || !form.keyword.trim() || !form.location.trim()) {
      setError("Add a resume, role, and location to find relevant jobs.");
      return;
    }
    setLoading(true);
    setError(null);
    setResults([]);
    setPage("find");
    try {
      const response = await axios.post(`${API}/match`, form);
      setResults(response.data.matches || response.data || []);
    } catch (e) {
      setError(
        e.response?.data?.error ||
          e.response?.data?.message ||
          "Matching failed. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };
  const sorted = useMemo(
    () =>
      [...results].sort(
        (a, b) =>
          Number(b[sort === "hybrid" ? "improved_score" : "score"] ?? 0) -
          Number(a[sort === "hybrid" ? "improved_score" : "score"] ?? 0),
      ),
    [results, sort],
  );
  const currentTitle = nav.find((item) => item[0] === page)?.[1] || "Overview";
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <div className="sidebar-top">
          <button className="brand" onClick={() => setPage("dashboard")}>
            <span className="brand-mark">
              <Sparkles size={18} />
            </span>
            match<span>Hire</span>
          </button>
          <button
            className="icon-button mobile-close"
            onClick={() => setMobile(false)}
          >
            <X size={18} />
          </button>
        </div>
        <p className="workspace-label">WORKSPACE</p>
        <nav>
          {nav.map(([id, label, Icon]) => (
            <button
              className={page === id ? "active" : ""}
              key={id}
              onClick={() => {
                setPage(id);
                setMobile(false);
              }}
            >
              {React.createElement(Icon, { size: 17 })}
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          {user ? (
            <button className="user-row" onClick={() => setPage("settings")}>
              <span className="avatar">
                {(user.name || user.email || "U")[0].toUpperCase()}
              </span>
              <span className="user-copy">
                <strong>{user.name || "Your account"}</strong>
                <small>{user.email || "Member"}</small>
              </span>
            </button>
          ) : (
            <Button
              variant="soft"
              icon={LogIn}
              onClick={() => setAuthMode("login")}
            >
              Sign in
            </Button>
          )}
        </div>
      </aside>
      {mobile && (
        <div className="mobile-scrim" onClick={() => setMobile(false)} />
      )}
      <main className="main">
        <header className="topbar">
          <button
            className="icon-button menu-button"
            onClick={() => setMobile(true)}
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumbs">
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{currentTitle}</strong>
          </div>
          <div className="top-actions">
            <button
              className="icon-button"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              aria-label="Toggle theme"
            >
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            {user ? (
              <button
                className="profile-pill"
                onClick={() => setPage("settings")}
              >
                <span className="avatar">
                  {(user.name || user.email || "U")[0].toUpperCase()}
                </span>
                {user.name || "Account"}
              </button>
            ) : (
              <Button variant="soft" onClick={() => setAuthMode("login")}>
                Sign in
              </Button>
            )}
          </div>
        </header>
        <div className="content">
          {!user && (
            <section className="welcome-banner">
              <div>
                <p className="eyebrow">A better way to search</p>
                <h1>Find work with a little more signal.</h1>
                <p>
                  Match your experience to opportunities using your actual
                  resume, not a generic profile.
                </p>
              </div>
              <span className="banner-orbit">
                <Sparkles size={25} />
              </span>
            </section>
          )}
          {page === "dashboard" && (
            <DashboardContent user={user} setPage={setPage} results={results} />
          )}
          {page === "find" && (
            <Find
              form={form}
              setForm={setForm}
              upload={upload}
              fileName={fileName}
              uploading={uploading}
              loading={loading}
              error={error}
              setError={setError}
              find={find}
              results={sorted}
              sort={sort}
              setSort={setSort}
              open={open}
              setOpen={setOpen}
            />
          )}
          {page === "saved" && (
            <Empty
              icon={Heart}
              title="Saved jobs"
              text="Jobs you save will be collected here for easy comparison."
              setPage={setPage}
            />
          )}
          {page === "applied" && (
            <Empty
              icon={Check}
              title="Applied jobs"
              text="Applied job records will appear here when the backend exposes them."
              setPage={setPage}
            />
          )}
          {page === "documents" && (
            <CoverLetterDocuments setPage={setPage} setAuthMode={setAuthMode} results={sorted} />
          )}
          {page === "settings" && (
            <SettingsPage
              user={user}
              setUser={setUser}
              theme={theme}
              setTheme={setTheme}
              logout={logout}
            />
          )}
        </div>
      </main>
      {authMode && (
        <AuthDialog
          mode={authMode}
          setMode={setAuthMode}
          onClose={() => setAuthMode(null)}
          onSubmit={(data) => auth(authMode, data)}
          loading={authLoading}
          error={authError}
        />
      )}
    </div>
  );
}
function DashboardContent({ user, setPage, results }) {
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            {user
              ? `Good to see you, ${user.name?.split(" ")[0] || "there"}`
              : "Your workspace"}
          </p>
          <h1>Ready for your next opportunity?</h1>
          <p>
            Keep your search focused and let MatchHire surface the strongest
            fits.
          </p>
        </div>
        <Button icon={Search} onClick={() => setPage("find")}>
          Find jobs
        </Button>
      </div>
      <div className="stats-grid">
        <Stat
          icon={BriefcaseBusiness}
          label="Jobs matched"
          value={results.length || "—"}
        />
        <Stat icon={Heart} label="Saved jobs" value="—" tone="rose" />
        <Stat icon={Activity} label="Applications" value="—" tone="green" />
        <Stat icon={Sparkles} label="Average match" value="—" tone="amber" />
      </div>
      <div className="dashboard-grid">
        <section className="panel focus-panel">
          <div className="section-head">
            <div>
              <p className="eyebrow">Get started</p>
              <h2>Turn your resume into momentum.</h2>
            </div>
            <Sparkles className="muted-icon" size={22} />
          </div>
          <p>
            Upload your latest resume, tell us what role you want, and get a
            ranked shortlist with explainable matching.
          </p>
          <Button variant="secondary" onClick={() => setPage("find")}>
            Set up your search
          </Button>
        </section>
        <section className="panel">
          <div className="section-head">
            <div>
              <p className="eyebrow">Profile health</p>
              <h2>Resume status</h2>
            </div>
            <ShieldCheck className="success" size={21} />
          </div>
          <div className="status-line">
            <span className="status-dot" />
            <strong>
              {user ? "Ready to personalize" : "Sign in to get started"}
            </strong>
          </div>
          <p className="muted">
            Your resume powers every match. Keep it current for better
            recommendations.
          </p>
          <button className="text-button" onClick={() => setPage("find")}>
            Review resume <ArrowUpRight size={15} />
          </button>
        </section>
      </div>
    </>
  );
}
function Find({
  form,
  setForm,
  upload,
  fileName,
  uploading,
  loading,
  error,
  setError,
  find,
  results,
  sort,
  setSort,
  open,
  setOpen,
}) {
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Match engine</p>
          <h1>Find jobs that fit your story.</h1>
          <p>Use your resume and preferences to create a focused shortlist.</p>
        </div>
      </div>
      {error && (
        <div className="alert error">
          <Info size={16} />
          {error}
          <button onClick={() => setError(null)}>
            <X size={15} />
          </button>
        </div>
      )}
      <div className="find-grid">
        <section className="panel form-panel">
          <div className="section-head">
            <div>
              <h2>Your search</h2>
              <p>We use this information to rank real opportunities.</p>
            </div>
            <span className="step-label">01 / 02</span>
          </div>
          <label>
            Resume / CV
            <div className={`upload-zone ${fileName ? "uploaded" : ""}`}>
              <input
                type="file"
                accept=".pdf,application/pdf"
                onChange={upload}
                disabled={uploading || loading}
              />
              <FileText size={24} />
              <strong>
                {uploading
                  ? "Extracting resume text..."
                  : fileName || "Upload a PDF resume"}
              </strong>
              <span>
                {fileName ? "Resume loaded successfully" : "PDF files only"}
              </span>
            </div>
          </label>
          <label>
            Extracted content
            <textarea
              rows="6"
              value={form.resume}
              onChange={(e) => setForm({ ...form, resume: e.target.value })}
              placeholder="Upload a PDF or paste your resume text here..."
              disabled={uploading || loading}
            />
          </label>
          <div className="form-divider" />
          <div className="section-head compact">
            <div>
              <h2>Job preferences</h2>
              <p>Tell us where you want to make an impact.</p>
            </div>
            <span className="step-label">02 / 02</span>
          </div>
          <div className="two-fields">
            <label>
              Role or keyword
              <input
                value={form.keyword}
                onChange={(e) => setForm({ ...form, keyword: e.target.value })}
                placeholder="e.g. Product Designer"
              />
            </label>
            <label>
              Location
              <input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="e.g. Remote or New York"
              />
            </label>
          </div>
          <Button icon={Search} onClick={find} disabled={loading || uploading}>
            {loading ? "Finding matches..." : "Find matching jobs"}
          </Button>
        </section>
        <section className="results-panel">
          {loading ? (
            <Loading />
          ) : results.length ? (
            <>
              <div className="section-head results-head">
                <div>
                  <p className="eyebrow">Ranked for you</p>
                  <h2>{results.length} opportunities found</h2>
                </div>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  aria-label="Sort results"
                >
                  <option value="hybrid">Best hybrid score</option>
                  <option value="baseline">Baseline score</option>
                </select>
              </div>
              <div className="job-list">
                {results.map((job, i) => (
                  <JobCard
                    key={i}
                    job={job}
                    open={!!open[i]}
                    toggle={() => setOpen((v) => ({ ...v, [i]: !v[i] }))}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="empty-result">
              <span className="empty-icon">
                <Search size={21} />
              </span>
              <h2>Your shortlist will appear here</h2>
              <p>
                Complete the search form to see matches with skills, scores, and
                explainable recommendations.
              </p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
function SettingsPage({ user, setUser, theme, setTheme, logout }) {
  const [name, setName] = useState(user?.name || "");
  const [saving, setSaving] = useState(false);
  const [profileError, setProfileError] = useState(null);
  const [savedMessage, setSavedMessage] = useState(null);
  useEffect(() => {
    axios.get(`${API}/profile`).then((response) => {
      setUser(response.data.user);
      setName(response.data.user.name || "");
      localStorage.setItem("mh_user", JSON.stringify(response.data.user));
    }).catch((error) => setProfileError(error.response?.data?.message || "Failed to load profile."));
  }, [setUser]);
  const saveProfile = async (event) => {
    event.preventDefault();
    if (name.trim().length < 2 || name.trim().length > 100) {
      setProfileError("Name must be between 2 and 100 characters.");
      setSavedMessage(null);
      return;
    }
    setSaving(true);
    setProfileError(null);
    setSavedMessage(null);
    try {
      const response = await axios.put(`${API}/profile`, { name: name.trim() });
      setUser(response.data.user);
      localStorage.setItem("mh_user", JSON.stringify(response.data.user));
      setName(response.data.user.name);
      setSavedMessage("Profile saved");
    } catch (error) {
      setProfileError(error.response?.data?.message || "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Workspace preferences</p>
          <h1>Profile & settings</h1>
          <p>Manage your account and how MatchHire feels to use.</p>
        </div>
      </div>
      <div className="settings-grid">
        <section className="panel">
          <div className="section-head">
            <div>
              <h2>Account</h2>
              <p>Your MatchHire identity.</p>
            </div>
            <UserRound size={20} className="muted-icon" />
          </div>
          <div className="account-card">
            <span className="avatar large">
              {(user?.name || user?.email || "U")[0].toUpperCase()}
            </span>
            <div>
              <strong>{user?.name || "Guest user"}</strong>
              <p>{user?.email || "Sign in to connect your account"}</p>
            </div>
          </div>
          {profileError && <div className="alert error"><Info size={16} />{profileError}</div>}
          <form className="profile-form" onSubmit={saveProfile}>
            <label>Full name<input value={name} onChange={(event) => setName(event.target.value)} minLength="2" maxLength="100" required /></label>
            <label>Email address<input value={user?.email || ""} disabled readOnly /></label>
            <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save profile"}</Button>
            {savedMessage && <span className="save-confirmation"><Check size={14} />{savedMessage}</span>}
          </form>
          <div className="setting-row">
            <div>
              <strong>Authentication provider</strong>
              <span>Email account connected</span>
            </div>
            <ShieldCheck size={18} className="success" />
          </div>
          <Button variant="danger" icon={LogOut} onClick={logout}>
            Sign out
          </Button>
        </section>
        <section className="panel">
          <div className="section-head">
            <div>
              <h2>Appearance</h2>
              <p>Choose the interface theme for this device.</p>
            </div>
            <Sun size={20} className="muted-icon" />
          </div>
          <div className="theme-switcher">
            <button
              className={theme === "light" ? "selected" : ""}
              onClick={() => setTheme("light")}
            >
              <Sun size={17} />
              Light
            </button>
            <button
              className={theme === "dark" ? "selected" : ""}
              onClick={() => setTheme("dark")}
            >
              <Moon size={17} />
              Dark
            </button>
          </div>
          <div className="setting-row">
            <div>
              <strong>Notifications</strong>
              <span>
                Notification preferences are not exposed by the current backend.
              </span>
            </div>
            <span className="muted">Unavailable</span>
          </div>
          <div className="setting-row">
            <div>
              <strong>Privacy</strong>
              <span>Your profile data stays connected to your account.</span>
            </div>
            <ShieldCheck size={18} className="muted-icon" />
          </div>
        </section>
      </div>
    </>
  );
}
function CoverLetterDocuments({ setPage, setAuthMode, results }) {
  const [resume, setResume] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("resume");
  const [favorites, setFavorites] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [letter, setLetter] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState(null);

  const loadResume = () => {
    setLoading(true);
    setError(null);
    axios.get(`${API}/resume`).then((response) => setResume(response.data.resume))
      .catch((requestError) => setError(requestError.response?.data?.message || "Failed to load resume."))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    loadResume();
    axios.get(`${API}/favorites`).then((response) => setFavorites(response.data.favorites || [])).catch(() => {});
  }, []);

  const jobs = [...new Map([...results, ...favorites].filter((job) => job?.jobId && job.title).map((job) => [String(job.jobId), job])).values()];
  const selectedJob = jobs.find((job) => String(job.jobId) === selectedJobId);
  const generate = async () => {
    if (!selectedJob || !resume?.text) return;
    setGenerating(true);
    setGenerationError(null);
    try {
      const response = await axios.post(`${API}/cover-letter/generate`, { job: selectedJob });
      setLetter(response.data.coverLetter || "");
    } catch (requestError) {
      setGenerationError(requestError.response?.data?.message || "Cover letter generation failed. Please try again.");
    } finally {
      setGenerating(false);
    }
  };
  const copyLetter = async () => { if (letter) await navigator.clipboard.writeText(letter); };
  const downloadLetter = () => {
    if (!letter) return;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([letter], { type: "text/plain;charset=utf-8" }));
    link.download = "matchhire-cover-letter.txt";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <>
      <div className="page-heading"><div><p className="eyebrow">Your documents</p><h1>Resume & cover letter</h1><p>Keep your resume ready for matching and future applications.</p></div></div>
      <div className="document-tabs">
        <button className={tab === "resume" ? "selected" : ""} onClick={() => setTab("resume")}><FileText size={16} />Resume</button>
        <button className={tab === "cover" ? "selected" : ""} onClick={() => setTab("cover")}><Sparkles size={16} />Cover letter</button>
      </div>
      {tab === "resume" ? <section className="panel resume-panel">
        {loading ? <div className="document-loading"><span className="loader"><FileText size={18} /></span><p>Loading your resume...</p></div> : error ? <div className="document-empty"><span className="empty-icon"><Info size={21} /></span><h2>Resume unavailable</h2><p>{error}</p>{error.includes("Authorization") || error.includes("token") ? <Button variant="secondary" onClick={() => setAuthMode("login")}>Sign in</Button> : <Button variant="secondary" onClick={loadResume}>Try again</Button>}</div> : resume?.text ? <><div className="document-meta"><div><p className="eyebrow">Uploaded resume</p><h2>{resume.fileName || "Resume PDF"}</h2><p>{resume.updatedAt ? `Updated ${new Date(resume.updatedAt).toLocaleString()}` : "Extracted content saved to your account"}</p></div><Button variant="secondary" icon={Search} onClick={() => setPage("find")}>Use for matching</Button></div><textarea className="resume-preview" value={resume.text} readOnly aria-label="Extracted resume content" /></> : <div className="document-empty"><span className="empty-icon"><Upload size={21} /></span><h2>No resume uploaded yet</h2><p>Upload a PDF from Find Jobs to see its extracted content here.</p><Button icon={Search} onClick={() => setPage("find")}>Go to Find Jobs</Button></div>}
      </section> : <section className="panel cover-letter-panel">
        <div className="section-head"><div><p className="eyebrow">AI-assisted, resume-grounded</p><h2>Write for the opportunity in front of you.</h2><p>Select one of your real matched or saved jobs. Gemini uses your persisted resume and the selected job details to draft an editable letter.</p></div><Sparkles className="muted-icon" size={22} /></div>
        {!resume?.text && !loading ? <div className="document-empty compact-empty"><span className="empty-icon"><Upload size={21} /></span><h2>Upload a resume first</h2><p>A persisted resume is required before a grounded cover letter can be generated.</p><Button icon={Search} onClick={() => setPage("find")}>Go to Find Jobs</Button></div> : <>
          <label>Selected job<select value={selectedJobId} onChange={(event) => { setSelectedJobId(event.target.value); setGenerationError(null); }}><option value="">Choose a matched or saved job</option>{jobs.map((job) => <option key={job.jobId} value={job.jobId}>{job.title} · {job.company || "Company not listed"}</option>)}</select></label>
          {selectedJob && <div className="selected-job"><strong>{selectedJob.title}</strong><span>{selectedJob.company || "Company not listed"} · {selectedJob.location || "Location not listed"}</span></div>}
          {generationError && <div className="alert error"><Info size={16} />{generationError}</div>}
          <div className="cover-actions"><Button icon={generating ? RefreshCw : Sparkles} disabled={!selectedJob || !resume?.text || generating} onClick={generate}>{generating ? "Generating..." : letter ? "Regenerate" : "Generate cover letter"}</Button>{letter && <><Button variant="secondary" icon={Clipboard} onClick={copyLetter}>Copy</Button><Button variant="secondary" icon={Download} onClick={downloadLetter}>Download .txt</Button></>}</div>
          {generating ? <div className="document-loading cover-loading"><span className="loader"><Sparkles size={18} /></span><p>Gemini is tailoring your letter to this job...</p></div> : letter ? <textarea className="cover-editor" value={letter} onChange={(event) => setLetter(event.target.value)} aria-label="Editable generated cover letter" /> : <div className="cover-empty"><FileText size={20} /><span>Your generated letter will appear here for review and editing.</span></div>}
        </>}
      </section>}
    </>
  );
}

function ResumeDocuments({ setPage }) {
  const [resume, setResume] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("resume");
  const loadResume = () => { setLoading(true); setError(null); axios.get(`${API}/resume`).then((response) => setResume(response.data.resume)).catch((requestError) => setError(requestError.response?.data?.message || "Failed to load resume.")).finally(() => setLoading(false)); };
  useEffect(() => { const timer = setTimeout(loadResume, 0); return () => clearTimeout(timer); }, []);
  return <><div className="page-heading"><div><p className="eyebrow">Your documents</p><h1>Resume & cover letter</h1><p>Keep your resume ready for matching and future applications.</p></div></div><div className="document-tabs"><button className={tab === "resume" ? "selected" : ""} onClick={() => setTab("resume")}><FileText size={16} />Resume</button><button className={tab === "cover" ? "selected" : ""} onClick={() => setTab("cover")}><Sparkles size={16} />Cover letter</button></div>{tab === "resume" ? <section className="panel resume-panel">{loading ? <div className="document-loading"><span className="loader"><FileText size={18} /></span><p>Loading your resume...</p></div> : error ? <div className="document-empty"><span className="empty-icon"><Info size={21} /></span><h2>Resume unavailable</h2><p>{error}</p><Button variant="secondary" onClick={loadResume}>Try again</Button></div> : resume?.text ? <><div className="document-meta"><div><p className="eyebrow">Uploaded resume</p><h2>{resume.fileName || "Resume PDF"}</h2><p>{resume.updatedAt ? `Updated ${new Date(resume.updatedAt).toLocaleString()}` : "Extracted content saved to your account"}</p></div><Button variant="secondary" icon={Search} onClick={() => setPage("find")}>Use for matching</Button></div><textarea className="resume-preview" value={resume.text} readOnly aria-label="Extracted resume content" /></> : <div className="document-empty"><span className="empty-icon"><Upload size={21} /></span><h2>No resume uploaded yet</h2><p>Upload a PDF from Find Jobs to see its extracted content here.</p><Button icon={Search} onClick={() => setPage("find")}>Go to Find Jobs</Button></div>}</section> : <section className="panel document-empty"><span className="empty-icon"><Sparkles size={21} /></span><p className="eyebrow">Planned capability</p><h2>Cover letter generation is not available yet</h2><p>The current backend has no cover-letter generation service. A future implementation would need an authenticated generation endpoint connected to resume and selected job data.</p></section>}</>;
}
