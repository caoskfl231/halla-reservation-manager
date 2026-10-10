import { ensureCommonPickerModals } from "./picker-modals.js?v=ledger-import-20261010-2";
import { initDateWeekdayAuto } from "./date-weekday-box.js?v=ledger-import-20261010-2";
import { bindModalCloseX, bindModalHeaderDrag } from "./ui-helpers.js?v=ledger-import-20261010-2";
import { installGlobalDialogs } from "./dialogs.js?v=ledger-import-20261010-2";

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

