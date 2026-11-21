(function () {
  const G = 9.80665;
  const SHARE_TOL = 0.000001;
  const MAX_SUPPORTS = 30;
  const seriesId = document.documentElement.getAttribute("data-series");
  const S = window.HANCHOU_SERIES && window.HANCHOU_SERIES[seriesId];
  if (!S) return;

  const models = S.models;
  const loads = models.map((m) => m.load);
  const minLoad = Math.min.apply(null, loads);
  const maxLoad = Math.max.apply(null, loads);

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function icon(name) {
    const paths = {
      "arrow-up-right": '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
      "arrow-down": '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
      "arrow-down-to-line": '<path d="M12 17V3"/><path d="m6 11 6 6 6-6"/><path d="M19 21H5"/>',
      download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
      copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
      x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
      "chevron-left": '<path d="m15 18-6-6 6-6"/>',
      "chevron-right": '<path d="m9 18 6-6-6-6"/>',
      "rotate-ccw": '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
      menu: '<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>',
      "sliders-horizontal": '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
    };
    const size = name === "menu" ? 20 : name === "x" ? 20 : 17;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name] || ""}</svg>`;
  }

  function parseNum(v) {
    if (typeof v === "number") return v;
    const s = String(v).trim().replace(/,/g, "");
    if (!s) return NaN;
    return Number(s);
  }
  function nr(n, digits) {
    if (!Number.isFinite(n)) return "—";
    if (digits == null) {
      if (Number.isInteger(n)) return String(n);
      const t = Math.round(n * 1000) / 1000;
      return String(t);
    }
    return n.toFixed(digits).replace(/\.?0+$/, (m) => (m.startsWith(".") ? "" : m));
  }
  function fmtForce(kn) {
    return (Math.round(kn * 1000) / 1000).toFixed(3);
  }
  function fmtPct(p) {
    const a = Math.abs(p);
    if (a < 0.005) return "0%";
    const t = Math.round(p * 100) / 100;
    return t + "%";
  }

  function compute(deviceMass, additionalMass, supports, shares) {
    const errors = [];
    if (!Number.isFinite(deviceMass) || deviceMass <= 0)
      errors.push("设备质量必须是大于 0 的有限数值（kg）。");
    if (!Number.isFinite(additionalMass) || additionalMass < 0)
      errors.push("附加质量必须是大于或等于 0 的有限数值（kg）。");
    if (!Number.isInteger(supports) || supports < 1 || supports > MAX_SUPPORTS)
      errors.push("支撑点数量必须是 1 至 " + MAX_SUPPORTS + " 的整数（应用界面限制）。");
    let uniform = !shares;
    let useShares;
    if (shares) {
      if (!Array.isArray(shares) || shares.length !== supports)
        errors.push("载荷占比数量必须与支撑点数量一致。");
      else {
        let ok = true;
        shares.forEach((s, i) => {
          if (!Number.isFinite(s) || s <= 0 || s > 100) {
            errors.push(`第 ${i + 1} 个支撑点占比必须是大于 0 且不超过 100 的有限数值（%）。`);
            ok = false;
          }
        });
        if (ok) {
          const sum = shares.reduce((a, b) => a + b, 0);
          if (!Number.isFinite(sum) || Math.abs(sum - 100) > SHARE_TOL)
            errors.push("所有支撑点的载荷占比之和必须为 100%（浮点容差 0.000001）。");
          useShares = shares.map((s) => s / 100);
        }
      }
    } else {
      useShares = Array.from({ length: supports }, () => 1 / supports);
    }
    if (errors.length) return { ok: false, errors };
    const totalMass = deviceMass + additionalMass;
    const totalForce = (totalMass * G) / 1000;
    if (!Number.isFinite(totalMass) || !Number.isFinite(totalForce))
      return { ok: false, errors: ["总质量或总载荷力计算溢出，请减小输入质量。"] };
    const points = useShares.map((share, i) => {
      const load = totalMass * share;
      const forceKN = (load * G) / 1000;
      const outOfRange = load < minLoad || load > maxLoad;
      const scored = models
        .map((model) => {
          const difference = load - model.load;
          const deviationPercent = (difference / model.load) * 100;
          return { model, difference, deviationPercent, abs: Math.abs(difference) };
        })
        .sort((a, b) => a.abs - b.abs);
      const best = scored[0].abs;
      const candidates = outOfRange ? [] : scored.filter((c) => Math.abs(c.abs - best) < 1e-9);
      return { index: i + 1, share: share * 100, load, forceKN, outOfRange, candidates };
    });
    return {
      ok: true,
      result: { totalMass, totalForce, points, uniform },
    };
  }

  /* ---------- nav ---------- */
  function setupNav() {
    const links = $$(".desktop-links a, .mobile-links a");
    const sections = ["overview", "engineering", "model", "calculator", "specs"]
      .map((id) => document.getElementById(id))
      .filter(Boolean);
    function setActive() {
      let current = "overview";
      const y = window.scrollY + 120;
      sections.forEach((s) => {
        if (s.offsetTop <= y) current = s.id;
      });
      links.forEach((a) => {
        const href = a.getAttribute("href") || "";
        const on = href === "#" + current;
        a.classList.toggle("active", on);
        const pill = a.querySelector(".nav-pill");
        if (on && !pill) {
          const s = document.createElement("span");
          s.className = "nav-pill";
          a.prepend(s);
        } else if (!on && pill) pill.remove();
      });
    }
    window.addEventListener("scroll", setActive, { passive: true });
    setActive();

    const burger = $(".mobile-menu");
    const mobile = $(".nav-drawer");
    if (burger && mobile) {
      burger.addEventListener("click", () => {
        const open = mobile.classList.toggle("open");
        burger.setAttribute("aria-expanded", String(open));
        burger.setAttribute("aria-label", open ? "关闭菜单" : "打开菜单");
      });
      mobile.querySelectorAll("a").forEach((a) =>
        a.addEventListener("click", () => {
          mobile.classList.remove("open");
          burger.setAttribute("aria-expanded", "false");
        })
      );
    }
    const settingsBtn = $(".settings-button");
    const pop = $(".settings-popover");
    if (settingsBtn && pop) {
      settingsBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const open = pop.classList.toggle("open");
        settingsBtn.setAttribute("aria-expanded", String(open));
      });
      document.addEventListener("click", (e) => {
        if (!pop.contains(e.target) && e.target !== settingsBtn) {
          pop.classList.remove("open");
          settingsBtn.setAttribute("aria-expanded", "false");
        }
      });
    }
  }

  /* ---------- dialog ---------- */
  let dialogIndex = Math.max(0, models.findIndex((m) => /150|160/.test(m.name)));
  if (dialogIndex < 0) dialogIndex = 0;

  function openDialog(index) {
    if (index != null) dialogIndex = index;
    renderDialog();
    const ov = $(".dialog-overlay");
    const dlg = $(".product-dialog");
    ov.hidden = false;
    dlg.hidden = false;
    document.body.classList.add("dialog-open");
    $(".dialog-close")?.focus();
  }
  function closeDialog() {
    $(".dialog-overlay").hidden = true;
    $(".product-dialog").hidden = true;
    document.body.classList.remove("dialog-open");
  }
  function renderDialog() {
    const m = models[dialogIndex];
    const sel = $("#model-select");
    if (sel) sel.value = String(dialogIndex);
    $$(".jw-model-slot").forEach((el, i) => {
      el.innerHTML = i === dialogIndex ? '<span class="mode-tab-bg" style="opacity:1"></span>' : "";
    });
    const detail = $("#model-detail");
    if (!detail) return;
    let specs = "";
    if (S.id === "CHC") {
      specs = `
        <div><dt>最小载荷 P1</dt><dd>${m.p1} kg</dd></div>
        <div><dt>最大载荷 P2</dt><dd>${m.p2} kg</dd></div>
        <div><dt>竖向刚度</dt><dd>${m.k} kg/mm</dd></div>
        <div><dt>外形高度 H</dt><dd>${m.H} mm</dd></div>
        <div><dt>外形直径 D</dt><dd>${m.D} mm</dd></div>
        <div><dt>安装尺寸 D1</dt><dd>${m.D1} mm</dd></div>
        <div><dt>安装螺纹 D3</dt><dd>${m.D3}</dd></div>
        <div><dt>最佳变形</dt><dd>${m.deflection} mm</dd></div>`;
    } else if (S.id === "CHD") {
      specs = `
        <div><dt>最小载荷 P1</dt><dd>${m.p1} kg</dd></div>
        <div><dt>最大载荷 P2</dt><dd>${m.p2} kg</dd></div>
        <div><dt>竖向刚度</dt><dd>${m.k} kg/mm</dd></div>
        <div><dt>外形高度 H</dt><dd>${m.H} mm</dd></div>
        <div><dt>外形直径 D</dt><dd>${m.D} mm</dd></div>
        <div><dt>安装尺寸 D1</dt><dd>${m.D1} mm</dd></div>
        <div><dt>安装尺寸 L1</dt><dd>${m.L1} mm</dd></div>
        <div><dt>安装尺寸 L2</dt><dd>${m.L2} mm</dd></div>
        <div><dt>安装螺纹 D3</dt><dd>${m.D3}</dd></div>
        <div><dt>最佳变形</dt><dd>${m.deflection} mm</dd></div>`;
    } else if (S.id === "JW" || S.id === "JHD") {
      specs = `
        <div><dt>外形高度 H</dt><dd>${m.H} mm</dd></div>
        <div><dt>外形宽度 W</dt><dd>${m.W} mm</dd></div>
        <div><dt>安装螺纹 M</dt><dd>${m.M}</dd></div>
        <div><dt>安装尺寸 L1</dt><dd>${m.L1} mm</dd></div>
        <div><dt>外形长度 L</dt><dd>${m.L} mm</dd></div>
        <div><dt>最佳变形</dt><dd>${m.deflection} mm</dd></div>`;
    } else if (S.id === "JTD" || S.id === "JTE") {
      specs = `
        <div><dt>外形高度 H</dt><dd>${m.H} mm</dd></div>
        <div><dt>安装宽度 W1</dt><dd>${m.W1} mm</dd></div>
        <div><dt>外形宽度 W</dt><dd>${m.W} mm</dd></div>
        <div><dt>安装螺纹 M</dt><dd>${m.M}</dd></div>
        <div><dt>安装尺寸 L1</dt><dd>${m.L1} mm</dd></div>
        <div><dt>外形长度 L</dt><dd>${m.L} mm</dd></div>
        <div><dt>最佳变形</dt><dd>${m.deflection} mm</dd></div>`;
    } else {
      specs = `
        <div><dt>外形高度 H</dt><dd>${m.H} mm</dd></div>
        <div><dt>外形尺寸 D</dt><dd>${m.D} mm</dd></div>
        <div><dt>外形宽度 W</dt><dd>${m.W} mm</dd></div>
        <div><dt>安装螺纹 M</dt><dd>${m.M}</dd></div>
        <div><dt>安装尺寸 C</dt><dd>${m.C} mm</dd></div>
        <div><dt>外形长度 L</dt><dd>${m.L} mm</dd></div>
        <div><dt>最佳变形</dt><dd>${m.deflection} mm</dd></div>`;
    }
    detail.innerHTML = `
      <div class="mono">${m.name}</div>
      <span class="mode-range mono">${m.load} kg</span>
      <span class="mode-unit">最佳载荷 · 非最大承载</span>
      <dl class="jw-dialog-specs">${specs}</dl>`;
  }

  /* ---------- calculator ---------- */
  let uniform = true;

  function fillExample(total, points) {
    // JW 600 kg / 4 点 uses 480 + 120 when total is 600; keep the same demo split when possible
    if (total === 600 && points === 4) {
      $("#device-mass").value = "480";
      $("#additional-mass").value = "120";
    } else {
      $("#device-mass").value = String(total);
      $("#additional-mass").value = "0";
    }
    $("#support-count").value = String(points);
    uniform = true;
    updateSegmented();
    hideShares();
  }

  function updateSegmented() {
    const btns = $$(".calc-segmented button");
    btns[0]?.setAttribute("aria-pressed", String(uniform));
    btns[1]?.setAttribute("aria-pressed", String(!uniform));
    const hint = $("#distribution-hint");
    if (hint) {
      hint.textContent = uniform
        ? "假设各支点承载相同；重心偏移或支撑刚度不同时，请使用实际支点占比。"
        : "输入已知支点占比，总和必须为 100%。这不是自动重心或支点反力计算。";
    }
  }

  function hideShares() {
    const g = $("#share-grid");
    if (g) g.remove();
  }
  function renderShares(n) {
    hideShares();
    const fs = $(".calc-distribution");
    const grid = document.createElement("div");
    grid.id = "share-grid";
    grid.className = "calc-share-grid";
    const even = Math.round((10000 / n)) / 100;
    let remain = 100;
    for (let i = 0; i < n; i++) {
      const v = i === n - 1 ? Math.round((remain) * 100) / 100 : even;
      remain -= v;
      const lab = document.createElement("label");
      lab.className = "calc-share-field";
      lab.innerHTML = `<span>支点 ${i + 1}</span><input type="text" inputmode="decimal" value="${v}" aria-label="支点 ${i + 1} 载荷占比百分比">`;
      grid.appendChild(lab);
    }
    fs.appendChild(grid);
  }

  function readInputs() {
    const device = parseNum($("#device-mass").value);
    const additional = parseNum($("#additional-mass").value);
    const supports = parseNum($("#support-count").value);
    const n = Number.isFinite(supports) ? Math.round(supports) : NaN;
    let shares;
    if (!uniform) {
      shares = $$("#share-grid input").map((el) => parseNum(el.value));
    }
    return { device, additional, supports: n, shares };
  }

  function candidatesHtml(point) {
    if (point.outOfRange) {
      const side = point.load < minLoad ? `低于 ${minLoad} kg` : `高于 ${maxLoad} kg`;
      return `<div class="calc-outside">${side}：不在样册最佳载荷对照区间，暂不推荐型号。</div>`;
    }
    const tie = point.candidates.length > 1;
    return (
      (tie ? `<p class="calc-tie">两型号同等接近；请结合允许载荷与振动条件确认。</p>` : "") +
      point.candidates
        .map((c) => {
          const extra = S.hasMinMax
            ? `<small class="range-note">P1–P2 ${c.model.p1}–${c.model.p2} kg · P 为最佳载荷，P2 为最大载荷</small>`
            : "";
          return `<div class="calc-candidate"><div><span class="mono">${c.model.name}</span><small>最佳载荷 ${c.model.load} kg</small>${extra}</div><p>与最佳载荷差值 <b class="mono">${nr(c.difference)} kg</b><br>相对偏差 <b class="mono">${fmtPct(c.deviationPercent)}</b></p></div>`;
        })
        .join("")
    );
  }

  function resultText(inp, result) {
    const lines = [
      `翰畴隔震 · ${S.letter} 支点载荷计算与型号初选`,
      `设备质量：${nr(inp.device)} kg`,
      `附加质量：${nr(inp.additional)} kg`,
      `总质量：${nr(result.totalMass)} kg`,
      `支点数量：${result.points.length} 个`,
      `分配方式：${result.uniform ? "均匀分配" : "用户提供支点占比"}`,
      "计算：总质量 = 设备质量 + 附加质量；支点质量载荷 = 总质量 × 支点占比。",
      `力换算：F(kN) = m(kg) × ${G} / 1000。`,
    ];
    result.points.forEach((p) => {
      const cand = p.outOfRange
        ? "不在样册最佳载荷对照区间，暂不推荐型号。"
        : p.candidates
            .map(
              (c) =>
                `${c.model.name}（样册最佳载荷 ${c.model.load} kg，差值 ${nr(c.difference)} kg / 偏差 ${fmtPct(c.deviationPercent)}）`
            )
            .join("；");
      lines.push(
        `P${String(p.index).padStart(2, "0")} · 占比 ${nr(p.share, 4)}% · ${nr(p.load, 4)} kg / ${nr(p.forceKN, 4)} kN · ${cand}`
      );
    });
    lines.push("候选按各支点载荷与样册最佳载荷的绝对偏差最小排列，等距时保留全部并列候选。");
    lines.push(`共用样册参数：${S.commonSpecsHtml.replace(/<[^>]+>/g, "")}`);
    lines.push(`数据来源：${S.catalogueTitle}，第${S.page}页。`);
    if (S.hasMinMax)
      lines.push("重要：最佳载荷 P 不等于最大载荷 P2；P2 不是安全裕量；偏差不代表可接受公差。");
    else
      lines.push("重要：最佳载荷不等于最大承载；偏差不代表可接受公差或安全裕量。样册未提供允许载荷区间、动载系数、刚度或效率。");
    lines.push(
      "本工具仅用于静态质量载荷分配和型号初步对照。动载、重心、频率、实际支点反力、安装条件和允许工作载荷必须由技术人员/厂商确认。不得直接据此采购或施工。"
    );
    return lines.join("\n");
  }

  function renderResult(inp, result) {
    const col = $(".calc-results-column");
    const pointsHtml = result.points
      .map((p) => {
        return `<article class="calc-point">
          <div class="calc-point-top">
            <span class="mono">P${String(p.index).padStart(2, "0")} <small>/ ${nr(p.share)}%</small></span>
            <strong class="mono">${nr(p.load)} <small>kg</small></strong>
          </div>
          <span class="calc-point-force mono">${fmtForce(p.forceKN)} kN · 静态质量载荷</span>
          <div class="calc-candidates">${candidatesHtml(p)}</div>
        </article>`;
      })
      .join("");
    const status = `已计算 ${result.points.length} 个支点。${result.points.some((q) => q.outOfRange) ? "存在超出对照区间的支点。" : ""}候选仅为初步对照，需技术确认。`;
    const cautionExtra = S.calcCautionExtra ? S.calcCautionExtra : "";
    col.innerHTML = `
      <div class="panel calc-result">
        <div class="calc-panel-heading"><span class="signal-dot"></span><span class="mono">02 / LOAD BREAKDOWN</span></div>
        <div class="calc-total">
          <span>总运行质量</span>
          <strong class="mono">${nr(result.totalMass)}<small>kg</small></strong>
          <span class="mono">${fmtForce(result.totalForce)} kN · ${result.points.length} 个支点</span>
        </div>
        <div class="calc-point-results" aria-label="各支点计算与候选型号">${pointsHtml}</div>
        <p class="calc-result-rule">候选依据：与样册最佳载荷的绝对偏差最小；不是“向上取整就安全”，也不是最大承载校核。</p>
        <dl class="calc-common-specs">
          <div><dt>最佳变形量</dt><dd class="mono">${S.stats.deflection} mm</dd></div>
          <div><dt>共用外形</dt><dd class="mono">${S.commonSpecsHtml}</dd></div>
        </dl>
        <div class="calc-export">
          <button type="button" class="pill secondary" data-copy>${icon("copy")}复制结果</button>
          <button type="button" class="pill secondary" data-download>${icon("arrow-down-to-line")}下载 TXT</button>
        </div>
      </div>
      <p class="calc-status" aria-live="polite" aria-atomic="true">${status}</p>
      <aside class="calc-caution">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>
        <div>
          <h3>初步对照，不替代工程选型。</h3>
          <p>最佳载荷不等于最大承载；偏差不是允许公差或安全裕量。${cautionExtra}动载、重心、振动频率、实际支点反力和安装条件须由技术人员或厂商复核。</p>
          <a href="${S.pdfHref}" download="${S.pdfDownload}">核对原样册 · 第 ${S.page} 页 ${icon("arrow-down-to-line")}</a>
        </div>
      </aside>`;
    const text = resultText(inp, result);
    col.querySelector("[data-copy]")?.addEventListener("click", () => copyText(text, col));
    col.querySelector("[data-download]")?.addEventListener("click", () => downloadText(text));
  }

  function copyText(text, root) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => flash(root, "计算结果与选型限制已复制。"),
        () => fallbackCopy(text, root)
      );
    } else fallbackCopy(text, root);
  }
  function fallbackCopy(text, root) {
    let ta = root.querySelector(".calc-copy-fallback");
    if (!ta) {
      ta = document.createElement("textarea");
      ta.className = "calc-copy-fallback";
      ta.setAttribute("aria-label", "可手动复制的计算结果文本");
      root.querySelector(".calc-export")?.after(ta);
    }
    ta.value = text;
    ta.hidden = false;
    flash(root, "浏览器未允许自动复制，请在下方长按文本复制，或下载结果。");
  }
  function downloadText(text) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `翰畴隔震-${S.letter}-支点载荷计算.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function flash(root, msg) {
    const s = root.querySelector(".calc-status");
    if (s) s.textContent = msg;
  }

  function showErrors(errors) {
    const box = $("#calc-error");
    if (!box) return;
    box.hidden = false;
    box.innerHTML = `<strong>请修正输入</strong><ul>${errors.map((e) => `<li>${e}</li>`).join("")}</ul>`;
    box.focus?.();
  }
  function clearErrors() {
    const box = $("#calc-error");
    if (box) {
      box.hidden = true;
      box.innerHTML = "";
    }
  }

  function setupCalc() {
    $$(".calc-examples button").forEach((btn, i) => {
      btn.addEventListener("click", () => {
        if (i === 0) fillExample(600, 4);
        else fillExample(1200, 6);
      });
    });
    $$(".calc-segmented button").forEach((btn, i) => {
      btn.addEventListener("click", () => {
        uniform = i === 0;
        updateSegmented();
        if (uniform) hideShares();
        else {
          const n = Math.round(parseNum($("#support-count").value)) || 4;
          renderShares(Math.min(MAX_SUPPORTS, Math.max(1, n)));
        }
      });
    });
    $("#support-count")?.addEventListener("change", () => {
      if (!uniform) {
        const n = Math.round(parseNum($("#support-count").value)) || 4;
        renderShares(Math.min(MAX_SUPPORTS, Math.max(1, n)));
      }
    });
    $(".calc-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const inp = readInputs();
      const out = compute(inp.device, inp.additional, inp.supports, inp.shares);
      if (!out.ok) {
        showErrors(out.errors);
        return;
      }
      clearErrors();
      renderResult(inp, out.result);
    });
    $(".calc-clear")?.addEventListener("click", () => {
      $("#device-mass").value = "480";
      $("#additional-mass").value = "120";
      $("#support-count").value = "4";
      uniform = true;
      updateSegmented();
      hideShares();
      clearErrors();
      // restore empty panel
      location.hash = "#calculator";
      // rebuild empty column without reload of whole page
      const col = $(".calc-results-column");
      const empty = col.getAttribute("data-empty");
      if (empty) col.innerHTML = empty;
    });
    const col = $(".calc-results-column");
    if (col) col.setAttribute("data-empty", col.innerHTML);
  }

  /* ---------- spotlight hover ---------- */
  function setupSpotlight() {
    $$(".spotlight").forEach((el) => {
      el.style.setProperty("--spot-opacity", "0");
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty("--spot-x", e.clientX - r.left + "px");
        el.style.setProperty("--spot-y", e.clientY - r.top + "px");
        el.style.setProperty("--spot-opacity", "0.18");
      });
      el.addEventListener("pointerleave", () => el.style.setProperty("--spot-opacity", "0"));
    });
  }

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-open-dialog]");
    if (t) {
      e.preventDefault();
      openDialog();
    }
    if (e.target.closest("[data-close-dialog], .dialog-overlay")) closeDialog();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDialog();
  });

  setupNav();
  setupCalc();
  setupSpotlight();
  renderDialog();

  $("#model-select")?.addEventListener("change", (e) => {
    dialogIndex = Number(e.target.value);
    renderDialog();
  });
  $("[data-prev-model]")?.addEventListener("click", () => {
    dialogIndex = (dialogIndex + models.length - 1) % models.length;
    renderDialog();
  });
  $("[data-next-model]")?.addEventListener("click", () => {
    dialogIndex = (dialogIndex + 1) % models.length;
    renderDialog();
  });

  window.HANCHOU = { compute, openDialog, S };
})();
