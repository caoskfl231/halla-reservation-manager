export async function loadItemsFromJson(options = {}) {
  const { url = "data/items.json", bulkInsertItems } = options;

  if (typeof bulkInsertItems !== "function") {
    throw new Error("bulkInsertItems is required");
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error("items.json을 불러오지 못했습니다.");
  }
  const data = await res.json();
  const normalized = (data || []).map((it) => {
    const price = Number(it.price ?? 0);
    const percent = Number(it.shrinkPercent ?? 0);
    let shrinkPrice = it.shrinkPrice;

    if (shrinkPrice == null || shrinkPrice === "") {
      if (percent > 0 && percent < 100) {
        const ratio = 1 - percent / 100;
        shrinkPrice = Math.round(price / ratio);
      } else {
        shrinkPrice = price;
      }
    }

    return {
      ...it,
      price,
      shrinkPercent: percent,
      shrinkPrice,
    };
  });

  await bulkInsertItems(normalized);
  return normalized;
}
