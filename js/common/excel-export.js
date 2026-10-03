export function requireXLSXOrAlert() {
  const xlsx = window?.XLSX;
  if (!xlsx) {
    const g = window?.__hallaDialogs;
    const msg =
      "엑셀 기능을 위한 라이브러리(XLSX)가 로드되지 않았습니다.\n" +
      "구성 파일(js/vendor/xlsx.full.min.js)을 확인해 주세요.";
    if (g && typeof g.warningDialog === "function") {
      void g.warningDialog(msg);
    } else {
      window.alert(msg);
    }
    return null;
  }
  return xlsx;
}

export function ymdCompact(ymd) {
  const s = String(ymd || "").trim();
  if (!s) return "";
  return s.replaceAll("-", "");
}

export function safeSheetName(name) {
  const s = String(name || "Sheet1").trim() || "Sheet1";
  // Excel sheet name 제한: 31자, 특수문자 []:*?/\\
  return s
    .replace(/[\[\]\:\*\?\/\\\\]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 31)
    .trim();
}

export function bindExcelDropdown({ toggleButton, menuEl, dropdownWrap } = {}) {
  if (!toggleButton || !menuEl) {
    return {
      setOpen: () => {},
      isOpen: () => false,
      destroy: () => {},
    };
  }

  const setOpen = (open) => {
    menuEl.hidden = !open;
    toggleButton.setAttribute("aria-expanded", open ? "true" : "false");
  };

  const isInside = (target) => {
    if (!target) return false;
    if (dropdownWrap && dropdownWrap.contains(target)) return true;
    if (menuEl && menuEl.contains(target)) return true;
    return false;
  };

  const onToggleClick = () => {
    const nextOpen = Boolean(menuEl.hidden);
    setOpen(nextOpen);
  };

  const onDocClick = (e) => {
    if (menuEl.hidden) return;
    if (isInside(e.target)) return;
    setOpen(false);
  };

  const onKeydown = (e) => {
    if (e.key !== "Escape") return;
    if (!menuEl.hidden) setOpen(false);
  };

  toggleButton.addEventListener("click", onToggleClick);
  document.addEventListener("click", onDocClick, true);
  document.addEventListener("keydown", onKeydown);

  return {
    setOpen,
    isOpen: () => !menuEl.hidden,
    destroy: () => {
      toggleButton.removeEventListener("click", onToggleClick);
      document.removeEventListener("click", onDocClick, true);
      document.removeEventListener("keydown", onKeydown);
    },
  };
}

export function exportTableToXlsx({ tableEl, filename, sheetName } = {}) {
  const XLSX = requireXLSXOrAlert();
  if (!XLSX) return false;

  if (!tableEl) {
    const g = window?.__hallaDialogs;
    const msg = "내보내기 대상 테이블을 찾지 못했습니다.";
    if (g && typeof g.warningDialog === "function") {
      void g.warningDialog(msg);
    } else {
      window.alert(msg);
    }
    return false;
  }

  const safeName = safeSheetName(sheetName || "내보내기");
  const wb = XLSX.utils.table_to_book(tableEl, { sheet: safeName });
  XLSX.writeFile(wb, filename || `${safeName}.xlsx`);
  return true;
}
