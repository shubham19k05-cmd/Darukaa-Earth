import React from 'react';
import { createRoot } from 'react-dom/client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Map, { Layer, NavigationControl, Source } from 'react-map-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import { Line } from 'react-chartjs-2';
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip
} from 'chart.js';
import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import { api, clearToken, setToken } from './api';
import './styles.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

function Auth({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ full_name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      const data = await api(mode === 'login' ? '/auth/login' : '/auth/register', {
        method: 'POST',
        body: JSON.stringify(form)
      });
      setToken(data.access_token);
      onLogin();
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <div className="auth-shell">
      <div className="auth-visual">
        <div className="brand big">DARUKAA<span>.EARTH</span></div>
        <div className="hero-copy">
          <div className="pill">GEOSPATIAL IMPACT PLATFORM</div>
          <h1>Measure land.<br />Understand impact.</h1>
          <p>Manage carbon and biodiversity projects with one clear spatial analytics workspace.</p>
        </div>
        <div className="visual-orbit orbit-one" /><div className="visual-orbit orbit-two" />
      </div>
      <div className="auth-panel">
        <div className="mobile-brand brand">DARUKAA<span>.EARTH</span></div>
        <div className="eyebrow">{mode === 'login' ? 'WELCOME BACK' : 'GET STARTED'}</div>
        <h2>{mode === 'login' ? 'Sign in to your workspace' : 'Create your workspace'}</h2>
        <p className="muted">{mode === 'login' ? 'Access your projects and site analytics.' : 'The first registered account becomes an administrator.'}</p>
        {error && <div className="error">{error}</div>}
        <form onSubmit={submit} className="stack">
          {mode === 'register' && <label>Full name<input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></label>}
          <label>Email<input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label>Password<input required minLength="6" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
          <button className="primary wide">{mode === 'login' ? 'Sign in' : 'Create account'} <span>→</span></button>
        </form>
        <button className="text-button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
          {mode === 'login' ? 'Create a new account' : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  );
}

function StatCard({ label, value, detail }) {
  return <div className="stat-card"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function Dashboard() {
  const mapRef = useRef(null);
  const drawRef = useRef(null);
  const [me, setMe] = useState(null);
  const [projects, setProjects] = useState([]);
  const [sites, setSites] = useState([]);
  const [summary, setSummary] = useState(null);
  const [selected, setSelected] = useState(null);
  const [metrics, setMetrics] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [showProject, setShowProject] = useState(false);
  const [showSite, setShowSite] = useState(false);
  const [project, setProject] = useState({ name: '', description: '', project_type: 'Carbon' });
  const [siteForm, setSiteForm] = useState({ name: '', status: 'Active', project_id: '' });
  const [pendingGeometry, setPendingGeometry] = useState(null);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [profile, projectRows, siteRows, dashboard] = await Promise.all([
        api('/me'), api('/projects'), api('/sites'), api('/dashboard/summary')
      ]);
      setMe(profile); setProjects(projectRows); setSites(siteRows); setSummary(dashboard);
      setProjectId((current) => current || String(projectRows[0]?.id || ''));
      setSiteForm((current) => ({ ...current, project_id: current.project_id || String(projectRows[0]?.id || '') }));
    } catch (err) { setNotice(err.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!selected) { setMetrics([]); return; }
    api(`/sites/${selected.id}/analytics`).then(setMetrics).catch((err) => setNotice(err.message));
  }, [selected]);

  const onMapLoad = (e) => {
    const map = e.target;
    if (drawRef.current) return;
    const draw = new MapboxDraw({ displayControlsDefault: false, controls: { polygon: true, trash: true }, defaultMode: 'simple_select' });
    map.addControl(draw, 'top-right'); drawRef.current = draw;
    const created = (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      setPendingGeometry(feature.geometry);
      setSiteForm((current) => ({ ...current, project_id: current.project_id || projectId }));
      setShowSite(true);
    };
    map.on('draw.create', created);
  };

  const visibleSites = useMemo(() => projectId ? sites.filter((site) => String(site.project_id) === String(projectId)) : sites, [sites, projectId]);
  const geojson = useMemo(() => ({ type: 'FeatureCollection', features: visibleSites.filter((s) => s.geometry).map((s) => ({ type: 'Feature', geometry: s.geometry, properties: { id: s.id, name: s.name } })) }), [visibleSites]);
  const chartData = useMemo(() => ({
    labels: metrics.map((m) => new Date(m.recorded_on).toLocaleDateString(undefined, { month: 'short', year: '2-digit' })),
    datasets: [
      { label: 'Carbon tonnes', data: metrics.map((m) => m.carbon_tonnes), borderWidth: 2, pointRadius: 3, tension: 0.35 },
      { label: 'Biodiversity index', data: metrics.map((m) => m.biodiversity_index), borderWidth: 2, pointRadius: 3, tension: 0.35 }
    ]
  }), [metrics]);

  const selectSite = (site) => {
    setSelected(site);
    const map = mapRef.current?.getMap();
    const coords = site.geometry?.coordinates?.[0] || [];
    if (map && coords.length) {
      const lons = coords.map((p) => p[0]); const lats = coords.map((p) => p[1]);
      map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 100, duration: 700, maxZoom: 13 });
    }
  };
  const createProject = async (event) => {
    event.preventDefault();
    try { await api('/projects', { method: 'POST', body: JSON.stringify(project) }); setShowProject(false); setProject({ name: '', description: '', project_type: 'Carbon' }); await load(); setNotice('Project created.'); }
    catch (err) { setNotice(err.message); }
  };
  const createSite = async (event) => {
    event.preventDefault();
    if (!pendingGeometry) return;
    try {
      await api('/sites', { method: 'POST', body: JSON.stringify({ ...siteForm, project_id: Number(siteForm.project_id), geometry: pendingGeometry }) });
      drawRef.current?.deleteAll(); setPendingGeometry(null); setShowSite(false); setSiteForm({ name: '', status: 'Active', project_id: projectId }); await load(); setNotice('Site saved and analytics seeded.');
    } catch (err) { setNotice(err.message); }
  };
  const logout = () => { clearToken(); location.reload(); };

  return <div className="dashboard">
    <header className="topbar">
      <div className="brand">DARUKAA<span>.EARTH</span></div>
      <div className="top-actions"><div className="profile"><div className="avatar">{me?.full_name?.[0] || 'U'}</div><div><b>{me?.full_name || 'User'}</b><small>{me?.role || 'USER'}</small></div></div><button className="icon-button" onClick={logout} title="Logout">↪</button></div>
    </header>
    <div className="workspace">
      <aside className="sidebar">
        <div className="sidebar-head"><div><div className="eyebrow">WORKSPACE</div><h2>Projects</h2></div><button className="plus" onClick={() => setShowProject(true)}>+</button></div>
        <div className="project-list">
          {projects.map((p) => <button className={`project-row ${String(p.id) === String(projectId) ? 'active' : ''}`} key={p.id} onClick={() => { setProjectId(String(p.id)); setSelected(null); }}><span className="project-dot" /><span><b>{p.name}</b><small>{p.project_type} · {p.site_count} {p.site_count === 1 ? 'site' : 'sites'}</small></span></button>)}
          {!projects.length && <div className="empty-side">Create your first project to start mapping sites.</div>}
        </div>
        <div className="sidebar-foot"><div className="eyebrow">SITE DIRECTORY</div><div className="site-list">{visibleSites.map((s) => <button key={s.id} className={`site-row ${selected?.id === s.id ? 'selected' : ''}`} onClick={() => selectSite(s)}><span><b>{s.name}</b><small>{s.area_hectares.toFixed(2)} ha</small></span><i className={s.status.toLowerCase()}>{s.status}</i></button>)}{!visibleSites.length && <p className="muted">No sites in this project yet.</p>}</div></div>
      </aside>
      <main className="content">
        <div className="page-heading"><div><div className="eyebrow">IMPACT OVERVIEW</div><h1>{projects.find((p) => String(p.id) === String(projectId))?.name || 'Your projects'}</h1><p>Monitor land coverage, carbon and biodiversity performance from one spatial view.</p></div><button className="primary" onClick={() => { if (!projects.length) setShowProject(true); else setNotice('Choose the polygon tool on the map to draw a new site.'); }}>+ Add site</button></div>
        <div className="stats-grid"><StatCard label="Projects" value={summary?.projects ?? '—'} detail="managed in workspace" /><StatCard label="Mapped sites" value={summary?.sites ?? '—'} detail={`${summary?.active_sites ?? 0} active`} /><StatCard label="Land covered" value={summary ? `${summary.area_hectares.toLocaleString()} ha` : '—'} detail="from mapped polygons" /><StatCard label="Latest carbon" value={summary ? `${summary.latest_carbon_tonnes} t` : '—'} detail="latest recorded metric" /></div>
        <section className="map-panel"><div className="panel-header"><div><h2>Project map</h2><span>{visibleSites.length} mapped {visibleSites.length === 1 ? 'site' : 'sites'} · Click a polygon for details</span></div><div className="map-tip">⌖ <b>Draw</b> a polygon to add a site</div></div>
          <div className="map-wrap">{MAPBOX_TOKEN ? <Map ref={mapRef} onLoad={onMapLoad} initialViewState={{ longitude: 78.9629, latitude: 22.5937, zoom: 4.4 }} mapboxAccessToken={MAPBOX_TOKEN} mapStyle="mapbox://styles/mapbox/light-v11" projection="mercator" interactiveLayerIds={['site-fill']} onClick={(event) => { const feature = event.features?.[0]; if (feature?.properties?.id) selectSite(sites.find((s) => s.id === Number(feature.properties.id))); }} cursor="pointer"><NavigationControl position="bottom-right" /><Source id="sites" type="geojson" data={geojson}><Layer id="site-fill" type="fill" paint={{ 'fill-opacity': 0.3 }} /><Layer id="site-outline" type="line" paint={{ 'line-width': 2 }} /></Source></Map> : <div className="map-missing"><strong>Mapbox token required</strong><span>Set VITE_MAPBOX_TOKEN in frontend/.env to enable the interactive map.</span></div>}</div>
        </section>
        <section className="analytics-panel"><div className="analytics-title"><div><div className="eyebrow">SITE ANALYTICS</div><h2>{selected?.name || 'Select a site'}</h2><p>{selected ? `${selected.status} · ${selected.area_hectares.toFixed(2)} hectares` : 'Select a polygon or site from the directory to view performance over time.'}</p></div>{selected && <div className="metric-chips"><span>Carbon trend ↗</span><span>Biodiversity trend ↗</span></div>}</div>{selected && metrics.length ? <div className="chart"><Line data={chartData} options={{ responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true, grid: { drawBorder: false } }, x: { grid: { display: false } } } }} /></div> : <div className="analytics-empty"><div className="empty-icon">⌁</div><b>No site selected</b><span>Choose a mapped site to inspect its six-month analytics series.</span></div>}</section>
      </main>
    </div>
    {loading && <div className="loading">Loading workspace…</div>}
    {notice && <button className="toast" onClick={() => setNotice('')}>{notice} <span>×</span></button>}
    {showProject && <div className="modal-backdrop"><form className="modal-card" onSubmit={createProject}><div className="modal-head"><div><div className="eyebrow">PROJECT MANAGEMENT</div><h2>New project</h2></div><button type="button" className="close" onClick={() => setShowProject(false)}>×</button></div><label>Project name<input required placeholder="e.g. Sundarbans Restoration" value={project.name} onChange={(e) => setProject({ ...project, name: e.target.value })} /></label><label>Project type<select value={project.project_type} onChange={(e) => setProject({ ...project, project_type: e.target.value })}><option>Carbon</option><option>Biodiversity</option><option>Carbon & Biodiversity</option></select></label><label>Description<textarea placeholder="What is this project measuring or restoring?" value={project.description} onChange={(e) => setProject({ ...project, description: e.target.value })} /></label><div className="modal-actions"><button type="button" className="secondary" onClick={() => setShowProject(false)}>Cancel</button><button className="primary">Create project</button></div></form></div>}
    {showSite && <div className="modal-backdrop"><form className="modal-card" onSubmit={createSite}><div className="modal-head"><div><div className="eyebrow">GEOSPATIAL DATA</div><h2>Save mapped site</h2></div><button type="button" className="close" onClick={() => { drawRef.current?.deleteAll(); setPendingGeometry(null); setShowSite(false); }}>×</button></div><label>Site name<input required placeholder="e.g. North Reserve" value={siteForm.name} onChange={(e) => setSiteForm({ ...siteForm, name: e.target.value })} /></label><label>Project<select value={siteForm.project_id} onChange={(e) => setSiteForm({ ...siteForm, project_id: e.target.value })}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Status<select value={siteForm.status} onChange={(e) => setSiteForm({ ...siteForm, status: e.target.value })}><option>Active</option><option>Monitoring</option><option>Completed</option></select></label><div className="draw-confirm">✓ Polygon captured from map. Area is calculated server-side with PostGIS.</div><div className="modal-actions"><button type="button" className="secondary" onClick={() => { drawRef.current?.deleteAll(); setPendingGeometry(null); setShowSite(false); }}>Discard</button><button className="primary">Save site</button></div></form></div>}
  </div>;
}

function App() { const [loggedIn, setLoggedIn] = useState(Boolean(localStorage.getItem('darukaa_token'))); return loggedIn ? <Dashboard /> : <Auth onLogin={() => setLoggedIn(true)} />; }
createRoot(document.getElementById('root')).render(<App />);
