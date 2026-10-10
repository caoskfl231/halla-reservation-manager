async function loadNavHtml() {
  const url = new URL("../../common/nav.html", import.meta.url);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      "네비 로드 실패: " + response.status + " " + response.statusText,
    );
  }
  return response.text();
}

function applyPageTitle(container) {
  const title =
    document.body && document.body.dataset ? document.body.dataset.title : "";
  if (!title) return;

  const h1 = container.querySelector("#global-page-title");
  if (h1) {
    h1.textContent = title;
  }
}

function applyCurrentNavLink(container) {
  const nav = container.querySelector(".top-bar nav");
  if (!nav) return;

  const here = location.pathname.split("/").pop() || "index.html";
  const links = nav.querySelectorAll("a");
  links.forEach(function (a) {
    if (a.getAttribute("href") === here) {
      a.setAttribute("aria-current", "page");
    } else {
      a.removeAttribute("aria-current");
    }
  });
}

async function initGlobalSearchIfEnabled() {
  const enabled =
    document.body && document.body.dataset
      ? document.body.dataset.globalSearch
      : "";
  if (enabled !== "1") return;

  const mod = await import("./global-search.js?v=app-20261010-12");
  if (mod && typeof mod.initGlobalSearch === "function") {
    mod.initGlobalSearch();
  }
}

export async function loadGlobalNav() {
  const container = document.getElementById("global-nav-include");
  if (!container) return;

  try {
    const html = await loadNavHtml();
    container.innerHTML = html;
    applyPageTitle(container);
    applyCurrentNavLink(container);
    await initGlobalSearchIfEnabled();
  } catch (err) {
    console.error(err);
  }
}

