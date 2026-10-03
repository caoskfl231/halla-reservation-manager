export function bindPaymentFilters(options = {}) {
  const {
    tabsEl,
    resetFilterBtn,
    qInput,
    dateFromInput,
    dateToInput,
    state,
    setPaymentMethodValue,
    render,
    attachSearchInput,
    initDateFilter,
    dateFilterOptions,
  } = options;

  if (tabsEl) {
    tabsEl.addEventListener("click", async (e) => {
      const btn = e.target.closest("button[data-method]");
      if (!btn) return;
      state.methodTab = btn.dataset.method;
      if (state.methodTab !== "all") {
        if (typeof setPaymentMethodValue === "function") {
          setPaymentMethodValue(state.methodTab);
        }
      }
      await render();
    });
  }

  if (resetFilterBtn) {
    resetFilterBtn.onclick = async () => {
      state.methodTab = "all";
      state.accountFilter = "all";
      if (dateFromInput) dateFromInput.value = "";
      if (dateToInput) dateToInput.value = "";
      if (qInput) qInput.value = "";
      state.dateFrom = "";
      state.dateTo = "";
      state.q = "";
      await render();
    };
  }

  if (qInput) {
    if (typeof attachSearchInput === "function") {
      attachSearchInput(qInput, (keyword) => {
        state.q = keyword || "";
        render();
      });
    } else {
      qInput.oninput = async () => {
        state.q = qInput.value;
        await render();
      };
    }
  }

  if (typeof initDateFilter === "function" && dateFilterOptions) {
    initDateFilter({
      ...dateFilterOptions,
      onApply: ({ from, to, source }) => {
        state.dateFrom = from || "";
        state.dateTo = to || "";
        if (String(source || "").startsWith("init:")) return;
        render();
      },
    });
  }
}
