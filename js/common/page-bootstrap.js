import { ensureCommonPickerModals } from "./picker-modals.js?v=ledger-load-20261010-1";
import { initDateWeekdayAuto } from "./date-weekday-box.js?v=ledger-load-20261010-1";
import { bindModalCloseX, bindModalHeaderDrag } from "./ui-helpers.js?v=ledger-load-20261010-1";
import { installGlobalDialogs } from "./dialogs.js?v=ledger-load-20261010-1";

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

