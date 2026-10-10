import { ensureCommonPickerModals } from "./picker-modals.js?v=app-20261010-10";
import { initDateWeekdayAuto } from "./date-weekday-box.js?v=app-20261010-10";
import { bindModalCloseX, bindModalHeaderDrag } from "./ui-helpers.js?v=app-20261010-10";
import { installGlobalDialogs } from "./dialogs.js?v=app-20261010-10";

export function bootstrapPageCommon({
  page,
  todayYMD,
  formatWeekdayLabel,
  injectPickerModals = true,
  bindModalChrome = true,
  enableDateWeekdayAuto = true,
} = {}) {
  installGlobalDialogs();

  if (injectPickerModals) {
    ensureCommonPickerModals({ page });
  }

  if (bindModalChrome) {
    bindModalCloseX();
    bindModalHeaderDrag();
  }

  if (enableDateWeekdayAuto) {
    initDateWeekdayAuto({ todayYMD, formatWeekdayLabel });
  }
}

