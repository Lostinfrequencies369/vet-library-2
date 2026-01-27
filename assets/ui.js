const $ = (id) => document.getElementById(id);

const state = {
  ver: (window.__VER__ ?? Date.now()),
  manifest: null,
  data: null,            // future: data.json drug/disease index
  activeSection: "ALL",
  search: ""
};

function norm(s){
  return (s || "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function prettySection(id){
  const m = {
    "fish_aquatics":"Fish & Aquatics",
    "eye-ear":"Eye & Ear",
    "oral-dental":"Oral & Dental",
    "_misc":"Misc"
  };
  if (m[id]) return m[id];

  return (id || "")
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/* ---------------- Page transitions ---------------- */
function showPage(n){
  const p1 = $("page1"), p2 = $("page2"), p3 = $("page3");
  if(!p1 || !p2 || !p3){
    console.error("Missing page containers: #page1/#page2/#page3");
    return;
  }
  p1.classList.toggle("hidden", n !== 1);
  p2.classList.toggle("hidden", n !== 2);
  p3.classList.toggle("hidden", n !== 3);
}

function setProgress(p){
  const bar = $("barFill");
  const pctEl = $("pct");
  if(!bar || !pctEl) return;

  const pct = Math.max(0, Math.min(100, Math.round(p)));
  bar.style.width = pct + "%";
  pctEl.textContent = pct + "%";
}

/* ---------------- Drawer ---------------- */
function openDrawer(){
  const d = $("drawer");
  if(!d) return;
  d.classList.remove("hidden");
  d.setAttribute("aria-hidden", "false");
}
function closeDrawer(){
  const d = $("drawer");
  if(!d) return;
  d.classList.add("hidden");
  d.setAttribute("aria-hidden", "true");
}

/* ---------------- Modal ---------------- */
function openModal(item){
  const modal = $("modal");
  const titleEl = $("modalTitle");
  const img = $("modalImg");
  const full = $("fullOpen");
  if(!modal || !titleEl || !img || !full) return;

  const title = `${prettySection(item.category)} • ${norm(item.title)}`;
  titleEl.textContent = title;

  const src = "./" + item.file;
  img.src = src;
  img.alt = item.title || "poster";
  full.href = src;

  modal.classList.remove("hidden");
}
function closeModal(){
  const modal = $("modal");
  const img = $("modalImg");
  if(!modal) return;
  modal.classList.add("hidden");
  if(img) img.src = "";
}

/* ---------------- Data loading (Page 2 logic) ---------------- */
async function fetchJSON(url){
  const r = await fetch(url, { cache: "no-store" });
  if(!r.ok) throw new Error("Fetch failed: " + url + " (" + r.status + ")");
  return r.json();
}

async function loadAll(){
  showPage(2);
  setProgress(0);

  // Fake smooth loading baseline while real fetch happens
  let fake = 0;
  const fakeTimer = setInterval(() => {
    fake = Math.min(fake + (fake < 70 ? 3 : 1), 88);
    setProgress(fake);
  }, 80);

  const ts = Date.now();
  const manifestURL = `./posters/manifest.json?ts=${ts}&v=${encodeURIComponent(state.ver)}`;
  const dataURL     = `./data.json?ts=${ts}&v=${encodeURIComponent(state.ver)}`;

  try{
    const [manifest, data] = await Promise.all([
      fetchJSON(manifestURL),
      fetchJSON(dataURL).catch(() => ({ items: [] }))
    ]);

    state.manifest = manifest;
    state.data = data;

    clearInterval(fakeTimer);
    setProgress(100);

    setTimeout(() => {
      initLibraryUI();
      showPage(3);
    }, 260);

  }catch(err){
    clearInterval(fakeTimer);
    setProgress(100);
    console.error("Load error:", err);

    setTimeout(() => {
      initLibraryUI(true);
      showPage(3);
    }, 260);
  }
}

/* ---------------- Library UI (Page 3) ---------------- */
function buildSections(items){
  const counts = new Map();
  for(const it of items){
    counts.set(it.category, (counts.get(it.category) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([id, count]) => ({ id, label: prettySection(id), count }))
    .sort((a,b) => a.label.localeCompare(b.label));
}

function renderDrawer(sections){
  const host = $("sectionList");
  if(!host) return;

  host.innerHTML = "";

  // All Sections
  const allCount = (state.manifest?.items?.length || 0);
  const allBtn = document.createElement("button");
  allBtn.className = "secBtn" + (state.activeSection === "ALL" ? " active" : "");
  allBtn.innerHTML = `
    <div class="secLabel">All Sections</div>
    <div class="secCount">${allCount} poster(s)</div>
  `;
  allBtn.onclick = () => selectSection("ALL");
  host.appendChild(allBtn);

  for(const s of sections){
    const btn = document.createElement("button");
    btn.className = "secBtn" + (state.activeSection === s.id ? " active" : "");
    btn.innerHTML = `
      <div class="secLabel">${s.label}</div>
      <div class="secCount">${s.count} poster(s)</div>
    `;
    btn.onclick = () => selectSection(s.id);
    host.appendChild(btn);
  }
}

function selectSection(id){
  state.activeSection = id;

  // Requirement: selecting section clears search
  state.search = "";
  const searchEl = $("search");
  if(searchEl) searchEl.value = "";

  renderDrawer(buildSections(state.manifest?.items || []));

  closeDrawer();
  applyFilters();
}

function renderGrid(items){
  const grid = $("grid");
  if(!grid) return;
  grid.innerHTML = "";

  for(const it of items){
    const card = document.createElement("div");
    card.className = "card";
    card.onclick = () => openModal(it);

    const img = document.createElement("img");
    img.className = "thumb";
    img.loading = "lazy";
    img.src = "./" + it.file;
    img.alt = it.title || "poster";

    const meta = document.createElement("div");
    meta.className = "meta";

    const t = document.createElement("div");
    t.className = "metaTitle";
    t.textContent = norm(it.title);

    const s = document.createElement("div");
    s.className = "metaSub";
    s.textContent = prettySection(it.category);

    meta.appendChild(t);
    meta.appendChild(s);

    card.appendChild(img);
    card.appendChild(meta);

    grid.appendChild(card);
  }
}

function applyFilters(){
  const all = state.manifest?.items || [];
  const q = norm(state.search);
  const sec = state.activeSection;

  const filtered = all.filter(it => {
    const inSection = (sec === "ALL") ? true : (it.category === sec);
    if(!inSection) return false;
    if(!q) return true;
    return norm(it.title).includes(q) || norm(it.file).includes(q) || norm(it.category).includes(q);
  });

  const heading = $("sectionHeading");
  const countEl = $("sectionCount");

  if(heading){
    heading.textContent = (sec === "ALL") ? "All Sections" : prettySection(sec);
  }
  if(countEl){
    countEl.textContent = `${filtered.length} poster(s)`;
  }

  renderGrid(filtered);

  const empty = $("empty");
  if(empty){
    empty.classList.toggle("hidden", filtered.length !== 0);
  }
}

function initLibraryUI(showError = false){
  // Attach handlers safely
  const menuBtn = $("menuBtn");
  const closeBtn = $("closeDrawer");
  const backdrop = $("drawerBackdrop");

  if(menuBtn) menuBtn.onclick = openDrawer;
  if(closeBtn) closeBtn.onclick = closeDrawer;
  if(backdrop) backdrop.onclick = closeDrawer;

  const modalClose = $("modalClose");
  const modalBackdrop = $("modalBackdrop");

  if(modalClose) modalClose.onclick = closeModal;
  if(modalBackdrop) modalBackdrop.onclick = closeModal;

  document.addEventListener("keydown", (e) => {
    if(e.key === "Escape"){ closeModal(); closeDrawer(); }
  });

  const searchEl = $("search");
  if(searchEl){
    searchEl.addEventListener("input", () => {
      state.search = searchEl.value;
      applyFilters();
    });
  }

  const items = state.manifest?.items || [];
  if(!items.length){
    const heading = $("sectionHeading");
    const countEl = $("sectionCount");
    const empty = $("empty");
    const grid = $("grid");

    if(heading) heading.textContent = "Poster Library";
    if(countEl) countEl.textContent = showError ? "manifest.json missing or failed to load" : "0 poster(s)";
    if(empty){
      empty.classList.remove("hidden");
      empty.textContent = showError
        ? "manifest.json missing/failed. Generate posters/manifest.json and push."
        : "No posters found.";
    }
    if(grid) grid.innerHTML = "";
    return;
  }

  const sections = buildSections(items);
  renderDrawer(sections);

  state.activeSection = "ALL";
  state.search = "";
  applyFilters();
}

/* ---------------- Page 1 -> Page 2 -> Page 3 flow ---------------- */
function initLanding(){
  const btn = $("enterBtn");
  if(!btn){
    console.error("Missing #enterBtn on page1. Check index.html.");
    return;
  }

  // Prevent double-attach
  if(btn.dataset.bound === "1") return;
  btn.dataset.bound = "1";

  btn.addEventListener("click", () => {
    btn.blur();
    setTimeout(() => loadAll(), 120);
  });
}

function boot(){
  initLanding();
  showPage(1);
}

// If DOM already loaded (because ui.js injected late), run immediately
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
