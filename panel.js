/* لوحات تجريبية: كل شيء محفوظ في localStorage بالمتصفح. بدون سيرفر. */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const nm = (n) => Number(n).toLocaleString("ar-EG");
const LS = { g: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, s: (k, v) => localStorage.setItem(k, JSON.stringify(v)) };
const toast = (m) => { const t = document.createElement("div"); t.className = "toast"; t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 1800); };
const titles = () => (typeof WORKS !== "undefined" ? WORKS.map((w) => w.title) : ["Solo Leveling"]);
const D = (k, f) => { let v = LS.g(k, null); if (!v) { v = f(); LS.s(k, v); } return v; };
const pills = { نشر: "ok", منشور: "ok", مسودة: "wr", معلق: "wr", مرفوض: "no", مخفي: "no", "قيد المراجعة": "wr", مقبول: "ok" };
const pill = (s) => `<span class="pill ${pills[s] || ""}">${esc(s)}</span>`;
function shell(cfg) {
  document.title = cfg.name;
  $("#root").innerHTML = `<div class="app"><aside class="side"><h1>${cfg.name}</h1><small>${cfg.sub}</small><hr style="border-color:#ffffff14">${cfg.pages.map(([k, l]) => `<a data-k="${k}">${l}</a>`).join("")}<hr style="border-color:#ffffff14"><a href="index.html">رجوع للموقع</a></aside><main class="main"><div class="demo">وضع تجريبي: البيانات أمثلة وتتحفظ في متصفحك فقط. بدون أسماء مستخدمين حقيقيين. الصلاحيات الحقيقية تحتاج سيرفر.</div><div id="v"></div></main></div>`;
  const go = () => { const k = location.hash.slice(1) || cfg.pages[0][0]; document.querySelectorAll(".side a[data-k]").forEach((a) => a.classList.toggle("on", a.dataset.k === k)); (cfg.views[k] || cfg.views[cfg.pages[0][0]])(); };
  addEventListener("hashchange", go); document.querySelectorAll(".side a[data-k]").forEach((a) => (a.onclick = () => (location.hash = a.dataset.k))); go();
}
const stat = (a, b) => `<div class="c"><b>${a}</b><small>${b}</small></div>`;
const table = (heads, rows) => `<table><thead><tr>${heads.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${heads.length}" style="color:#9aa">لا يوجد</td></tr>`}</tbody></table>`;
const bars = (rows) => { const m = Math.max(...rows.map((r) => r[1]), 1); return `<div class="bars">${rows.map(([n, v]) => `<div><span>${esc(n)}</span><i style="width:${Math.max(4, v / m * 60)}%"></i><b>${nm(v)}</b></div>`).join("")}</div>`; };
const TEAMS = ["فريق النجوم", "فريق الظل", "فريق العنقاء", "فريق الريح", "فريق القمر"];
const rk = () => TEAMS.map((n, i) => [n, 9000 - i * 1700 + (n.length * 37)]);
