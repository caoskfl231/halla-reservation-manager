import { showToast, warningDialog } from "../common/dialogs.js?v=app-20261010-5";
import { resolveDefaultCashflowNameByCode } from "../common/util.js?v=app-20261010-5";

export function bindPaymentForm(options = {}) {
  const {
    paymentForm,
    btnPaymentSaveContinue,
    btnPaymentFormClose,
    getEditId,
    setEditId,
    getSelectedPaymentFlow,
    cashflowTypes,
    cashflowItems,
    getEntryCounterpartyLedgerCode,
    getEntryCounterpartyLedgerLabel,
    resetEntryCounterpartyLedger,
    inferLedgerPaymentMethod,
    ensureLedgerTxKeys,
    putLedgerTx,
    getTransactions,
    deleteTransaction,
    saveVendorTransactionIfMatched,
    saveSalesTransactionIfMatched,
    confirmDuplicateLedgerBatchBeforeSave,
    parseNumber,
    getSelectedOptionText,
    stripCodePrefix,
    todayYMD,
    paymentModalManager,
    render,
    refreshCashflowSummary,
    resetFieldsAndFocus,
    closePaymentModal,
  } = options;

  if (!paymentForm) return;

  const normalizeText = (value) =>
    String(value || "")
      .replace(/\s+/g, "")
      .replace(/[()\-.,]/g, "")
      .trim()
      .toLowerCase();

  const normalizeIdToken = (value) =>
    String(value || "")
      .trim()
      .replace(/\s+/g, "")
      .replace(/[^0-9a-zA-Z]/g, "")
      .toUpperCase();

  const normalizeNumber = (value) => {
    if (typeof value === "number") return value;
    const s = String(value || "").replace(/,/g, "").trim();
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  };

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

  const cashflowItemNameByCode = new Map(
    (Array.isArray(cashflowItems) ? cashflowItems : [])
      .filter((it) => it && it.code)
      .map((it) => [String(it.code).trim(), String(it.name || it.code).trim()]),
  );
  const cashflowTypeNameByCode = new Map(
    (Array.isArray(cashflowTypes) ? cashflowTypes : [])
      .filter((t) => t && t.code)
      .map((t) => [String(t.code).trim(), String(t.name || t.code).trim()]),
  );

  const resolveLedgerLabelFromCode = (code) => {
    const c = String(code || "").trim();
    if (!c) return "";
    if (cashflowItemNameByCode.has(c)) return cashflowItemNameByCode.get(c) || "";
    if (cashflowTypeNameByCode.has(c)) return cashflowTypeNameByCode.get(c) || "";
    return resolveDefaultCashflowNameByCode(c) || "";
  };

  const normalizeLedgerLabel = (seed) => {
    const raw = String(seed || "").trim();
    if (!raw) return "";

    // 1) "A01 법인통장" 같은 라벨은 코드 접두를 먼저 제거
    const stripped =
      typeof stripCodePrefix === "function" ? String(stripCodePrefix(raw) || "").trim() : raw;

    // 2) 제거 후 값이 코드면(또는 원본이 코드면) 마스터 이름으로 매핑
    const mappedFromStripped = resolveLedgerLabelFromCode(stripped);
    if (mappedFromStripped) return String(mappedFromStripped).trim();

    const mappedFromRaw = resolveLedgerLabelFromCode(raw);
    if (mappedFromRaw) return String(mappedFromRaw).trim();

    return stripped || raw;
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

    if (approvalNo) {
      return ["LEDGER", "REF", approvalNo, cardNo]
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
    if (!tx) return tx;
    const fingerprint = makeLedgerTxFingerprint(tx);
    if (!fingerprint) return tx;
    return { ...tx, fingerprint };
  };

  const isConstraintError = (err) => {
    const name = err?.name || "";
    const message = String(err?.message || "");
    return name === "ConstraintError" || message.includes("ConstraintError");
  };

  const submitPaymentEntry = async ({ keepOpen }) => {
    // 입력값 읽기
    const date = document.getElementById("payment-entry-date")?.value || todayYMD();
    const flow = getSelectedPaymentFlow();
    const accountId =
      document.getElementById("payment-ledger-type-code")?.value || "";
    const cashflowItemCode =
      document.getElementById("payment-cashflow-item-code")?.value || "";
    const accountType = (cashflowTypes || []).find(
      (t) => String(t.code || "") === String(accountId),
    );
    const accountName =
      accountType && accountType.name ? String(accountType.name) : "";
    const amountInput = document.getElementById("payment-entry-amount");
    const amount = parseNumber(amountInput?.value || 0);
    const counterpartySelect = document.getElementById("payment-entry-counterparty");
    const vendor =
      stripCodePrefix(getSelectedOptionText(counterpartySelect) || "") || "";
    const counterpartyCodeRaw = String(
      document.getElementById("payment-entry-counterparty-code")?.value ||
        counterpartySelect?.value ||
        "",
    ).trim();
    const isLedgerItemCounterparty = /^A\d{4}$/.test(counterpartyCodeRaw);
    const memoInput = document.getElementById("payment-entry-memo");
    const memo = memoInput?.value || "";
    const now = Date.now();

    if (!amount) {
      await warningDialog("금액을 입력하세요.");
      return;
    }

    if (!accountId) {
      await warningDialog("장부구분이 선택되지 않았습니다.");
      return;
    }

    // 요구사항: 일반 입/출금(거래입력)에서는 좌측 하단 장부목록 선택이 필수
    if (flow !== "transfer" && !String(cashflowItemCode || "").trim()) {
      await warningDialog("좌측 하단 장부목록에서 장부를 선택하세요.");
      return;
    }

    const editId = typeof getEditId === "function" ? getEditId() : null;
    const isEdit = !!editId;

    // 이체: 출금/입금 두 건으로 저장
    if (flow === "transfer") {
      if (isEdit) {
        await warningDialog(
          "이체 거래 수정은 지원하지 않습니다.\n삭제 후 다시 등록해 주세요.",
        );
        return;
      }

      const fromItemCode = String(cashflowItemCode || "").trim();
      const fromItemName = String(
        document.getElementById("payment-cashflow-item-name")?.value || "",
      ).trim();
      if (!fromItemCode) {
        await warningDialog("좌측 하단 장부목록에서 출금 장부를 선택하세요.");
        return;
      }

      const toField = document.getElementById("payment-entry-counterparty");
      const toItemCode = String(toField?.value || "").trim();
      if (!toItemCode) {
        await warningDialog("이체 시 입금 장부를 선택하세요.");
        return;
      }

      if (String(toItemCode) === String(fromItemCode)) {
        await warningDialog("출금 장부와 입금 장부는 같을 수 없습니다.");
        return;
      }

      const toItem =
        toItemCode && Array.isArray(cashflowItems)
          ? cashflowItems.find(
              (it) => String(it.code || "").trim() === String(toItemCode),
            )
          : null;
      const toTypeCode = toItem ? String(toItem.typeCode || "").trim() : "";
      const toType = (cashflowTypes || []).find(
        (t) => String(t.code || "") === String(toTypeCode),
      );
      const toTypeName = toType && toType.name ? String(toType.name) : "";
      const toItemName =
        (toItem && String(toItem.name || "").trim()) ||
        stripCodePrefix(getSelectedOptionText(toField) || "") ||
        toItemCode;

      const methodOut = inferLedgerPaymentMethod(fromItemName || accountName || accountId);
      const methodIn = inferLedgerPaymentMethod(toItemName || toTypeName || toTypeCode);
      const groupId = crypto.randomUUID();
      const memoText = memo.trim();

      const txOut = {
        id: crypto.randomUUID(),
        date,
        flow: "out",
        kind: "이체",
        eventType: "transfer",
        source: "payment",
        paymentMethod: methodOut,
        accountId,
        accountName,
        cashflowCode: fromItemCode,
        cashflowItemCode: fromItemCode,
        cashflowItemName: fromItemName,
        amount,
        vendor: toItemName || toItemCode,
        item: toItemName || toItemCode,
        groupId,
        isOrigin: true,
        memo: `[이체출금] ${memoText}`.trim(),
        entryMemo: memoText,
        preferEntryMemo: true,
        customerId: "",
        supplierId: "",
        createdAt: now,
        updatedAt: now,
      };

      const txIn = {
        id: crypto.randomUUID(),
        date,
        flow: "in",
        kind: "이체",
        eventType: "transfer",
        source: "payment",
        paymentMethod: methodIn,
        accountId: toTypeCode,
        accountName: toTypeName || toTypeCode,
        cashflowCode: toItemCode,
        cashflowItemCode: toItemCode,
        cashflowItemName: toItemName,
        amount,
        vendor: fromItemName || accountName || accountId,
        item: fromItemName || accountName || accountId,
        groupId,
        isOrigin: false,
        memo: `[이체입금] ${memoText}`.trim(),
        entryMemo: memoText,
        preferEntryMemo: true,
        customerId: "",
        supplierId: "",
        createdAt: now,
        updatedAt: now,
      };

      // 동일한 이체(날짜/통장/금액/상대방)가 이미 있으면 저장 전 1회 경고
      if (typeof confirmDuplicateLedgerBatchBeforeSave === "function") {
        const ok = await confirmDuplicateLedgerBatchBeforeSave({
          source: "payment",
          date,
          rows: [txOut, txIn],
        });
        if (!ok) return;
      }

      try {
        await putLedgerTx(ensureLedgerTxKeys(assignLedgerTxFingerprint(txOut)));
        await putLedgerTx(ensureLedgerTxKeys(assignLedgerTxFingerprint(txIn)));
      } catch (err) {
        if (isConstraintError(err)) {
          await warningDialog("이미 동일 거래가 존재합니다. (중복 저장 차단)", {
            title: "중복 저장",
          });
          return;
        }
        throw err;
      }
      if (!keepOpen) showToast("이체 거래가 저장되었습니다.", { tone: "success" });
    } else {
      // 일반 입금/출금
      const method = inferLedgerPaymentMethod(accountName || accountId);
      const id = isEdit ? String(editId) : crypto.randomUUID();
      let eventType = "manual";
      if (flow === "out") {
        eventType = "purchase_payment";
      }

      const wasTransferFromCounterpartyLedger =
        !isEdit &&
        flow === "in" &&
        (getEntryCounterpartyLedgerCode() || isLedgerItemCounterparty);

      if (wasTransferFromCounterpartyLedger) {
        // 1) 정상 경로: 장부 선택 모달을 통해 entryCounterpartyLedgerCode가 세팅된 경우
        // 2) 보호 경로: 거래처 코드가 장부목록(A####)로 들어온 경우(키보드 등으로 select 값만 바뀐 케이스)
        let fromTypeCode = String(getEntryCounterpartyLedgerCode() || "").trim();
        let fromTypeLabel = String(getEntryCounterpartyLedgerLabel() || "").trim();
        let fromItemCode = "";
        let fromItemName = "";

        if (!fromTypeCode && isLedgerItemCounterparty) {
          fromItemCode = counterpartyCodeRaw;
          const fromItem = Array.isArray(cashflowItems)
            ? cashflowItems.find((it) => String(it?.code || "").trim() === fromItemCode)
            : null;
          fromItemName = fromItem ? String(fromItem.name || "").trim() : "";
          fromTypeCode = fromItem ? String(fromItem.typeCode || "").trim() : "";
          const fromType = (cashflowTypes || []).find(
            (t) => String(t.code || "") === String(fromTypeCode),
          );
          fromTypeLabel =
            fromItemName ||
            (fromType && fromType.name ? String(fromType.name) : "") ||
            fromTypeCode ||
            fromItemCode;
        }

        const fromCode = fromTypeCode;
        const fromLabel = fromTypeLabel || fromTypeCode;
        const fromName = stripCodePrefix(fromItemName || fromLabel) || fromItemName || fromLabel || fromCode;
        const toCode = accountId;
        const toLabel = accountName || accountId;
        const toName = stripCodePrefix(toLabel) || toLabel || toCode;

        const methodOut = inferLedgerPaymentMethod(fromLabel || fromCode);
        const methodIn = method;
        const groupId = crypto.randomUUID();
        const memoText = memo.trim();

        const txOut = {
          id: crypto.randomUUID(),
          date,
          flow: "out",
          kind: "이체",
          eventType: "transfer",
          source: "payment",
          paymentMethod: methodOut,
          accountId: fromCode,
          accountName: fromLabel,
          cashflowCode: fromItemCode || fromCode,
          cashflowItemCode: fromItemCode || "",
          cashflowItemName: fromItemName || "",
          amount,
          vendor: toName,
          item: toName,
          groupId,
          isOrigin: true,
          memo: `[이체출금] ${memoText}`.trim(),
          entryMemo: memoText,
          preferEntryMemo: true,
          customerId: "",
          supplierId: "",
          createdAt: now,
          updatedAt: now,
        };

        const txIn = {
          id,
          date,
          flow: "in",
          kind: "이체",
          eventType: "transfer",
          source: "payment",
          paymentMethod: methodIn,
          accountId: toCode,
          accountName: toLabel,
          cashflowCode: toCode,
          cashflowItemCode: String(cashflowItemCode || "").trim(),
          cashflowItemName: String(
            document.getElementById("payment-cashflow-item-name")?.value || "",
          ).trim(),
          amount,
          vendor: fromName,
          item: fromName,
          groupId,
          isOrigin: false,
          memo: `[이체입금] ${memoText}`.trim(),
          entryMemo: memoText,
          preferEntryMemo: true,
          customerId: "",
          supplierId: "",
          createdAt: now,
          updatedAt: now,
        };

        if (typeof confirmDuplicateLedgerBatchBeforeSave === "function") {
          const ok = await confirmDuplicateLedgerBatchBeforeSave({
            source: "payment",
            date,
            rows: [txOut, txIn],
          });
          if (!ok) return;
        }

        try {
          await putLedgerTx(ensureLedgerTxKeys(assignLedgerTxFingerprint(txOut)));
          await putLedgerTx(ensureLedgerTxKeys(assignLedgerTxFingerprint(txIn)));
        } catch (err) {
          if (isConstraintError(err)) {
            await warningDialog("이미 동일 거래가 존재합니다. (중복 저장 차단)", {
              title: "중복 저장",
            });
            return;
          }
          throw err;
        }

        // 이 경우에는 내부 이체이므로 매입/매출 자동 연동은 하지 않는다.
        if (typeof resetEntryCounterpartyLedger === "function") {
          resetEntryCounterpartyLedger();
        }
      } else {
        const cashflowItemName = String(
          document.getElementById("payment-cashflow-item-name")?.value || "",
        ).trim();
        const tx = {
          id,
          date,
          flow,
          kind: "기타",
          eventType,
          source: "payment",
          paymentMethod: method,
          accountId,
          accountName,
          cashflowCode: cashflowItemCode || accountId,
          cashflowItemCode: String(cashflowItemCode || "").trim(),
          cashflowItemName,
          amount,
          vendor,
          item: vendor,
          memo: memo.trim(),
          entryMemo: memo.trim(),
          preferEntryMemo: true,
          customerId: "",
          supplierId: "",
          groupId: null,
          isOrigin: null,
          createdAt: now,
          updatedAt: now,
        };

        // 동일한 입/출금 내역이 이미 있으면 저장 전 1회 경고
        if (typeof confirmDuplicateLedgerBatchBeforeSave === "function") {
          const ok = await confirmDuplicateLedgerBatchBeforeSave({
            source: "payment",
            date,
            rows: [tx],
            ignoreLedgerIds: isEdit ? [id] : [],
          });
          if (!ok) return;
        }

        try {
          await putLedgerTx(ensureLedgerTxKeys(assignLedgerTxFingerprint(tx)));
        } catch (err) {
          if (isConstraintError(err)) {
            await warningDialog("이미 동일 거래가 존재합니다. (중복 저장 차단)", {
              title: "중복 저장",
            });
            return;
          }
          throw err;
        }
      }

      // 매입/매출 자동 연동은 단일 입/출금(tx) 저장 케이스에서만 수행한다.
      if (!(flow === "in" && (getEntryCounterpartyLedgerCode() || isLedgerItemCounterparty))) {
        try {
          const txList = await getTransactions();
          const linked = txList.filter(
            (row) => row.ledgerTxId && String(row.ledgerTxId) === String(id),
          );
          for (const row of linked) {
            await deleteTransaction(row.id);
          }
        } catch (err) {
          console.error("기존 매입 연동 전표 정리 중 오류:", err);
        }

        if (flow === "out") {
          const ledgerLabel = normalizeLedgerLabel(accountName || accountId || "");
          const linkedMemo = memo.trim();
          await saveVendorTransactionIfMatched({
            date,
            amount,
            vendor,
            memo: linkedMemo,
            ledgerName: ledgerLabel,
            ledgerTxId: id,
          });
        } else if (flow === "in") {
          const ledgerLabel = normalizeLedgerLabel(accountName || accountId || "");
          const linkedMemo = memo.trim();
          await saveSalesTransactionIfMatched({
            date,
            amount,
            vendor,
            memo: linkedMemo,
            ledgerName: ledgerLabel,
            ledgerTxId: id,
          });
        }
      }

      if (!keepOpen) {
        if (isEdit) showToast("거래가 수정되었습니다.", { tone: "success" });
        else showToast("거래가 저장되었습니다.", { tone: "success" });
      }
    }

    if (typeof setEditId === "function") setEditId(null);

    if (paymentModalManager) {
      paymentModalManager.markClean();
    }

    await render();
    await refreshCashflowSummary();

    // render/summary 갱신 과정에서 선택값(숨김필드)이 다시 동기화되며
    // dirty로 오인될 수 있으므로, 저장 완료 시점 스냅샷을 다시 잡는다.
    if (paymentModalManager) {
      paymentModalManager.markClean();
    }

    if (keepOpen) {
      resetFieldsAndFocus({
        fields: [
          [amountInput, ""],
          [memoInput, ""],
        ],
        focus: amountInput,
        select: true,
      });

      // 연속 입력은 초기화된 상태를 clean 기준으로 삼는다.
      if (paymentModalManager) {
        paymentModalManager.markClean();
      }
      return;
    }

    closePaymentModal();
  };

  // 수정 모드에서는 Enter를 누르면 "연속"처럼 동작하게 한다.
  // (저장 후 금액/메모 초기화 → 다음 항목을 바로 추가)
  const bindEnterToContinueInEditMode = (inputEl) => {
    if (!inputEl) return;
    inputEl.addEventListener("keydown", async (e) => {
      if (!e) return;
      if (e.key !== "Enter") return;
      if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
      const editId = typeof getEditId === "function" ? getEditId() : null;
      if (!editId) return;
      e.preventDefault();
      await submitPaymentEntry({ keepOpen: true });
    });
  };

  // amount/memo 입력에서 Enter를 눌렀을 때 위 규칙 적용
  try {
    const amountInput = document.getElementById("payment-entry-amount");
    const memoInput = document.getElementById("payment-entry-memo");
    bindEnterToContinueInEditMode(amountInput);
    bindEnterToContinueInEditMode(memoInput);
  } catch {
    // ignore
  }

  paymentForm.onsubmit = async (e) => {
    e.preventDefault();
    await submitPaymentEntry({ keepOpen: false });
  };

  if (btnPaymentSaveContinue) {
    btnPaymentSaveContinue.onclick = async () => {
      await submitPaymentEntry({ keepOpen: true });
    };
  }

  if (btnPaymentFormClose) {
    btnPaymentFormClose.onclick = () => {
      if (typeof setEditId === "function") setEditId(null);
      closePaymentModal();
    };
  }
}

