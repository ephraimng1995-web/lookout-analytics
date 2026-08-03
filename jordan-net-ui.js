(() => {
  "use strict";

  const styleId = "lookout-jordan-net-card-style";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      #ofAccounts .of-stat-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      }
    `;
    document.head.appendChild(style);
  }

  function selectedJordanNet(modelName) {
    try {
      const model = ofData?.models?.find(item => item.name === modelName);
      const rows = (model?.daily || []).filter(
        row => row.date >= ofStart && row.date <= ofEnd
      );

      if (!rows.length) return null;

      const complete = rows.every(
        row =>
          row.jordanNet !== null &&
          row.jordanNet !== undefined &&
          row.jordanNet !== "" &&
          Number.isFinite(Number(row.jordanNet))
      );

      if (!complete) return null;

      return rows.reduce((sum, row) => sum + Number(row.jordanNet), 0);
    } catch {
      return null;
    }
  }

  function money(value) {
    if (value === null) return "—";

    if (typeof ofMoney === "function") {
      return ofMoney(value);
    }

    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: ofData?.currency || "USD",
      minimumFractionDigits: 2
    }).format(value);
  }

  function patchCards() {
    document.querySelectorAll("#ofAccounts .of-account-card").forEach(card => {
      const modelName = card.querySelector(".of-account-head strong")
        ?.textContent
        ?.trim();
      const grid = card.querySelector(".of-stat-grid");
      if (!modelName || !grid) return;

      let jordanMetric = grid.querySelector(".of-jordan-net");
      if (!jordanMetric) {
        jordanMetric = document.createElement("div");
        jordanMetric.className = "of-metric of-jordan-net";
        jordanMetric.innerHTML = "<b>—</b><span>Jordan net</span>";
        const fansMetric = grid.children[2] || null;
        grid.insertBefore(jordanMetric, fansMetric);
      }

      const nextValue = money(selectedJordanNet(modelName));
      const valueNode = jordanMetric.querySelector("b");
      if (valueNode && valueNode.textContent !== nextValue) {
        valueNode.textContent = nextValue;
      }
    });
  }

  const accounts = document.querySelector("#ofAccounts");
  if (accounts) {
    const observer = new MutationObserver(() => {
      window.requestAnimationFrame(patchCards);
    });
    observer.observe(accounts, { childList: true, subtree: true });
  }

  document.addEventListener("change", event => {
    if (event.target.matches("#ofStart, #ofEnd")) {
      window.requestAnimationFrame(patchCards);
    }
  });

  document.addEventListener("click", event => {
    if (event.target.closest("[data-of-model], #ofCurrentMonth")) {
      window.requestAnimationFrame(patchCards);
    }
  });

  window.requestAnimationFrame(patchCards);
})();
