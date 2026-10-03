export function bindDateWeekday({
  dateInput,
  weekdaySpan,
  todayYMD,
  formatWeekdayLabel,
} = {}) {
  if (!dateInput || !weekdaySpan || typeof formatWeekdayLabel !== "function") {
    return;
  }

  if (dateInput.dataset.weekdayBound === "1") return;
  dateInput.dataset.weekdayBound = "1";

  const resolveToday = () => {
    if (!todayYMD) return "";
    if (typeof todayYMD === "function") return String(todayYMD() || "");
    return String(todayYMD || "");
  };

  // 기본값 통일: 요일 박스가 붙은 단일 날짜 입력은 초기 상태에서 오늘 날짜로 채운다.
  // (사용자가 의도적으로 비우는 경우를 존중하기 위해, 이후 업데이트에서는 강제하지 않는다.)
  if (!dateInput.value) {
    const t = resolveToday();
    if (t) dateInput.value = t;
  }

  const update = () => {
    const v = String(dateInput.value || "");
    weekdaySpan.textContent = v ? formatWeekdayLabel(v) : "";
  };

  dateInput.addEventListener("input", update);
  dateInput.addEventListener("change", update);
  update();
}

export function initDateWeekdayAuto({
  root = document,
  todayYMD,
  formatWeekdayLabel,
} = {}) {
  if (!root) return;
  const inputs = root.querySelectorAll('input[type="date"][id]');
  inputs.forEach((input) => {
    const weekdayId = `${input.id}-weekday`;
    const span = root.getElementById
      ? root.getElementById(weekdayId)
      : root.querySelector(`#${CSS.escape(weekdayId)}`);
    if (!span) return;
    bindDateWeekday({
      dateInput: input,
      weekdaySpan: span,
      todayYMD,
      formatWeekdayLabel,
    });
  });
}
