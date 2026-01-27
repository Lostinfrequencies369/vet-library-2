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
  // folder name -> readable label
  const m = {
    "fish_aquatics":"Fish & Aquatics",
    "eye-ear":"Eye & Ear",
    "oral-dental":"Oral & Dental",
    "_misc":"Misc"
  };
  if (m[id]) return m[id];

  // Title Case with spacing
  return id
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/* ---------------- Page transitions ---------------- */
function showPage(n){
  $("page1").classList.toggle("hidden", n !== 1);
  $("page2").classList.toggle("hidden", n !== 2);
  $("page3").classList.toggle("hidden", n !== 3);
}

function setProgress(p){
  const pct = Math.max(0, Math.min(100, Math.round(p)));
  $("barFill").style.width = pct + "%";
  $("pct").textContent = pct + "%";
}

/* ---------------- Drawer ---------------- */
function openDrawer(){
  $("drawer").classList.remove("hidden");
  $("drawer").setAttribute("aria-hidden", "false");
}
function closeDrawer(){
  $("drawer").classList.add("hidden");
  $("drawer").setAttribute("aria-hidden", "true");
}

/* ---------------- Modal ---------------- */
function openModal(item){
  const title = `${prettySection(item.category)} • ${norm(item.title)}`;
  $("modalTitle").textContent = title;

  const src = "./" + item.file; // item.file is like posters/skin/abc.jpg
  $("modalImg").src = src;
  $("modalImg").alt = item.title;
  $("fullOpen").href = src;

  $("modal").classList.remove("hidden");
}
function closeModal(){
  $("modal").classList.add("hidden");
  $("modalImg").src = "";
}

/* ---------------- Data loading (Page 2 logic) ---------------- */
async function fetchJSON(url){
  const r = await fetch(url, { cache: "no-store" });
  if(!r.ok) throw new Error("Fetch failed: " + url);
  return r.json();
}

async function loadAll(){
  // Show loading page
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
  const dataURL = `./data.json?ts=${ts}&v=${encodeURIComponent(state.ver)}`;

  try{
    // Load both (data.json may be blank, but should be valid JSON)
    const [manifest, data] = await Promise.all([
      fetchJSON(manifestURL),
      fetchJSON(dataURL).catch(() => ({ items: [] })) // if missing, keep safe
    ]);

    state.manifest = manifest;
    state.data = data;

    clearInterval(fakeTimer);
    setProgress(100);

    // polish pause 200–300ms
    setTimeout(() => {
      initLibraryUI();
      showPage(3);
    }, 260);

  }catch(err){
    clearInterval(fakeTimer);
    setProgress(100);
    console.error(err);
    // fallback: still go to page3 but show message
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
  const sections = Array.from(counts.entries())
    .map(([id, count]) => ({ id, label: prettySection(id), count }))
    .sort((a,b) => a.label.localeCompare(b.label));

  return sections;
}

function renderDrawer(sections){
  const host = $("sectionList");
  host.innerHTML = "";

  // "All"
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

  // ✅ Your requirement: selecting section clears search
  state.search = "";
  $("search").value = "";

  // Update drawer active highlight
  renderDrawer(buildSections(state.manifest?.items || []));

  closeDrawer();
  applyFilters();
}

function renderGrid(items){
  const grid = $("grid");
  grid.innerHTML = "";

  for(const it of items){
    const card = document.createElement("div");
    card.className = "card";
    card.onclick = () => openModal(it);

    const img = document.createElement("img");
    img.className = "thumb";
    img.loading = "lazy";
    img.src = "./" + it.file;
    img.alt = it.title;

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

  // Heading
  if(sec === "ALL"){
    $("sectionHeading").textContent = "All Sections";
  }else{
    $("sectionHeading").textContent = prettySection(sec);
  }
  $("sectionCount").textContent = `${filtered.length} poster(s)`;

  // Grid
  renderGrid(filtered);

  $("empty").classList.toggle("hidden", filtered.length !== 0);
}

function initLibraryUI(showError = false){
  // Attach handlers
  $("menuBtn").onclick = openDrawer;
  $("closeDrawer").onclick = closeDrawer;
  $("drawerBackdrop").onclick = closeDrawer;

  $("modalClose").onclick = closeModal;
  $("modalBackdrop").onclick = closeModal;
  document.addEventListener("keydown", (e) => {
    if(e.key === "Escape"){ closeModal(); closeDrawer(); }
  });

  $("search").addEventListener("input", () => {
    state.search = $("search").value;
    applyFilters();
  });

  // If manifest missing → show empty message
  const items = state.manifest?.items || [];
  if(!items.length){
    $("sectionHeading").textContent = "Poster Library";
    $("sectionCount").textContent = showError ? "manifest.json missing or failed to load" : "0 poster(s)";
    $("empty").classList.remove("hidden");
    $("empty").textContent = showError
      ? "manifest.json missing/failed. Generate posters/manifest.json and push."
      : "No posters found.";
    $("grid").innerHTML = "";
    $("drawer").classList.add("hidden");
    return;
  }

  // Build sections + drawer
  const sections = buildSections(items);
  renderDrawer(sections);

  // Default view
  state.activeSection = "ALL";
  state.search = "";
  applyFilters();
}

/* ---------------- Page 1 -> Page 2 -> Page 3 flow ---------------- */
function initLanding(){
  $("enterBtn").addEventListener("click", () => {
    // smooth switch: page1 -> page2 (not instant vanish feel)
    $("enterBtn").blur();
    setTimeout(() => {
      loadAll();
    }, 120);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initLanding();
  showPage(1);
});
