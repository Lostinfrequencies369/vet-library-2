const $ = (id) => document.getElementById(id);

const state = {
  ver: (window.__VER__ ?? Date.now()),
  manifest: null,
  data: null,
  activeSection: "ALL",
  search: ""
};

/* ============================================================
   ✅ TOUCH FEEDBACK SYSTEM
   Adds .pressed class on touchstart → instant visual feedback
   Removes on touchend/touchcancel/mouseleave
   Works on ALL interactive elements, no browser delay
   ============================================================ */
(function initTouchFeedback(){
  // All selectors that should get instant press feedback
  const PRESS_SELECTORS = [
    ".enterBtn",
    ".iconBtn",
    ".card",
    ".secBtn",
    ".linkBtn",
    ".suggestItem"
  ].join(",");

  function addPressed(e){
    const el = e.target.closest(PRESS_SELECTORS);
    if(!el) return;
    el.classList.add("pressed");
  }

  function removePressed(e){
    const el = e.target.closest(PRESS_SELECTORS);
    if(el){
      el.classList.remove("pressed");
      return;
    }
    // Fallback: remove .pressed from ALL currently pressed elements
    document.querySelectorAll(".pressed").forEach(p => p.classList.remove("pressed"));
  }

  function removeAllPressed(){
    document.querySelectorAll(".pressed").forEach(p => p.classList.remove("pressed"));
  }

  // Touch events (mobile) — instant, no delay
  document.addEventListener("touchstart", addPressed, { passive: true });
  document.addEventListener("touchend", (e) => {
    // Small delay so user can see the feedback before it disappears
    setTimeout(() => removePressed(e), 120);
  }, { passive: true });
  document.addEventListener("touchcancel", removeAllPressed, { passive: true });

  // Mouse events (desktop fallback)
  document.addEventListener("mousedown", addPressed);
  document.addEventListener("mouseup", (e) => {
    setTimeout(() => removePressed(e), 120);
  });
  document.addEventListener("mouseleave", removeAllPressed);

  // Safety: if finger/mouse leaves the element
  document.addEventListener("touchmove", (e) => {
    // Check if touch moved outside the pressed element
    const touch = e.touches[0];
    if(!touch) return;
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    if(!el || !el.closest(PRESS_SELECTORS)){
      removeAllPressed();
    }
  }, { passive: true });

  // Extra safety: scroll starts → remove all pressed states
  document.addEventListener("scroll", removeAllPressed, { passive: true, capture: true });
})();


function norm(s){
  return (s || "")
    .toString()
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
  return id
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/* ---------- tags: if missing, derive from title/category ---------- */
function deriveTags(item){
  const base = `${item.title || ""} ${item.category || ""} ${item.file || ""}`;
  const words = norm(base).split(" ").filter(Boolean);
  // keep meaningful tokens only
  const clean = words
    .map(w => w.replace(/[^a-z0-9]+/g, ""))
    .filter(w => w.length >= 3)
    .slice(0, 12);
  return Array.from(new Set(clean));
}

function getTagsText(item){
  const t = Array.isArray(item.tags) ? item.tags : (item.tags ? [item.tags] : null);
  const tags = t && t.length ? t : deriveTags(item);
  return tags.join(" ");
}

/* ---------- Page transitions ---------- */
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

/* ---------- Drawer ---------- */
function openDrawer(){
  $("drawer").classList.remove("hidden");
  $("drawer").setAttribute("aria-hidden", "false");
}
function closeDrawer(){
  $("drawer").classList.add("hidden");
  $("drawer").setAttribute("aria-hidden", "true");
}

/* ---------- Modal ---------- */
function openModal(item){
  const title = `${prettySection(item.category)} • ${item.title}`;
  $("modalTitle").textContent = title;

  const src = "./" + item.file;
  $("modalImg").src = src;
  $("modalImg").alt = item.title;
  $("fullOpen").href = src;

  $("modal").classList.remove("hidden");
  $("modal").setAttribute("aria-hidden","false");
}
function closeModal(){
  $("modal").classList.add("hidden");
  $("modal").setAttribute("aria-hidden","true");
  $("modalImg").src = "";
}

/* ---------- Fetch helpers ---------- */
async function fetchJSON(url){
  const r = await fetch(url, { cache: "no-store" });
  if(!r.ok) throw new Error("Fetch failed: " + url);
  return r.json();
}

/* ---------- Load flow (Page2) ---------- */
async function loadAll(){
  showPage(2);
  setProgress(0);

  let fake = 0;
  const fakeTimer = setInterval(() => {
    fake = Math.min(fake + (fake < 70 ? 3 : 1), 88);
    setProgress(fake);
  }, 80);

  const ts = Date.now();
  const v = encodeURIComponent(state.ver);

  const manifestURL = `./posters/manifest.json?ts=${ts}&v=${v}`;
  const dataURL = `./data.json?ts=${ts}&v=${v}`;

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
    console.error(err);
    setTimeout(() => {
      initLibraryUI(true);
      showPage(3);
    }, 260);
  }
}

/* ---------- Library UI ---------- */
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
  host.innerHTML = "";

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

  // requirement: selecting section clears search
  state.search = "";
  $("search").value = "";
  hideSuggest();

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

function matchesQuery(it, q){
  if(!q) return true;
  const tags = getTagsText(it);
  return (
    norm(it.title).includes(q) ||
    norm(it.file).includes(q) ||
    norm(it.category).includes(q) ||
    norm(tags).includes(q)
  );
}

function applyFilters(){
  const all = state.manifest?.items || [];
  const q = norm(state.search);
  const sec = state.activeSection;

  const filtered = all.filter(it => {
    const inSection = (sec === "ALL") ? true : (it.category === sec);
    if(!inSection) return false;
    return matchesQuery(it, q);
  });

  $("sectionHeading").textContent = (sec === "ALL") ? "All Sections" : prettySection(sec);
  $("sectionCount").textContent = `${filtered.length} poster(s)`;

  renderGrid(filtered);
  $("empty").classList.toggle("hidden", filtered.length !== 0);
}

/* ---------- Search suggestions ---------- */
const suggestBox = () => $("searchSuggest");

function hideSuggest(){
  const box = suggestBox();
  box.classList.add("hidden");
  box.innerHTML = "";
}

function makeSuggestions(q){
  const all = state.manifest?.items || [];
  const query = norm(q);
  if(!query || query.length < 2) return [];

  const scored = all.map(it => {
    const title = norm(it.title);
    const cat = norm(it.category);
    const file = norm(it.file);
    const tags = norm(getTagsText(it));

    let score = 0;
    if(title.includes(query)) score += 6;
    if(tags.includes(query)) score += 5;
    if(cat.includes(query)) score += 2;
    if(file.includes(query)) score += 1;

    if(title.startsWith(query)) score += 3;
    if(tags.startsWith(query)) score += 2;

    return { it, score };
  }).filter(x => x.score > 0);

  scored.sort((a,b) => b.score - a.score);
  return scored.slice(0, 8).map(x => x.it);
}

function renderSuggest(list){
  const box = suggestBox();
  if(!list.length){
    hideSuggest();
    return;
  }

  box.innerHTML = "";
  list.forEach(it => {
    const row = document.createElement("div");
    row.className = "suggestItem";

    const img = document.createElement("img");
    img.className = "suggestThumb";
    img.loading = "lazy";
    img.src = "./" + it.file;
    img.alt = it.title;

    const text = document.createElement("div");
    text.className = "suggestText";

    const t = document.createElement("div");
    t.className = "suggestTitle";
    t.textContent = it.title;

    const meta = document.createElement("div");
    meta.className = "suggestMeta";

    const tagsArr = (Array.isArray(it.tags) ? it.tags : deriveTags(it)).slice(0,3);
    const tagsHTML = tagsArr.map(x => `<span class="suggestTag">${x}</span>`).join("");
    meta.innerHTML = `${tagsHTML}${prettySection(it.category)}`;

    text.appendChild(t);
    text.appendChild(meta);

    row.appendChild(img);
    row.appendChild(text);

    row.onclick = () => {
      hideSuggest();
      $("search").blur();
      openModal(it);
    };

    box.appendChild(row);
  });

  box.classList.remove("hidden");
}

/* ---------- Init Page 3 ---------- */
function initLibraryUI(showError=false){
  $("menuBtn").onclick = openDrawer;
  $("closeDrawer").onclick = closeDrawer;
  $("drawerBackdrop").onclick = closeDrawer;

  $("modalClose").onclick = closeModal;
  $("modalBackdrop").onclick = closeModal;

  document.addEventListener("keydown", (e) => {
    if(e.key === "Escape"){ closeModal(); closeDrawer(); hideSuggest(); }
  });

  const items = state.manifest?.items || [];

  if(!items.length){
    $("sectionHeading").textContent = "Poster Library";
    $("sectionCount").textContent = showError ? "manifest.json missing/failed" : "0 poster(s)";
    $("empty").classList.remove("hidden");
    $("empty").textContent = showError
      ? "manifest.json missing/failed. Generate posters/manifest.json and push."
      : "No posters found.";
    $("grid").innerHTML = "";
    return;
  }

  // Build drawer
  renderDrawer(buildSections(items));

  // Search input handlers
  $("search").addEventListener("input", () => {
    state.search = $("search").value;
    applyFilters();

    const list = makeSuggestions(state.search);
    renderSuggest(list);
  });

  $("search").addEventListener("focus", () => {
    const list = makeSuggestions($("search").value);
    renderSuggest(list);
  });

  document.addEventListener("click", (e) => {
    const box = suggestBox();
    if(e.target && e.target.id === "search") return;
    if(box.contains(e.target)) return;
    hideSuggest();
  });

  // Default view
  state.activeSection = "ALL";
  state.search = "";
  applyFilters();
}

/* ---------- Page 1 -> 2 -> 3 ---------- */
function initLanding(){
  $("enterBtn").addEventListener("click", () => {
    $("enterBtn").blur();
    setTimeout(loadAll, 120);
  });
}

function boot(){
  initLanding();
  showPage(1);
}

/* Fix: if JS loads after DOMContentLoaded */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
