import { ensureCommonPickerModals } from "./picker-modals.js";
import { initDateWeekdayAuto } from "./date-weekday-box.js";
import { bindModalCloseX, bindModalHeaderDrag } from "./ui-helpers.js";
import { installGlobalDialogs } from "./dialogs.js";

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
