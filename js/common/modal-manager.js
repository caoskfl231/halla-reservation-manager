import {
  openModalOverlay,
  closeModalOverlay,
  registerModalEscClose,
  createFormDirtyTracker,
  wrapDirtyClose,
} from "./ui-helpers.js?v=app-20261010-7";

export function createModalManager({
  modalEl,
  getSnapshot,
  dirtyConfirmMessage,
} = {}) {
  const dirtyTracker = createFormDirtyTracker(getSnapshot);
  let escOff = null;

  function baseClose() {
    if (modalEl) {
      closeModalOverlay(modalEl);
      if (typeof escOff === "function") {
        escOff();
        escOff = null;
      }
    }
  }

  const closeWithConfirm = wrapDirtyClose(
    dirtyTracker,
    baseClose,
    dirtyConfirmMessage,
  );

  function open() {
    if (!modalEl) return;
    openModalOverlay(modalEl);
    if (typeof closeWithConfirm.markClean === "function") {
      closeWithConfirm.markClean();
    }
    if (typeof escOff === "function") escOff();
    escOff = registerModalEscClose(modalEl, closeWithConfirm);
  }

  function close() {
    closeWithConfirm();
  }

  function markClean() {
    if (typeof closeWithConfirm.markClean === "function") {
      closeWithConfirm.markClean();
    } else if (dirtyTracker?.markClean) {
      dirtyTracker.markClean();
    }
  }

  function isDirty() {
    if (typeof closeWithConfirm.isDirty === "function") {
      return closeWithConfirm.isDirty();
    }
    if (typeof dirtyTracker?.isDirty === "function") {
      return dirtyTracker.isDirty();
    }
    return false;
  }

  return {
    open,
    close,
    markClean,
    isDirty,
  };
}

