import {
  openModalOverlay,
  closeModalOverlay,
  registerModalEscClose,
} from "./ui-helpers.js?v=app-20261010-7";

let __toastStack = null;

function ensureToastStack() {
  if (__toastStack && document.body.contains(__toastStack)) return __toastStack;

  const el = document.createElement("div");
  el.id = "halla-toast-stack";
  el.className = "halla-toast-stack";
  el.setAttribute("aria-live", "polite");
  el.setAttribute("aria-relevant", "additions");

  document.body.appendChild(el);
  __toastStack = el;
  return el;
}

export function showToast(message, options = {}) {
  const {
    tone = "info", // info | success | error
    timeout = 2200,
  } = options || {};

  const text = String(message ?? "").trim();
  if (!text) return;

  const stack = ensureToastStack();

  const toast = document.createElement("div");
  toast.className = "halla-toast";
  toast.dataset.tone = String(tone || "info");
  toast.setAttribute("role", "status");
  toast.tabIndex = 0;
  toast.textContent = text;

  const remove = () => {
    if (!toast.parentNode) return;
    toast.parentNode.removeChild(toast);
  };

  toast.addEventListener("click", remove);

  stack.appendChild(toast);

  if (timeout && timeout > 0) {
    window.setTimeout(remove, timeout);
  }
}

let __activeModal = null;

function buildModalDom({ title, message, okText, cancelText, tone, showCancel }) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.setAttribute("aria-hidden", "true");

  const dialog = document.createElement("div");
  dialog.className = "modal-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");

  const card = document.createElement("section");
  card.className = "card";

  const header = document.createElement("div");
  header.className = "modal-header";

  const h2 = document.createElement("h2");
  h2.textContent = String(title || "");

  const closeX = document.createElement("button");
  closeX.type = "button";
  closeX.className = "modal-close-x";
  closeX.setAttribute("aria-label", "닫기");
  closeX.textContent = "×";

  header.appendChild(h2);
  header.appendChild(closeX);

  const body = document.createElement("pre");
  body.className = "status";
  body.textContent = String(message ?? "");

  const btnRow = document.createElement("div");
  btnRow.className = "form-button-row";

  const okBtn = document.createElement("button");
  okBtn.type = "button";
  okBtn.className = tone === "danger" ? "danger" : "btn-primary";
  okBtn.textContent = String(okText || "확인");

  let cancelBtn = null;
  if (showCancel) {
    cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn-secondary";
    cancelBtn.textContent = String(cancelText || "취소");
  }

  btnRow.appendChild(okBtn);
  if (cancelBtn) btnRow.appendChild(cancelBtn);

  card.appendChild(header);
  card.appendChild(body);
  card.appendChild(btnRow);

  dialog.appendChild(card);
  overlay.appendChild(dialog);

  return {
    overlay,
    closeX,
    okBtn,
    cancelBtn,
  };
}

function buildPromptModalDom({
  title,
  message,
  okText,
  cancelText,
  tone,
  defaultValue,
  placeholder,
  inputType,
}) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.setAttribute("aria-hidden", "true");

  const dialog = document.createElement("div");
  dialog.className = "modal-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");

  const card = document.createElement("section");
  card.className = "card";

  const header = document.createElement("div");
  header.className = "modal-header";

  const h2 = document.createElement("h2");
  h2.textContent = String(title || "");

  const closeX = document.createElement("button");
  closeX.type = "button";
  closeX.className = "modal-close-x";
  closeX.setAttribute("aria-label", "닫기");
  closeX.textContent = "×";

  header.appendChild(h2);
  header.appendChild(closeX);

  const body = document.createElement("pre");
  body.className = "status";
  body.textContent = String(message ?? "");

  const inputWrap = document.createElement("div");
  inputWrap.className = "table-action-box";

  const input = document.createElement("input");
  input.type = String(inputType || "text");
  input.className = "customer-search-input";
  input.value = defaultValue == null ? "" : String(defaultValue);
  if (placeholder != null) input.placeholder = String(placeholder);

  inputWrap.appendChild(input);

  const btnRow = document.createElement("div");
  btnRow.className = "form-button-row";

  const okBtn = document.createElement("button");
  okBtn.type = "button";
  okBtn.className = tone === "danger" ? "danger" : "btn-primary";
  okBtn.textContent = String(okText || "확인");

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "btn-secondary";
  cancelBtn.textContent = String(cancelText || "취소");

  btnRow.appendChild(okBtn);
  btnRow.appendChild(cancelBtn);

  card.appendChild(header);
  card.appendChild(body);
  card.appendChild(inputWrap);
  card.appendChild(btnRow);

  dialog.appendChild(card);
  overlay.appendChild(dialog);

  return {
    overlay,
    closeX,
    okBtn,
    cancelBtn,
    input,
  };
}

function safeCloseModal({ overlay, escOff }) {
  try {
    closeModalOverlay(overlay);
  } catch {
    // ignore
  }
  try {
    if (typeof escOff === "function") escOff();
  } catch {
    // ignore
  }

  if (overlay && overlay.parentNode) {
    overlay.parentNode.removeChild(overlay);
  }
}

async function openModal({
  title = "",
  message = "",
  okText = "확인",
  cancelText = "취소",
  tone = "default", // default | danger
  showCancel = false,
} = {}) {
  // 모달이 연속으로 열릴 때 겹치지 않도록 기존 것을 닫는다.
  if (__activeModal && __activeModal.parentNode) {
    try {
      __activeModal.parentNode.removeChild(__activeModal);
    } catch {
      // ignore
    }
    __activeModal = null;
  }

  const { overlay, closeX, okBtn, cancelBtn } = buildModalDom({
    title,
    message,
    okText,
    cancelText,
    tone,
    showCancel,
  });

  document.body.appendChild(overlay);
  __activeModal = overlay;

  return await new Promise((resolve) => {
    let done = false;
    let escOff = null;

    const finish = (result) => {
      if (done) return;
      done = true;
      __activeModal = null;
      safeCloseModal({ overlay, escOff });
      resolve(result);
    };

    closeX.onclick = () => finish(false);
    if (cancelBtn) cancelBtn.onclick = () => finish(false);
    okBtn.onclick = () => finish(true);

    escOff = registerModalEscClose(overlay, () => finish(false));

    openModalOverlay(overlay);

    // 포커스: 확인 버튼을 기본으로 둔다.
    try {
      okBtn.focus();
    } catch {
      // ignore
    }
  });
}

export async function promptDialog(message, options = {}) {
  const {
    title = "입력",
    okText = "확인",
    cancelText = "취소",
    tone = "default",
    defaultValue = "",
    placeholder = "",
    inputType = "text",
  } = options || {};

  // 모달이 연속으로 열릴 때 겹치지 않도록 기존 것을 닫는다.
  if (__activeModal && __activeModal.parentNode) {
    try {
      __activeModal.parentNode.removeChild(__activeModal);
    } catch {
      // ignore
    }
    __activeModal = null;
  }

  const { overlay, closeX, okBtn, cancelBtn, input } = buildPromptModalDom({
    title,
    message,
    okText,
    cancelText,
    tone,
    defaultValue,
    placeholder,
    inputType,
  });

  document.body.appendChild(overlay);
  __activeModal = overlay;

  return await new Promise((resolve) => {
    let done = false;
    let escOff = null;

    const finish = (result) => {
      if (done) return;
      done = true;
      __activeModal = null;
      safeCloseModal({ overlay, escOff });
      resolve(result);
    };

    closeX.onclick = () => finish(null);
    cancelBtn.onclick = () => finish(null);
    okBtn.onclick = () => finish(String(input.value ?? ""));

    input.addEventListener("keydown", (e) => {
      if (!e) return;
      if (e.key === "Enter") {
        e.preventDefault();
        okBtn.click();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelBtn.click();
      }
    });

    escOff = registerModalEscClose(overlay, () => finish(null));

    openModalOverlay(overlay);

    // 포커스: 입력칸을 기본으로 둔다.
    try {
      input.focus();
      input.select();
    } catch {
      // ignore
    }
  });
}

export async function confirmDialog(message, options = {}) {
  const {
    title = "확인",
    okText = "확인",
    cancelText = "취소",
    tone = "danger",
  } = options || {};

  return await openModal({
    title,
    message,
    okText,
    cancelText,
    tone,
    showCancel: true,
  });
}

export async function alertDialog(message, options = {}) {
  const {
    title = "알림",
    okText = "확인",
    tone = "default",
  } = options || {};

  await openModal({
    title,
    message,
    okText,
    tone,
    showCancel: false,
  });
}

export async function warningDialog(message, options = {}) {
  const {
    title = "안내",
    okText = "확인",
  } = options || {};

  await openModal({
    title,
    message,
    okText,
    tone: "danger",
    showCancel: false,
  });
}

// 전 페이지에서 wrapDirtyClose 등 공용 유틸이 dialogs를 사용할 수 있도록
// window 전역에 최소 API를 설치한다.
export function installGlobalDialogs() {
  if (typeof window === "undefined") return;
  try {
    window.__hallaDialogs = {
      showToast,
      confirmDialog,
      alertDialog,
      warningDialog,
      promptDialog,
    };
  } catch {
    // ignore
  }
}

