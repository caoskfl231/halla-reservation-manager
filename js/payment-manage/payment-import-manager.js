import { confirmDialog, showToast, warningDialog } from "../common/dialogs.js?v=app-20261010-14";

export function bindPaymentImportManager(options = {}) {
  const {
    paymentImportResultBody,
    btnPaymentImportParse,
    btnPaymentImportSave,
    btnPaymentImportClose,
    btnPaymentImportDelete,
    btnPaymentImportLedgerPicker,
    openLedgerPicker,
    IMPORT_MODE_NORMAL,
    IMPORT_MODE_TRANSFER,
    getImportRecords,
    setImportRecords,
    setCurrentImportLedgerIndex,
    setCurrentImportCustomerIndex,
    setCustomerPickerMode,
    setImportCustomerFilterType,
    setImportCustomerFilterGroup,
    openPaymentLedgerModalForLedgerSelect,
    openPaymentImportCustomerModal,
    updatePaymentImportCurrentRecord,
    renderPaymentImportTypeList,
    renderPaymentImportGroupList,
    renderPaymentImportCustomerList,
    renderPaymentImportTable,
    parsePaymentImportRaw,
    getSelectedCashflowTypeForEntry,
    getSelectedCashflowItemForEntry,
    setSelectedCashflowTypeForEntry,
    setSelectedCashflowItemForEntry,
    cashflowTypes,
    cashflowItems,
    getCustomers,
    addTransaction,
    putLedgerTx,
    ensureLedgerTxKeys,
    inferLedgerPaymentMethod,
    normalizeVendorName,
    buildLinkedTransactionMemo,
    findSupplierForVendor,
    findCustomerForVendor,
    getImportVendorPrefs,
    setImportVendorPrefs,
    saveImportVendorPrefs,
    render,
    refreshCashflowSummary,
    paymentImportModalManager,
    closePaymentImportModal,
    updatePaymentImportSelectedAccountLabel,
    paymentImportStatus,
    ensureCustomersForPickerLoaded,
    openPaymentDupWarningModal,
    getAllLedgerTx,
    getTransactions,
    deleteLedgerTxById,
    deleteTransaction,
    confirmAnyDuplicateLedgerBatchesBeforeSave,
    confirmAnyDuplicateSimplePaymentTransactionsBeforeSave,
    findAnyDuplicateLedgerBatchesBeforeSave,
    findAnyDuplicateSimplePaymentTransactionsBeforeSave,
  } = options;

  const askDuplicateAction = async (message) => {
    if (typeof openPaymentDupWarningModal === "function") {
      return await openPaymentDupWarningModal({ message });
    }
    const ok = await confirmDialog(String(message || ""), {
      title: "중복 저장 경고",
      okText: "확인",
      cancelText: "취소",
      tone: "danger",
    });
    return ok ? "confirm" : "cancel";
  };

  // =========================
  // Fingerprint (중복 지문)
  // =========================
  const normalizeText = (str = "") =>
    String(str)
      .replace(/\s+/g, "")
      .replace(/[()\-.,]/g, "")
      .trim()
      .toLowerCase();

  const normalizeNumber = (v) => {
    const raw = String(v ?? "")
      .replace(/,/g, "")
      .trim();
    const num = Number(raw || 0);
    return Number.isFinite(num) ? num : 0;
  };

  const normalizeIdToken = (str = "") =>
    String(str)
      .trim()
      .replace(/\s+/g, "")
      .replace(/[^0-9a-zA-Z]/g, "")
      .toUpperCase();

  const normalizeDateTimeKey = (raw) => {
    const s = String(raw || "").trim();
    if (!s) return "";
    const m = s.match(
      /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/, // date + optional time
    );
    if (!m) return s.slice(0, 19);
    const y = m[1];
    const mm = String(m[2]).padStart(2, "0");
    const dd = String(m[3]).padStart(2, "0");
    const date = `${y}-${mm}-${dd}`;
    const hhRaw = m[4];
    if (!hhRaw) return date;
    const hh = String(hhRaw).padStart(2, "0");
    const mi = String(m[5] || "0").padStart(2, "0");
    const ss = String(m[6] || "0").padStart(2, "0");
    return `${date}T${hh}:${mi}:${ss}`;
  };

  const makeLedgerTxFingerprint = (tx) => {
    if (!tx) return "";
    const dateKey = normalizeDateTimeKey(tx.dateTime || tx.date || "");
    const flow = String(tx.flow || "").trim();
    const accountId = String(tx.accountId || "").trim();
    const cashflowItemCode = String(
      tx.cashflowItemCode || tx.cashflowCode || "",
    ).trim();
    const amount = Math.abs(normalizeNumber(tx.amount));
    const vendorKey = normalizeText(tx.vendor || tx.item || "");
    const memoKey = normalizeText(tx.memo || tx.entryMemo || "");
    const partyKey = vendorKey || memoKey;

    const approvalNo = normalizeIdToken(
      tx.approvalNo || tx.receiptNo || tx.referenceNo || tx.tradeNo || "",
    );
    const cardNo = normalizeIdToken(tx.cardNo || "");

    if (!dateKey || !flow || !(amount > 0)) return "";

    // 강한 고유값(승인번호/영수증번호/거래번호 등)이 있으면 최우선으로 사용
    if (approvalNo) {
      return [
        "LEDGER",
        "REF",
        approvalNo,
        cardNo,
      ]
        .filter((v) => v !== "")
        .join("|");
    }

    return [
      "LEDGER",
      "BASE",
      dateKey,
      flow,
      accountId,
      cashflowItemCode,
      String(amount),
      partyKey,
    ]
      .filter((v) => v !== "")
      .join("|");
  };

  const assignLedgerTxFingerprint = (tx) => {
    const fp = makeLedgerTxFingerprint(tx);
    if (!fp) return tx;
    return { ...tx, fingerprint: fp };
  };

  const buildExistingLedgerFingerprintSet = async () => {
    let all = [];
    try {
      all = (await getAllLedgerTx()) || [];
    } catch {
      all = [];
    }

    const set = new Set();
    for (const t of all) {
      if (!t) continue;
      if (String(t.source || "").trim() !== "payment") continue;
      const fp = String(t.fingerprint || "").trim() || makeLedgerTxFingerprint(t);
      if (fp) set.add(fp);
    }
    return set;
  };

  const clearBrowserTextSelection = () => {
    try {
      const sel = window.getSelection && window.getSelection();
      if (sel && typeof sel.removeAllRanges === "function") sel.removeAllRanges();
    } catch {
      // ignore
    }
  };

  const buildDupSummaryMessage = ({ phaseLabel, internalDupCount, dbDupCount }) => {
    const parts = [];
    if (internalDupCount > 0) {
      parts.push(`- 현재 인식 목록 내부 중복: ${internalDupCount}건`);
    }
    if (dbDupCount > 0) {
      parts.push(`- 이미 저장된 거래(원장)와 중복: ${dbDupCount}건`);
    }
    return (
      `중복 후보 감지 (${phaseLabel})\n` +
      `저장 전에 중복 후보를 확인했습니다.\n` +
      `${parts.join("\n") || "- 없음"}\n\n` +
      `중복 후보 행을 목록에서 제거할까요?\n` +
      `- '중복삭제'를 누르면 목록에서 제거 후 저장을 중단합니다.\n` +
      `- '확인'을 누르면 유지(저장 직전에도 다시 검사)합니다.`
    );
  };

  const removeRecordsByIndexSet = (records, idxSet) => {
    const out = [];
    for (let i = 0; i < records.length; i += 1) {
      if (!idxSet.has(i)) out.push(records[i]);
    }
    return out;
  };

  const clearDupFlags = (records) => {
    if (!Array.isArray(records)) return;
    for (const r of records) {
      if (!r || typeof r !== "object") continue;
      delete r._dupCandidate;
      delete r._dupReason;
      delete r._dupReasonLabel;
    }
  };

  const auditImportRecordsByFingerprint = async ({ phaseLabel }) => {
    const importRecords = getImportRecords();
    if (!importRecords || !importRecords.length) return { internalDup: 0, dbDup: 0 };

    // 이전 표시 플래그 초기화
    clearDupFlags(importRecords);

    const selectedTypeCode = String(getSelectedCashflowTypeForEntry?.() || "").trim();
    const selectedItemCode = String(getSelectedCashflowItemForEntry?.() || "").trim();

    // 인식 행 → 저장될 ledger_tx 형태로 최소 변환해서 fingerprint를 만든다.
    const buildCandidateTxForRec = (rec, modeForRow) => {
      const rowMode = modeForRow || rec.mode || IMPORT_MODE_NORMAL;
      const dt = rec.dateTime || rec.date || "";
      const rawMemo = String(rec.memo || "").trim();
      const approvalNo = String(rec.approvalNo || "").trim();
      const cardNo = String(rec.cardNo || "").trim();

      if (rowMode === IMPORT_MODE_TRANSFER) {
        const counterItemCode = String(rec.transferLedgerCode || "").trim();
        const counterItem =
          counterItemCode && Array.isArray(cashflowItems)
            ? cashflowItems.find(
                (it) => String(it?.code || "").trim() === counterItemCode,
              )
            : null;
        const counterTypeCode = String(
          (counterItem && counterItem.typeCode) || rec.transferLedgerTypeCode || "",
        ).trim();
        const baseTypeCode = selectedTypeCode;
        // 이체는 base/counter 2개 레코드가 생김 → 둘 다 검사
        const amount = rec.amount;
        const baseMemo =
          rec.flow === "in"
            ? `[이체입금] ${rawMemo}`.trim()
            : `[이체출금] ${rawMemo}`.trim();
        const counterFlow = rec.flow === "in" ? "out" : "in";
        const counterMemo =
          counterFlow === "in"
            ? `[이체입금] ${rawMemo}`.trim()
            : `[이체출금] ${rawMemo}`.trim();

        const base = {
          date: rec.date,
          dateTime: dt,
          flow: rec.flow,
          eventType: "transfer",
          kind: "이체",
          source: "payment",
          paymentMethod: "",
          accountId: baseTypeCode,
          cashflowItemCode: selectedItemCode,
          amount,
          vendor: rec.vendor || "",
          memo: baseMemo,
          approvalNo,
          cardNo,
        };
        const counter = {
          date: rec.date,
          dateTime: dt,
          flow: counterFlow,
          eventType: "transfer",
          kind: "이체",
          source: "payment",
          paymentMethod: "",
          accountId: counterTypeCode,
          cashflowItemCode: counterItemCode,
          amount,
          vendor: rec.vendor || "",
          memo: counterMemo,
          approvalNo,
          cardNo,
        };
        return [base, counter];
      }

      return [
        {
          date: rec.date,
          dateTime: dt,
          flow: rec.flow,
          eventType: "import",
          kind: "기타",
          source: "payment",
          paymentMethod: "",
          accountId: selectedTypeCode,
          cashflowItemCode: selectedItemCode,
          amount: rec.amount,
          vendor: rec.vendor || "",
          memo: rawMemo,
          approvalNo,
          cardNo,
        },
      ];
    };

    const seen = new Map();
    const internalDupIndexSet = new Set();
    for (let i = 0; i < importRecords.length; i += 1) {
      const rec = importRecords[i];
      const candidates = buildCandidateTxForRec(rec);
      for (const tx of candidates) {
        const fp = makeLedgerTxFingerprint(tx);
        if (!fp) continue;
        if (seen.has(fp)) {
          const firstIdx = seen.get(fp);
          if (firstIdx != null) internalDupIndexSet.add(firstIdx);
          internalDupIndexSet.add(i);
        } else {
          seen.set(fp, i);
        }
      }
    }

    const existingFpSet = await buildExistingLedgerFingerprintSet();
    const dbDupIndexSet = new Set();
    for (let i = 0; i < importRecords.length; i += 1) {
      const rec = importRecords[i];
      const candidates = buildCandidateTxForRec(rec);
      for (const tx of candidates) {
        const fp = makeLedgerTxFingerprint(tx);
        if (fp && existingFpSet.has(fp)) {
          dbDupIndexSet.add(i);
          break;
        }
      }
    }

    const internalDup = internalDupIndexSet.size;
    const dbDup = dbDupIndexSet.size;
    if (!(internalDup || dbDup)) return { internalDup: 0, dbDup: 0 };

    const msg = buildDupSummaryMessage({
      phaseLabel,
      internalDupCount: internalDup,
      dbDupCount: dbDup,
    });

    const choice = await askDuplicateAction(msg);
    if (choice === "delete") {
      // 내부 중복/DB 중복으로 판정된 행을 목록에서 제거하고, 저장은 중단(재클릭 유도)
      const toRemove = new Set([...internalDupIndexSet, ...dbDupIndexSet]);
      const next = removeRecordsByIndexSet(importRecords, toRemove);
      if (typeof setImportRecords === "function") setImportRecords(next);
      if (typeof renderPaymentImportTable === "function") renderPaymentImportTable();
      if (paymentImportStatus) {
        paymentImportStatus.textContent =
          `중복 후보 ${toRemove.size}건을 목록에서 제거했습니다. (저장하려면 다시 저장 버튼을 눌러주세요)`;
      }
      return { internalDup, dbDup, removed: toRemove.size, stopped: true };
    }

    if (choice === "confirm") {
      const markedIndexSet = new Set([...internalDupIndexSet, ...dbDupIndexSet]);

      for (let i = 0; i < importRecords.length; i += 1) {
        const isInternal = internalDupIndexSet.has(i);
        const isDb = dbDupIndexSet.has(i);
        if (!(isInternal || isDb)) continue;

        const rec = importRecords[i];
        if (!rec || typeof rec !== "object") continue;
        rec._dupCandidate = true;
        rec._dupReason = { internal: isInternal, db: isDb };
        rec._dupReasonLabel =
          isInternal && isDb
            ? "목록 내부 중복 + DB 중복"
            : isDb
              ? "DB 중복"
              : "목록 내부 중복";
      }

      if (typeof renderPaymentImportTable === "function") renderPaymentImportTable();

      // 첫 번째 중복 후보로 이동/선택
      const firstIdx = [...markedIndexSet].sort((a, b) => a - b)[0];
      if (firstIdx != null) {
        try {
          if (typeof setSelectedRow === "function") setSelectedRow(firstIdx);
          const tr = paymentImportResultBody?.querySelector(
            `tr[data-index="${firstIdx}"]`,
          );
          if (tr && typeof tr.scrollIntoView === "function") {
            tr.scrollIntoView({ block: "center" });
          }
        } catch {
          // ignore
        }
      }

      if (paymentImportStatus) {
        paymentImportStatus.textContent =
          `중복 후보 ${markedIndexSet.size}건을 표시했습니다. (빨간줄)`;
      }

      return { internalDup, dbDup, marked: true };
    }

    if (paymentImportStatus) {
      paymentImportStatus.textContent =
        `중복 후보가 있습니다. (내부:${internalDup} / DB:${dbDup}) 저장 시 다시 검사합니다.`;
    }
    return { internalDup, dbDup };
  };

  const normalizeLedgerLineSignature = (row) => {
    const flow = String(row?.flow || "").trim();
    const accountId = String(row?.accountId || "").trim();
    const cashflowItemCode = String(row?.cashflowItemCode || "").trim();
    const amount = Math.abs(Number(row?.amount || 0) || 0);
    const vendor = String(row?.vendor || row?.item || "").trim();
    const eventType = String(row?.eventType || "").trim();
    return `${flow}__${accountId}__${cashflowItemCode}__${amount}__${vendor}__${eventType}`;
  };

  const buildLedgerBatchSignature = (rows) => {
    const keys = (rows || [])
      .map(normalizeLedgerLineSignature)
      .filter(Boolean)
      .sort();
    return { sig: keys.join("||"), count: keys.length };
  };

  const findDuplicateLedgerBatchIds = ({ batchRows, existingRows }) => {
    const rows = Array.isArray(batchRows) ? batchRows : [];
    if (!rows.length) return [];
    const { sig: candidateSig, count: candidateCount } = buildLedgerBatchSignature(rows);
    if (!candidateSig || candidateCount <= 0) return [];

    const base = Array.isArray(existingRows) ? existingRows : [];
    if (!base.length) return [];

    const groupMap = new Map();
    for (const t of base) {
      if (!t) continue;
      const groupId = String(t.groupId || "").trim();
      // 후보가 2건 이상(이체 등)인 경우는 groupId가 있는 묶음만 비교 대상으로 본다.
      if (candidateCount > 1 && !groupId) continue;
      const key = groupId ? `GROUP__${groupId}` : `SINGLE__${String(t.id ?? "")}`;
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key).push(t);
    }

    for (const [, list] of groupMap.entries()) {
      if (!list || list.length !== candidateCount) continue;
      const { sig: existingSig } = buildLedgerBatchSignature(list);
      if (existingSig && existingSig === candidateSig) {
        return (list || [])
          .map((t) => t && t.id)
          .filter((id) => id != null);
      }
    }
    return [];
  };

  const findDuplicateSimplePaymentTxIds = ({ candidate, existingRows }) => {
    const c = candidate || {};
    const safeCategory = String(c.category || "").trim();
    const safeType = String(c.type || "").trim();
    const safeSupplierId = String(c.supplierId || "").trim();
    const safeAccount = String(c.accountCode || c.ledgerName || "").trim();
    const safePayment = Math.abs(Number(c.payment || 0) || 0);
    if (!(safePayment > 0)) return [];

    const rows = Array.isArray(existingRows) ? existingRows : [];
    if (!rows.length) return [];

    const ids = [];
    for (const t of rows) {
      if (!t) continue;
      if (safeCategory && String(t.category || "").trim() !== safeCategory) continue;
      if (safeType && String(t.type || "").trim() !== safeType) continue;
      if (safeSupplierId && String(t.supplierId || "").trim() !== safeSupplierId)
        continue;
      const p = Math.abs(Number(t.payment || 0) || 0);
      if (p !== safePayment) continue;
      if (safeAccount) {
        const ledgerName = String(t.ledgerName || "").trim();
        if (!(ledgerName === safeAccount || ledgerName.includes(safeAccount))) continue;
      }
      if (t.id != null) ids.push(t.id);
    }
    return ids;
  };

  let selectedRowIndex = null;

  const applySelectedRowUI = () => {
    if (!paymentImportResultBody) return;
    const rows = paymentImportResultBody.querySelectorAll("tr");
    rows.forEach((tr) => tr.classList.remove("selected"));
    if (!(selectedRowIndex >= 0)) return;
    const selected = paymentImportResultBody.querySelector(
      `tr[data-index="${selectedRowIndex}"]`,
    );
    if (selected) selected.classList.add("selected");
  };

  const clearSelectedRow = () => {
    selectedRowIndex = null;
    applySelectedRowUI();
  };

  const setSelectedRow = (idx) => {
    const importRecords = getImportRecords();
    if (!(idx >= 0 && importRecords && importRecords[idx])) {
      clearSelectedRow();
      return;
    }
    selectedRowIndex = idx;
    applySelectedRowUI();
  };

  if (paymentImportResultBody) {
    // 행 클릭 시: 삭제가 아니라 '선택'만 처리
    paymentImportResultBody.addEventListener("click", (e) => {
      const tr = e.target.closest("tr");
      if (!tr || !paymentImportResultBody.contains(tr)) return;
      const idx = Number(tr.dataset.index || "-1");
      if (!(idx >= 0)) return;
      setSelectedRow(idx);
    });

    // 구분 셀의 <select> 변경 처리 및 항목 선택 버튼 클릭 처리
    paymentImportResultBody.addEventListener("change", (e) => {
      const sel = e.target.closest(".payment-import-mode-select");
      if (!sel) return;
      const idx = Number(sel.dataset.index || "-1");
      const importRecords = getImportRecords();
      if (!(idx >= 0 && importRecords[idx])) return;
      const v = sel.value;
      if (!v) {
        importRecords[idx].mode = "";
      } else if (v === "transfer") {
        importRecords[idx].mode = IMPORT_MODE_TRANSFER;
      } else if (v === "in" || v === "out") {
        // 입금/출금 선택 시, 행의 흐름(flow)도 함께 고정한다.
        importRecords[idx].mode = v;
        importRecords[idx].flow = v;
      }
    });

    paymentImportResultBody.addEventListener("click", async (e) => {
      const btn = e.target.closest(".payment-import-select-customer");
      if (!btn) return;
      const idx = Number(btn.dataset.index || "-1");
      const importRecords = getImportRecords();
      if (!(idx >= 0 && importRecords[idx])) return;
      const rec = importRecords[idx];
      const mode = rec && rec.mode ? rec.mode : IMPORT_MODE_NORMAL;

      if (mode === IMPORT_MODE_TRANSFER) {
        // 이체 모드: 장부 선택 모달(장부 선택 화면) 열기
        if (typeof setCurrentImportLedgerIndex === "function") {
          setCurrentImportLedgerIndex(idx);
        }
        await openPaymentLedgerModalForLedgerSelect();
      } else {
        // 입출금 모드: 기존처럼 거래처 선택 모달(거래처 선택 화면) 열기
        if (typeof setCustomerPickerMode === "function") {
          setCustomerPickerMode("import");
        }
        if (typeof setCurrentImportCustomerIndex === "function") {
          setCurrentImportCustomerIndex(idx);
        }
        const rec2 = importRecords[idx];
        if (typeof setImportCustomerFilterType === "function") {
          setImportCustomerFilterType(rec2.custType || "");
        }
        if (typeof setImportCustomerFilterGroup === "function") {
          setImportCustomerFilterGroup(rec2.custGroup || "");
        }
        updatePaymentImportCurrentRecord(rec2);
        openPaymentImportCustomerModal();
        renderPaymentImportTypeList();
        renderPaymentImportGroupList();
        renderPaymentImportCustomerList();
      }
    });
  }

  if (btnPaymentImportDelete) {
    btnPaymentImportDelete.onclick = () => {
      const importRecords = getImportRecords();
      if (!(selectedRowIndex >= 0) || !importRecords || !importRecords.length) {
        if (paymentImportStatus)
          paymentImportStatus.textContent = "삭제할 행을 먼저 클릭해 선택하세요.";
        return;
      }

      const idx = selectedRowIndex;
      if (!importRecords[idx]) {
        clearSelectedRow();
        if (paymentImportStatus)
          paymentImportStatus.textContent = "삭제할 행을 먼저 클릭해 선택하세요.";
        return;
      }

      const next = importRecords.slice(0, idx).concat(importRecords.slice(idx + 1));
      setImportRecords(next);

      if (typeof setCurrentImportCustomerIndex === "function") {
        setCurrentImportCustomerIndex(null);
      }
      if (typeof setCurrentImportLedgerIndex === "function") {
        setCurrentImportLedgerIndex(null);
      }
      updatePaymentImportCurrentRecord(null);

      // 재렌더 후 선택 유지(가능하면 같은 위치)
      renderPaymentImportTable();
      if (next.length) {
        const nextIdx = Math.min(idx, next.length - 1);
        selectedRowIndex = nextIdx;
        applySelectedRowUI();
      } else {
        clearSelectedRow();
      }
    };
  }

  if (btnPaymentImportParse) {
    btnPaymentImportParse.onclick = async () => {
      clearSelectedRow();
      parsePaymentImportRaw();

      // 1차 차단: 인식 직후 중복 후보 검사
      clearBrowserTextSelection();
      try {
        await auditImportRecordsByFingerprint({ phaseLabel: "인식 직후" });
      } catch (e) {
        // 중복 검사 실패는 인식 결과 표시를 막지 않는다.
        console.warn("중복 후보 검사(인식 직후) 실패:", e);
      }
    };
  }

  if (btnPaymentImportLedgerPicker) {
    btnPaymentImportLedgerPicker.disabled = false;
    btnPaymentImportLedgerPicker.title = "장부 선택";
    btnPaymentImportLedgerPicker.onclick = async () => {
      try {
        await openPaymentLedgerModalForLedgerSelect();
      } catch (e) {
        console.warn("장부 선택 중 오류:", e);
      }
    };
  }

  if (btnPaymentImportSave) {
    btnPaymentImportSave.onclick = async () => {
      if (btnPaymentImportSave) btnPaymentImportSave.disabled = true;
      try {
      const importRecords = getImportRecords();
      if (!importRecords.length) {
        await warningDialog("먼저 인식하기를 눌러 거래를 인식해 주세요.", {
          title: "저장 불가",
        });
        return;
      }

      const selectedTypeCode = String(
        (typeof getSelectedCashflowTypeForEntry === "function"
          ? getSelectedCashflowTypeForEntry()
          : "") || "",
      ).trim();

      const selectedItemCode = String(
        (typeof getSelectedCashflowItemForEntry === "function"
          ? getSelectedCashflowItemForEntry()
          : "") || "",
      ).trim();

      const now = Date.now();

      // 분류/매입처 + 구분/항목(또는 이체 장부)이 모두 완료된 행만 저장하고, 나머지는 남겨둔다.
      const readyRecords = [];
      const pendingRecords = [];

      for (const rec of importRecords) {
        const rowMode =
          rec.mode ||
          (rec.flow === "out" ? "out" : rec.flow === "in" ? "in" : "");
        const hasMode =
          rowMode === IMPORT_MODE_TRANSFER ||
          rowMode === "in" ||
          rowMode === "out";
        let hasTarget = false;
        if (rowMode === IMPORT_MODE_TRANSFER) {
          hasTarget = !!rec.transferLedgerCode;
        } else {
          // 입금/출금(또는 기본값)은 거래처 선택이 되어 있어야 저장 가능
          hasTarget = !!rec.customerId;
        }

        const hasCategory = !!rec.category;
        const needsSupplier = rec.category === "매입결제";
        const hasSupplier = !!rec.supplierId;
        if (
          hasMode &&
          hasTarget &&
          hasCategory &&
          (!needsSupplier || hasSupplier)
        ) {
          readyRecords.push(rec);
        } else {
          pendingRecords.push(rec);
        }
      }

      if (!readyRecords.length) {
        await warningDialog(
          "저장할 줄이 없습니다.\n분류와 (매입결제인 경우 매입처)를 먼저 선택해 주세요.",
          { title: "저장 불가" },
        );
        return;
      }

      const hasTransferRow = readyRecords.some(
        (rec) => String(rec.mode || "") === String(IMPORT_MODE_TRANSFER),
      );
      const hasNormalRow = readyRecords.some(
        (rec) => String(rec.mode || "") !== String(IMPORT_MODE_TRANSFER),
      );

      // 저장을 위해 출금 장부 선택은 필수
      if (hasNormalRow && !selectedItemCode) {
        await warningDialog("저장을 위해 장부를 선택하세요.", { title: "저장 불가" });
        return;
      }

      // 이체도 출금 장부 선택이 필요
      if (hasTransferRow && !selectedItemCode) {
        await warningDialog("이체 저장을 위해 출금 장부를 선택하세요.", {
          title: "저장 불가",
        });
        return;
      }

      if (hasTransferRow && !selectedTypeCode) {
        await warningDialog("이체 저장을 위해 출금 장부를 선택하세요.", {
          title: "저장 불가",
        });
        return;
      }

      const selectedType = (cashflowTypes || []).find(
        (t) => String(t.code || "") === String(selectedTypeCode),
      );
      const typeName =
        selectedType && selectedType.name ? selectedType.name : "";

      // 항목 이름에 따라 지불수단을 대략적으로 추론한다.
      const method =
        typeof inferLedgerPaymentMethod === "function"
          ? inferLedgerPaymentMethod(typeName || selectedTypeCode)
          : "bank";

      // tx.accountId는 코드(A01 등)로 저장 (표준화/필터/중복지문 일관성)
      const accountId = selectedTypeCode;

      const selectedItem =
        selectedItemCode && Array.isArray(cashflowItems)
          ? cashflowItems.find(
              (it) => String(it.code || "").trim() === selectedItemCode,
            )
          : null;
      const selectedItemName = selectedItem
        ? String(selectedItem.name || "").trim()
        : "";
      const selectedCashflowCodeForLedger = selectedItemCode;

      // 2차 차단: 저장 직전 중복 후보 검사
      try {
        const audit = await auditImportRecordsByFingerprint({ phaseLabel: "저장 직전" });
        if (audit && audit.stopped) return;
      } catch (e) {
        console.warn("중복 후보 검사(저장 직전) 실패:", e);
      }

      const ledgerBatches = [];
      const ledgerBatchByReadyIndex = [];
      for (const rec of readyRecords) {
        const rowMode = rec.mode || IMPORT_MODE_NORMAL;
        const isTransferMode = rowMode === IMPORT_MODE_TRANSFER;

        if (isTransferMode && rec.transferLedgerCode && rec.amount > 0) {
          const amount = rec.amount;
          const baseTypeCode = selectedTypeCode;
          const baseTypeName = typeName || selectedTypeCode;
          const baseItemCode = selectedItemCode;
          const baseItemName = selectedItemName || baseTypeName;

          const counterItemCode = String(rec.transferLedgerCode || "").trim();
          const counterItem =
            counterItemCode && Array.isArray(cashflowItems)
              ? cashflowItems.find(
                  (it) => String(it?.code || "").trim() === counterItemCode,
                )
              : null;
          const counterTypeCode = String(
            (counterItem && counterItem.typeCode) || rec.transferLedgerTypeCode || "",
          ).trim();
          const counterType = (cashflowTypes || []).find(
            (t) => String(t.code || "") === String(counterTypeCode),
          );
          const counterTypeName = counterType && counterType.name ? counterType.name : "";
          const counterItemName =
            (counterItem && String(counterItem.name || "").trim()) ||
            String(rec.transferLedgerLabel || "").trim() ||
            counterItemCode;

          const methodBase = inferLedgerPaymentMethod(baseItemName || baseTypeName || baseTypeCode);
          const methodCounter = inferLedgerPaymentMethod(counterItemName || counterTypeName || counterTypeCode);

          const groupId = crypto.randomUUID();
          const counterFlow = rec.flow === "in" ? "out" : "in";

          const txBase = {
            id: "_candidate_",
            date: rec.date,
            flow: rec.flow,
            kind: "이체",
            eventType: "transfer",
            source: "payment",
            paymentMethod: methodBase,
            accountId: baseTypeCode,
            accountName: baseTypeName,
            cashflowCode: baseItemCode,
            cashflowItemCode: baseItemCode,
            cashflowItemName: baseItemName,
            amount,
            vendor: rec.vendor || "",
            item: counterItemName,
            groupId,
            isOrigin: true,
          };
          const txCounter = {
            id: "_candidate_",
            date: rec.date,
            flow: counterFlow,
            kind: "이체",
            eventType: "transfer",
            source: "payment",
            paymentMethod: methodCounter,
            accountId: counterTypeCode,
            accountName: counterTypeName || counterTypeCode,
            cashflowCode: counterItemCode,
            cashflowItemCode: counterItemCode,
            cashflowItemName: counterItemName,
            amount,
            vendor: rec.vendor || "",
            item: baseItemName,
            groupId,
            isOrigin: false,
          };

          ledgerBatches.push([txBase, txCounter]);
          ledgerBatchByReadyIndex.push([txBase, txCounter]);
        } else {
          let eventType = "manual";
          if (rec.flow === "out") {
            eventType =
              rec.category === "매입결제" ? "purchase_payment" : "expense";
          } else if (rec.flow === "in") {
            eventType = rec.category === "입금" ? "sales_receipt" : "manual";
          }

          const tx = {
            id: "_candidate_",
            date: rec.date,
            flow: rec.flow,
            kind: "기타",
            eventType,
            source: "payment",
            paymentMethod: method,
            accountId: selectedTypeCode,
            cashflowItemCode: selectedItemCode,
            amount: rec.amount,
            vendor: rec.vendor || "",
          };
          ledgerBatches.push([tx]);
          ledgerBatchByReadyIndex.push([tx]);
        }
      }

      let ledgerDupInfo = null;
      if (typeof findAnyDuplicateLedgerBatchesBeforeSave === "function") {
        ledgerDupInfo = await findAnyDuplicateLedgerBatchesBeforeSave({
          source: "payment",
          batches: ledgerBatches,
        });
      } else if (typeof confirmAnyDuplicateLedgerBatchesBeforeSave === "function") {
        const ok = await confirmAnyDuplicateLedgerBatchesBeforeSave({
          source: "payment",
          batches: ledgerBatches,
        });
        if (!ok) return;
      }

      let savedCount = 0;

      // 매입 결제 및 화면 표시에 쓸 거래처 정보를 한 번만 불러온다.
      let customers = [];
      try {
        customers = await getCustomers();
      } catch (e) {
        customers = [];
      }
      customers = (customers || []).filter(
        (c) => String(c?.status || "active") === "active",
      );

      const txCandidates = [];
      const baseLedgerName = String(
        selectedItemName || typeName || selectedTypeCode || "",
      ).trim();

      for (let i = 0; i < readyRecords.length; i++) {
        const rec = readyRecords[i];
        const rowMode = rec.mode || IMPORT_MODE_NORMAL;
        const isTransferMode = rowMode === IMPORT_MODE_TRANSFER;
        if (isTransferMode) continue;

        const candidatesForRec = [];

        if (rec.flow === "out" && rec.amount > 0) {
          let supplier = null;
          if (rec.supplierId) {
            supplier = customers.find(
              (c) => String(c.id) === String(rec.supplierId),
            );
          }

          if (!supplier && rec.category === "매입결제") {
            supplier = findSupplierForVendor(customers, rec.vendor);
          }

          if (supplier && String(supplier.type || "").includes("매입")) {
            const c = {
              source: "payment",
              type: "expense",
              category: "purchase",
              date: rec.date,
              supplierId: supplier.id,
              payment: rec.amount,
              accountCode: baseLedgerName,
            };
            txCandidates.push(c);
            candidatesForRec.push(c);
          }

          let expenseCustomer = null;

          if (rec.customerId) {
            expenseCustomer = customers.find(
              (c) => String(c.id) === String(rec.customerId),
            );
          }
          if (!expenseCustomer) {
            expenseCustomer = findCustomerForVendor(customers, rec.vendor);
          }

          if (
            expenseCustomer &&
            String(expenseCustomer.type || "").includes("지출")
          ) {
            const c = {
              source: "payment",
              type: "expense",
              category: "expense",
              date: rec.date,
              supplierId: expenseCustomer.id,
              payment: rec.amount,
              accountCode: baseLedgerName,
            };
            txCandidates.push(c);
            candidatesForRec.push(c);
          }
        }

        if (rec.flow === "in" && rec.amount > 0) {
          let customer = null;

          if (rec.customerId) {
            customer = customers.find(
              (c) => String(c.id) === String(rec.customerId),
            );
          }

          if (!customer) {
            customer = findCustomerForVendor(customers, rec.vendor);
          }

          if (customer && String(customer.type || "").includes("매출")) {
            const c = {
              source: "payment",
              type: "income",
              category: "sales",
              date: rec.date,
              supplierId: customer.id,
              payment: rec.amount,
              accountCode: baseLedgerName,
            };
            txCandidates.push(c);
            candidatesForRec.push(c);
          }
        }

      }

      let txDupInfo = null;
      if (typeof findAnyDuplicateSimplePaymentTransactionsBeforeSave === "function") {
        txDupInfo = await findAnyDuplicateSimplePaymentTransactionsBeforeSave({
          source: "payment",
          candidates: txCandidates,
        });
      } else if (
        typeof confirmAnyDuplicateSimplePaymentTransactionsBeforeSave ===
          "function"
      ) {
        const ok = await confirmAnyDuplicateSimplePaymentTransactionsBeforeSave({
          source: "payment",
          candidates: txCandidates,
        });
        if (!ok) return;
      }

      if (ledgerDupInfo || txDupInfo) {
        const parts = [];
        if (ledgerDupInfo) {
          parts.push(
            `- 원장(입출금): 날짜 ${ledgerDupInfo.date} / ${ledgerDupInfo.count}건`,
          );
        }
        if (txDupInfo) {
          const supplierPart = txDupInfo.supplierId
            ? ` / 거래처:${txDupInfo.supplierId}`
            : "";
          const accountPart = txDupInfo.accountCode
            ? ` / 통장:${txDupInfo.accountCode}`
            : "";
          parts.push(
            `- 연동전표: 날짜 ${txDupInfo.date}${supplierPart}${accountPart} / 금액 ${txDupInfo.payment.toLocaleString()}`,
          );
        }

        const msg =
          `중복 저장 경고\n` +
          `인식 저장 목록에 이미 저장된 내역이 포함될 수 있습니다.\n` +
          `${parts.join("\n")}` +
          `\n\n그래도 전체를 저장할까요?`;

        const choice = await askDuplicateAction(msg);
        if (choice === "cancel") return;

        // 중복삭제: DB 삭제가 아니라, 현재 인식 결과 목록에서 '중복으로 판단되는 행'을 제거하고
        // 저장은 중단(사용자가 다시 저장 버튼 클릭)
        if (choice === "delete") {
          let allLedger = [];
          let allTx = [];
          try {
            allLedger = (await getAllLedgerTx()) || [];
          } catch {
            allLedger = [];
          }
          try {
            allTx = (await getTransactions()) || [];
          } catch {
            allTx = [];
          }

          const baseLedger = (allLedger || []).filter(
            (t) => t && String(t.source || "").trim() === "payment",
          );
          const baseTx = (allTx || []).filter(
            (t) => t && String(t.source || "").trim() === "payment",
          );

          const ledgerByDate = new Map();
          for (const t of baseLedger) {
            const d = String(t?.date || "").trim();
            if (!d) continue;
            if (!ledgerByDate.has(d)) ledgerByDate.set(d, []);
            ledgerByDate.get(d).push(t);
          }

          const txByDate = new Map();
          for (const t of baseTx) {
            const d = String(t?.date || "").trim();
            if (!d) continue;
            if (!txByDate.has(d)) txByDate.set(d, []);
            txByDate.get(d).push(t);
          }

          const dupReadyIndexSet = new Set();
          const ledgerName = String(
            selectedItemName || typeName || selectedTypeCode || "",
          ).trim();

          for (let i = 0; i < readyRecords.length; i++) {
            const rec = readyRecords[i];
            const rowMode = rec.mode || IMPORT_MODE_NORMAL;
            const isTransferMode = rowMode === IMPORT_MODE_TRANSFER;

            const d = String(rec?.date || "").trim();

            // 1) 원장(입출금/이체) 중복이면 해당 행은 중복으로 본다.
            const batch = ledgerBatches[i];
            if (batch && batch.length) {
              const existingRows = d ? ledgerByDate.get(d) || [] : [];
              const dupIds = findDuplicateLedgerBatchIds({
                batchRows: batch,
                existingRows,
              });
              if (dupIds && dupIds.length) {
                dupReadyIndexSet.add(i);
                continue;
              }
            }

            // 2) 연동전표(매입/지출/매출) 중복도 중복으로 본다. (이체는 연동전표 없음)
            if (!isTransferMode) {
              const existingRows = d ? txByDate.get(d) || [] : [];

              if (rec.flow === "out" && rec.amount > 0) {
                let supplier = null;
                if (rec.supplierId) {
                  supplier = customers.find(
                    (c) => String(c.id) === String(rec.supplierId),
                  );
                }
                if (!supplier && rec.category === "매입결제") {
                  supplier = findSupplierForVendor(customers, rec.vendor);
                }
                if (supplier && String(supplier.type || "").includes("매입")) {
                  const ids = findDuplicateSimplePaymentTxIds({
                    candidate: {
                      type: "expense",
                      category: "purchase",
                      supplierId: supplier.id,
                      payment: rec.amount,
                      accountCode: ledgerName,
                    },
                    existingRows,
                  });
                  if (ids && ids.length) {
                    dupReadyIndexSet.add(i);
                    continue;
                  }
                }

                let expenseCustomer = null;
                if (rec.customerId) {
                  expenseCustomer = customers.find(
                    (c) => String(c.id) === String(rec.customerId),
                  );
                }
                if (!expenseCustomer) {
                  expenseCustomer = findCustomerForVendor(customers, rec.vendor);
                }
                if (
                  expenseCustomer &&
                  String(expenseCustomer.type || "").includes("지출")
                ) {
                  const ids = findDuplicateSimplePaymentTxIds({
                    candidate: {
                      type: "expense",
                      category: "expense",
                      supplierId: expenseCustomer.id,
                      payment: rec.amount,
                      accountCode: ledgerName,
                    },
                    existingRows,
                  });
                  if (ids && ids.length) {
                    dupReadyIndexSet.add(i);
                    continue;
                  }
                }
              }

              if (rec.flow === "in" && rec.amount > 0) {
                let customer = null;
                if (rec.customerId) {
                  customer = customers.find(
                    (c) => String(c.id) === String(rec.customerId),
                  );
                }
                if (!customer) {
                  customer = findCustomerForVendor(customers, rec.vendor);
                }
                if (customer && String(customer.type || "").includes("매출")) {
                  const ids = findDuplicateSimplePaymentTxIds({
                    candidate: {
                      type: "income",
                      category: "sales",
                      supplierId: customer.id,
                      payment: rec.amount,
                      accountCode: ledgerName,
                    },
                    existingRows,
                  });
                  if (ids && ids.length) {
                    dupReadyIndexSet.add(i);
                    continue;
                  }
                }
              }
            }
          }

          const removedCount = dupReadyIndexSet.size;
          if (!removedCount) {
            showToast("중복으로 삭제할 행이 없습니다.", { tone: "info" });
            return;
          }

          const nextReady = readyRecords.filter((_, idx) => !dupReadyIndexSet.has(idx));
          const nextAll = nextReady.concat(pendingRecords);
          setImportRecords(nextAll);
          renderPaymentImportTable();
          clearSelectedRow();
          updatePaymentImportCurrentRecord(null);

          if (paymentImportStatus) {
            paymentImportStatus.textContent =
              `중복 ${removedCount}건을 목록에서 삭제했습니다. 이제 '② 인식 결과 저장'을 다시 눌러 저장하세요.`;
          }
          return;
        }
      }

      let importVendorPrefs =
        typeof getImportVendorPrefs === "function"
          ? getImportVendorPrefs()
          : null;
      if (!importVendorPrefs || typeof importVendorPrefs !== "object") {
        importVendorPrefs = {};
        if (typeof setImportVendorPrefs === "function") {
          setImportVendorPrefs(importVendorPrefs);
        }
      }

      for (let readyIndex = 0; readyIndex < readyRecords.length; readyIndex++) {
        const rec = readyRecords[readyIndex];
        const rowMode = rec.mode || IMPORT_MODE_NORMAL;
        const isTransferMode = rowMode === IMPORT_MODE_TRANSFER;

        // 1) 통합 결제(계정별 자금 흐름) DB에 기록

        // 이체 모드 + 행별 장부가 선택된 경우:
        //   선택한 계정(예: A01 법인통장)과 상대 계정(예: A07 카드미수) 양쪽에
        //   각각 한 줄씩 기록해서, 두 장부에서 모두 이체 내역이 보이도록 한다.
        if (isTransferMode && rec.transferLedgerCode && rec.amount > 0) {
          const amount = rec.amount;

          // 기준(출금) 장부: 좌측 하단 장부목록 선택
          const baseTypeCode = selectedTypeCode;
          const baseTypeName = typeName || selectedTypeCode;
          const baseItemCode = selectedItemCode;
          const baseItemName = selectedItemName || baseTypeName || baseItemCode;

          // 상대(입금) 장부: 행별 선택(장부목록 item)
          const counterItemCode = String(rec.transferLedgerCode || "").trim();
          const counterItem =
            counterItemCode && Array.isArray(cashflowItems)
              ? cashflowItems.find(
                  (it) => String(it?.code || "").trim() === counterItemCode,
                )
              : null;
          const counterTypeCode = String(
            (counterItem && counterItem.typeCode) || rec.transferLedgerTypeCode || "",
          ).trim();
          const counterType = (cashflowTypes || []).find(
            (t) => String(t.code || "") === String(counterTypeCode),
          );
          const counterTypeName = counterType && counterType.name ? counterType.name : "";
          const counterItemName =
            (counterItem && String(counterItem.name || "").trim()) ||
            String(rec.transferLedgerLabel || "").trim() ||
            counterItemCode;

          const methodBase = inferLedgerPaymentMethod(
            baseItemName || baseTypeName || baseTypeCode,
          );
          const methodCounter = inferLedgerPaymentMethod(
            counterItemName || counterTypeName || counterTypeCode,
          );

          // 한 건의 이체를 나타내는 공통 그룹 ID
          const groupId = crypto.randomUUID();

          // 기준 계정(예: 법인통장) 기준 이체 내역
          const txBase = {
            id: crypto.randomUUID(),
            date: rec.date,
            dateTime: rec.dateTime || `${rec.date} 00:00:00`,
            flow: rec.flow, // 법인통장에서 보면 입금/출금 방향 그대로 사용
            kind: "이체",
            eventType: "transfer",
            source: "payment",
            paymentMethod: methodBase,
            accountId: baseTypeCode,
            accountName: baseTypeName,
            cashflowCode: baseItemCode,
            cashflowItemCode: baseItemCode,
            cashflowItemName: baseItemName,
            amount,
            vendor: rec.vendor || "",
            // 거래처명 칸에는 상대 계정명(카드미수)을 표시하도록 item 에 저장
            item: counterItemName,
            groupId,
            isOrigin: true,
            memo:
              rec.flow === "in"
                ? `[이체입금] ${`${rec.memo || ""}`.trim()}`.trim()
                : `[이체출금] ${`${rec.memo || ""}`.trim()}`.trim(),
            approvalNo: String(rec.approvalNo || "").trim(),
            cardNo: String(rec.cardNo || "").trim(),
            entryMemo: "",
            preferEntryMemo: false,
            customerId: rec.customerId || "",
            supplierId: rec.supplierId || "",
            createdAt: now,
            updatedAt: now,
          };

          // 상대 계정(예: 카드미수) 기준 이체 내역
          const counterFlow = rec.flow === "in" ? "out" : "in";
          const txCounter = {
            id: crypto.randomUUID(),
            date: rec.date,
            dateTime: rec.dateTime || `${rec.date} 00:00:00`,
            flow: counterFlow,
            kind: "이체",
            eventType: "transfer",
            source: "payment",
            paymentMethod: methodCounter,
            accountId: counterTypeCode,
            accountName: counterTypeName || counterTypeCode,
            cashflowCode: counterItemCode,
            cashflowItemCode: counterItemCode,
            cashflowItemName: counterItemName,
            amount,
            vendor: rec.vendor || "",
            // 거래처명 칸에는 기준 계정명(법인통장)을 표시하도록 item 에 저장
            item: baseItemName,
            groupId,
            isOrigin: false,
            memo:
              counterFlow === "in"
                ? `[이체입금] ${`${rec.memo || ""}`.trim()}`.trim()
                : `[이체출금] ${`${rec.memo || ""}`.trim()}`.trim(),
            approvalNo: String(rec.approvalNo || "").trim(),
            cardNo: String(rec.cardNo || "").trim(),
            entryMemo: "",
            preferEntryMemo: false,
            customerId: rec.customerId || "",
            supplierId: rec.supplierId || "",
            createdAt: now,
            updatedAt: now,
          };

          // 3차 차단: DB unique index(fingerprint) 최종 방어
          const txBaseFinal = ensureLedgerTxKeys(assignLedgerTxFingerprint(txBase));
          const txCounterFinal = ensureLedgerTxKeys(assignLedgerTxFingerprint(txCounter));

          let savedHere = 0;
          try {
            await putLedgerTx(txBaseFinal);
            savedHere += 1;
          } catch (e) {
            if (String(e?.name || "") !== "ConstraintError") throw e;
          }
          try {
            await putLedgerTx(txCounterFinal);
            savedHere += 1;
          } catch (e) {
            if (String(e?.name || "") !== "ConstraintError") throw e;
          }
          savedCount += savedHere;

          // 이체 모드에서도, 벤더별 분류/구분/이체 장부 선택값은 기억해 둔다.
          const key = normalizeVendorName(rec.vendor);
          if (key) {
            const prev = importVendorPrefs[key] || {};
            importVendorPrefs[key] = {
              ...prev,
              category: rec.category || prev.category || "기타",
              supplierId: rec.supplierId || prev.supplierId || "",
              customerId: rec.customerId || prev.customerId || "",
              mode: "transfer",
              transferLedgerItemCode:
                rec.transferLedgerCode || prev.transferLedgerItemCode || "",
              transferLedgerTypeCode:
                rec.transferLedgerTypeCode || prev.transferLedgerTypeCode || "",
              transferLedgerCode:
                rec.transferLedgerCode || prev.transferLedgerCode || "",
              transferLedgerLabel:
                rec.transferLedgerLabel || prev.transferLedgerLabel || "",
            };
          }

          // 이체 모드에서는 매입/지출/매출 자동 연동을 하지 않고, 다음 행으로
          continue;
        }

        // 입출금 모드 또는 이체 모드에서 행별 장부 선택이 없는 경우: 단일 입출금 거래로 처리
        // displayVendor: 인식 결과에서 선택한 거래처명이 있으면 그 이름을, 없으면 원본 벤더명을 사용
        let displayVendor = rec.vendor;
        let chosenCustomer = null;
        if (rec.customerId && customers.length) {
          chosenCustomer = customers.find(
            (c) => String(c.id) === String(rec.customerId),
          );
          if (chosenCustomer && chosenCustomer.name)
            displayVendor = chosenCustomer.name;
        }

        // 항목: 인식 결과에서 선택한 거래처명을 사용 (입출금 모드)
        const itemLabel = displayVendor;

        // 통합결제(Ledger) 쪽 거래 ID를 먼저 생성해 둔다.
        const ledgerId = crypto.randomUUID();

        let eventType = "manual";
        if (rec.flow === "out") {
          eventType =
            rec.category === "매입결제" ? "purchase_payment" : "expense";
        } else if (rec.flow === "in") {
          eventType = rec.category === "입금" ? "sales_receipt" : "manual";
        }

        const tx = {
          id: ledgerId,
          date: rec.date,
          dateTime: rec.dateTime || `${rec.date} 00:00:00`,
          flow: rec.flow,
          kind: "기타",
          eventType,
          source: "payment",
          paymentMethod: method,
          // 장부 코드/이름은 좌측에서 선택한 구분을 그대로 사용
          accountId: selectedTypeCode,
          accountName: typeName || selectedTypeCode,
          // 장부관리(입출금 코드/구분)와 연동되는 잔액 집계용 코드
          cashflowCode: selectedCashflowCodeForLedger,
          cashflowItemCode: selectedItemCode,
          cashflowItemName: selectedItemName,
          // 거래처 선택값을 입출금 내역에도 반영하기 위해, 선택된 거래처 ID를 함께 저장한다.
          // (매입처가 따로 지정된 경우 rec.supplierId, 그 외에는 rec.customerId 를 사용)
          supplierId: rec.supplierId || rec.customerId || "",
          customerId: rec.customerId || "",
          amount: rec.amount,
          // 보낸분/받는분에는 항상 원본 거래내역 이름을 그대로 저장
          vendor: rec.vendor || "",
          item: itemLabel,
          memo: `${rec.memo || ""}`.trim(),
          approvalNo: String(rec.approvalNo || "").trim(),
          cardNo: String(rec.cardNo || "").trim(),
          entryMemo: "",
          preferEntryMemo: false,
          groupId: null,
          isOrigin: null,
          createdAt: now,
          updatedAt: now,
        };
        const txFinal = ensureLedgerTxKeys(assignLedgerTxFingerprint(tx));
        let ledgerSaved = false;
        try {
          await putLedgerTx(txFinal);
          savedCount += 1;
          ledgerSaved = true;
        } catch (e) {
          if (String(e?.name || "") !== "ConstraintError") throw e;
          // fingerprint 유니크 인덱스에 의해 중복 저장이 차단됨
          ledgerSaved = false;
        }

        // 벤더별 분류/매입처/거래처/구분(입출금/이체) 및 이체 장부 선택값을 기억
        const key = normalizeVendorName(rec.vendor);
        if (key) {
          const prev = importVendorPrefs[key] || {};
          importVendorPrefs[key] = {
            ...prev,
            category: rec.category || prev.category || "기타",
            // supplierId(매입처) / customerId(거래처)는 이번에 선택한 값을 우선으로 사용하고,
            // 값이 없으면 기존 매핑을 유지하거나, 둘 다 없으면 제거한다.
            supplierId: rec.supplierId || prev.supplierId || "",
            customerId: rec.customerId || prev.customerId || "",
            mode: isTransferMode ? "transfer" : "normal",
            transferLedgerCode: isTransferMode
              ? rec.transferLedgerCode || prev.transferLedgerCode || ""
              : prev.transferLedgerCode || "",
            transferLedgerLabel: isTransferMode
              ? rec.transferLedgerLabel || prev.transferLedgerLabel || ""
              : prev.transferLedgerLabel || "",
          };
        }

        // 원장 저장이 스킵된(중복) 행은 연동 전표까지 저장하면 불일치가 생기므로 함께 스킵한다.
        if (!ledgerSaved) {
          continue;
        }

        // 2) 출금(out) 건에 한해서, 분류/매입처/지출처 설정에 따라
        //    매입/지출 DB(hallapa_db)에 "결제" 전표로 함께 저장
        if (!isTransferMode && rec.flow === "out" && rec.amount > 0) {
          const baseMemo = buildLinkedTransactionMemo({
            vendor: rec.vendor,
            memo: rec.memo,
          });
          const baseLedgerName = String(
            selectedItemName || typeName || selectedTypeCode || "",
          ).trim();

          // 2-1) 매입 결제: 매입처 기준으로 purchase 전표 생성
          let supplier = null;

          // 우선 사용자가 선택한 매입처(supplierId)를 사용
          if (rec.supplierId) {
            supplier = customers.find(
              (c) => String(c.id) === String(rec.supplierId),
            );
          }

          // 선택된 매입처가 없고, 분류도 매입결제가 아니면 매입 연동 생략
          if (!supplier && rec.category === "매입결제") {
            // 여전히 매입처가 없으면 이름 기반 자동 매칭 시도
            supplier = findSupplierForVendor(customers, rec.vendor);
          }

          if (supplier && String(supplier.type || "").includes("매입")) {
            const paymentTx = {
              type: "expense",
              category: "purchase",
              date: rec.date,
              supplierId: supplier.id,
              supplierName: supplier.name,
              amount: 0,
              payment: rec.amount,
              taxType: "",
              warehouse: "",
              supplierGroup: supplier.group || "미분류",
              ledgerName: baseLedgerName,
              memo: baseMemo,
              source: "payment",
              ledgerTxId: String(ledgerId),
            };
            await addTransaction(paymentTx);
          }

          // 2-2) 지출 결제: 지출처 기준으로 expense 전표 생성
          let expenseCustomer = null;

          if (rec.customerId) {
            expenseCustomer = customers.find(
              (c) => String(c.id) === String(rec.customerId),
            );
          }
          if (!expenseCustomer) {
            expenseCustomer = findCustomerForVendor(customers, rec.vendor);
          }

          if (
            expenseCustomer &&
            String(expenseCustomer.type || "").includes("지출")
          ) {
            const expenseTx = {
              type: "expense",
              category: "expense",
              date: rec.date,
              supplierId: expenseCustomer.id,
              supplierName: expenseCustomer.name,
              amount: 0,
              payment: rec.amount,
              taxType: "",
              warehouse: "",
              supplierGroup: expenseCustomer.group || "미분류",
              ledgerName: baseLedgerName,
              memo: baseMemo,
              source: "payment",
              ledgerTxId: String(ledgerId),
            };
            await addTransaction(expenseTx);
          }
        }

        // 3) 입금(in) 건 중, 매출처(구분에 "매출" 포함)와 매칭된 경우에는
        //    매출 장부(sales)에 계좌이체 내역을 "수금" 전표로 함께 저장한다.
        if (!isTransferMode && rec.flow === "in" && rec.amount > 0) {
          let customer = null;

          if (rec.customerId) {
            customer = customers.find(
              (c) => String(c.id) === String(rec.customerId),
            );
          }

          if (!customer) {
            customer = findCustomerForVendor(customers, rec.vendor);
          }

          if (customer && String(customer.type || "").includes("매출")) {
            const salesTx = {
              type: "income",
              category: "sales",
              date: rec.date,
              supplierId: customer.id,
              supplierName: customer.name,
              amount: 0,
              payment: rec.amount,
              taxType: "",
              warehouse: "",
              supplierGroup: customer.group || "미분류",
              ledgerName: String(
                selectedItemName || typeName || selectedTypeCode || "",
              ).trim(),
              memo: buildLinkedTransactionMemo({
                vendor: rec.vendor,
                memo: rec.memo,
              }),
              source: "payment",
              ledgerTxId: String(ledgerId),
            };
            await addTransaction(salesTx);
          }
        }
      }

      // 변경된 매핑을 localStorage 에 저장
      if (typeof setImportVendorPrefs === "function") {
        setImportVendorPrefs(importVendorPrefs);
      }
      saveImportVendorPrefs();

      const savedMsg = pendingRecords.length
        ? `${savedCount}건 저장, ${pendingRecords.length}건 남음`
        : `${savedCount}건의 거래를 저장했습니다.`;
      showToast(savedMsg, { tone: "success", timeout: 3000 });

      if (typeof setImportRecords === "function") {
        setImportRecords(pendingRecords);
      }
      renderPaymentImportTable();

      const finalRecords =
        typeof getImportRecords === "function"
          ? getImportRecords()
          : pendingRecords;

      if (!finalRecords.length) {
        // 모든 인식 행이 정상 저장된 상태이므로, 모달 닫을 때
        // "변경사항이 저장되지 않았습니다" 경고가 뜨지 않도록
        // 더티 상태를 저장 완료 상태로 초기화한다.
        if (paymentImportModalManager) {
          paymentImportModalManager.markClean();
        }
        closePaymentImportModal();
      }

      // 저장된 건수가 하나라도 있으면, 남은 줄이 있더라도
      // 메인 입출금 내역과 좌측 장부 요약(잔액)을 즉시 다시 계산한다.
      if (savedCount > 0) {
        await render();
        await refreshCashflowSummary();
      }
      } finally {
        if (btnPaymentImportSave) btnPaymentImportSave.disabled = false;
      }
    };
  }

  if (btnPaymentImportClose) {
    btnPaymentImportClose.onclick = () => {
      closePaymentImportModal();
    };
  }
}

