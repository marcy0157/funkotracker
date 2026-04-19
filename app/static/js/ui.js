const UI = (() => {
    function escHtml(str) {
        return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    function statusClass(status) {
        const map = { owned: "owned", wishlist: "wishlist", evaluating: "evaluating", sold: "sold", gifted: "gifted" };
        return map[status] || "none";
    }

    function statusLabel(status) {
        const map = { owned: "Posseduto", wishlist: "Wishlist", evaluating: "Valutando", sold: "Venduto", gifted: "Regalato" };
        return map[status] || "—";
    }

    function buildBadges(item, small = false) {
        const badges = [];
        if (item.is_vaulted) badges.push(`<span class="badge badge-vaulted">Vaulted</span>`);
        if (item.is_chase)   badges.push(`<span class="badge badge-chase">Chase</span>`);
        const event = (item.exclusive_event || "").toUpperCase();
        if (event.includes("SDCC"))         badges.push(`<span class="badge badge-sdcc">SDCC</span>`);
        else if (item.exclusive_retailer || item.exclusive_event)
                                            badges.push(`<span class="badge badge-exclusive">Exclusive</span>`);
        if (item.size && item.size !== "standard")
                                            badges.push(`<span class="badge badge-size">${escHtml(item.size)}</span>`);
        return badges.join("");
    }

    /* ─── Card ─── */
    function renderCard(item) {
        const status = item.status || "none";
        const sc = statusClass(status);
        const badges = buildBadges(item);
        const num = item.box_number ? `#${item.box_number}` : "";
        // col_id: esplicito nelle query collection, assente nel catalogo puro
        const colId   = item.col_id   != null ? item.col_id   : "";
        const funkoId = item.funko_id != null ? item.funko_id : item.id;
        return `
        <div class="funko-card" data-funko-id="${funkoId}" data-col-id="${colId}">
            <div class="card-top-bar ${sc}"></div>
            <div class="card-body">
                <div class="card-number">${escHtml(num)}</div>
                <div class="card-name">${escHtml(item.name)}</div>
                ${item.variant ? `<div class="card-variant">${escHtml(item.variant)}</div>` : ""}
                ${badges ? `<div class="card-badges">${badges}</div>` : ""}
            </div>
            <div class="card-footer">
                ${status !== "none"
                    ? `<span class="pill-status pill-${sc}">${statusLabel(status)}</span>`
                    : `<span class="pill-status pill-none">Nel catalogo</span>`}
                <button class="card-edit-btn" data-action="edit">Modifica</button>
            </div>
        </div>`;
    }

    function groupByFranchise(items) {
        const groups = {};
        for (const item of items) {
            const f = item.franchise || "Altro";
            if (!groups[f]) groups[f] = [];
            groups[f].push(item);
        }
        return groups;
    }

    function renderList(containerId, items) {
        const container = document.getElementById(containerId);
        if (!container) return;
        if (!items.length) {
            container.innerHTML = `<div class="empty-state">
                <div class="empty-state-icon">📦</div>
                <div class="empty-state-text">Nessun Funko trovato</div>
            </div>`;
            return;
        }
        const groups = groupByFranchise(items);
        const franchises = Object.keys(groups).sort();
        container.innerHTML = franchises.map(f => {
            const cards = groups[f].map(renderCard).join("");
            return `<div class="franchise-group" data-franchise="${escHtml(f)}">
                <div class="franchise-header">
                    <span class="franchise-name">${escHtml(f)}</span>
                    <span class="franchise-count">${groups[f].length}</span>
                    <span class="franchise-toggle">▼</span>
                </div>
                <div class="franchise-cards">${cards}</div>
            </div>`;
        }).join("");
    }

    /* ─── Stats ─── */
    function fmt(n) { return `€${Number(n ?? 0).toFixed(2)}`; }

    function renderStats(stats) {
        // Riga owned
        document.getElementById("stat-owned-count").textContent = stats.owned_count ?? 0;
        document.getElementById("stat-owned-paid").textContent  = fmt(stats.owned_paid);
        document.getElementById("stat-owned-value").textContent = fmt(stats.owned_value);
        // Riga wishlist
        document.getElementById("stat-wish-count").textContent  = stats.wishlist_count ?? 0;
        document.getElementById("stat-wish-paid").textContent   = fmt(stats.wishlist_paid);
        document.getElementById("stat-wish-value").textContent  = fmt(stats.wishlist_value);
        // Meta row
        document.getElementById("stat-catalog-val").textContent = stats.totale_catalogo ?? 0;
        document.getElementById("stat-eval-val").textContent    = stats.totale_evaluating ?? 0;
        document.getElementById("stat-vaulted-val").textContent = stats.totale_vaulted_in_collezione ?? 0;
    }

    /* ─── Franchise select ─── */
    function renderFranchiseSelect(selectId, franchises) {
        const sel = document.getElementById(selectId);
        if (!sel) return;
        const current = sel.value;
        sel.innerHTML = '<option value="">Tutte le franchise</option>' +
            franchises.map(f => `<option value="${escHtml(f)}"${f === current ? " selected" : ""}>${escHtml(f)}</option>`).join("");
    }

    /* ─── Detail panel ─── */
    function renderDetailPanel(item) {
        const sc = statusClass(item.status || "none");
        const badges = buildBadges(item);

        const catFields = [
            ["Box #",        item.box_number || "—"],
            ["Series",       item.series || "—"],
            ["Anno",         item.release_year || "—"],
            ["Data rilascio",item.release_date || "—"],
            ["Retailer excl.",item.exclusive_retailer || "—"],
            ["Evento excl.", item.exclusive_event || "—"],
            ["Size",         item.size || "standard"],
            ["Special",      item.special_feature || "—"],
            ["UPC",          item.upc || "—"],
            ["Item #",       item.funko_item_number || "—"],
        ];

        const colFields = [
            ["Status",          statusLabel(item.status)],
            ["Condizione",      item.condition || "—"],
            ["Priorità",        item.priority || "—"],
            ["Prezzo acquisto", item.purchase_price != null ? `€${Number(item.purchase_price).toFixed(2)}` : "—"],
            ["Data acquisto",   item.purchase_date || "—"],
            ["Valore stimato",  item.estimated_value != null ? `€${Number(item.estimated_value).toFixed(2)}` : "—"],
            ["Budget max",      item.max_budget != null ? `€${Number(item.max_budget).toFixed(2)}` : "—"],
            ["Fonte",           item.purchase_source || "—"],
        ];

        const renderRows = (rows) => rows.map(([k, v]) =>
            `<div class="detail-row">
                <span class="detail-key">${k}</span>
                <span class="detail-val">${escHtml(String(v))}</span>
            </div>`).join("");

        const topColor = sc === "none" ? "var(--muted)" : `var(--${sc})`;
        let html = `<div class="detail-top-bar" style="background:${topColor}"></div>`;

        if (item.image_url) {
            html += `<img class="detail-img" src="${escHtml(item.image_url)}" alt="${escHtml(item.name)}" onerror="this.remove()">`;
        }
        html += `
            <div class="detail-number">${item.box_number ? `#${escHtml(item.box_number)}` : ""}</div>
            <div class="detail-name">${escHtml(item.name)}</div>
            <div class="detail-franchise">${escHtml(item.franchise)}${item.variant ? ` · ${escHtml(item.variant)}` : ""}</div>
            ${badges ? `<div class="detail-badges">${badges}</div>` : ""}`;

        if (item.status) {
            html += `<div class="detail-section">
                <div class="detail-section-title">Collezione</div>
                ${renderRows(colFields)}`;
            if (item.purchase_url) {
                html += `<div class="detail-row"><span class="detail-key">Link acquisto</span>
                    <a class="detail-link" href="${escHtml(item.purchase_url)}" target="_blank" rel="noopener">Apri ↗</a></div>`;
            }
            if (item.notes) {
                html += `<div class="detail-row">
                    <span class="detail-key">Note</span>
                    <span class="detail-val" style="font-family:inherit;text-align:right;max-width:65%">${escHtml(item.notes)}</span>
                </div>`;
            }
            html += `</div>`;
        }

        html += `<div class="detail-section">
            <div class="detail-section-title">Catalogo</div>
            ${renderRows(catFields)}`;
        if (item.fandom_url) {
            html += `<div class="detail-row"><span class="detail-key">Fandom</span>
                <a class="detail-link" href="${escHtml(item.fandom_url)}" target="_blank" rel="noopener">Apri ↗</a></div>`;
        }
        if (item.notes && !item.status) {
            html += `<div class="detail-row">
                <span class="detail-key">Note</span>
                <span class="detail-val" style="font-family:inherit;text-align:right;max-width:65%">${escHtml(item.notes)}</span>
            </div>`;
        }
        html += `</div>`;

        document.getElementById("detail-content").innerHTML = html;
    }

    /* ─── Ricerca catalogo (modal step 1) ─── */
    function renderSearchResults(containerId, items, onSelect) {
        const container = document.getElementById(containerId);
        if (!container) return;
        if (!items.length) {
            container.innerHTML = `<div class="search-hint">Nessun risultato trovato</div>`;
            return;
        }
        container.innerHTML = items.map(item => {
            const badges = buildBadges(item);
            const num = item.box_number ? `#${item.box_number}` : "—";
            const sub = [item.franchise, item.series].filter(Boolean).join(" · ");
            return `<div class="search-result-item" data-id="${item.id}">
                <div class="sri-number">${escHtml(num)}</div>
                <div class="sri-info">
                    <div class="sri-name">${escHtml(item.name)}${item.variant ? ` <span style="font-weight:400;color:var(--muted)">· ${escHtml(item.variant)}</span>` : ""}</div>
                    <div class="sri-sub">${escHtml(sub)}</div>
                </div>
                ${badges ? `<div class="sri-badges">${badges}</div>` : ""}
            </div>`;
        }).join("");

        container.querySelectorAll(".search-result-item").forEach(el => {
            el.addEventListener("click", () => {
                const id = parseInt(el.dataset.id);
                const item = items.find(i => i.id === id);
                if (item) onSelect(item);
            });
        });
    }

    /* ─── Preview funko selezionato (modal step 2) ─── */
    function renderSelectedFunkoPreview(containerId, item) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const badges = buildBadges(item);
        const num = item.box_number ? `#${item.box_number}` : "";
        const sub = [item.franchise, item.series, item.variant].filter(Boolean).join(" · ");
        container.innerHTML = `
            <div class="csp-number">${escHtml(num)}</div>
            <div class="csp-info">
                <div class="csp-name">${escHtml(item.name)}</div>
                <div class="csp-sub">${escHtml(sub)}</div>
                ${badges ? `<div class="csp-badges">${badges}</div>` : ""}
            </div>`;
    }

    /* ─── Form helpers (modal catalogo) ─── */
    function fillCatalogForm(form, item) {
        const fields = [
            "box_number", "name", "franchise", "series", "variant",
            "release_year", "release_date", "exclusive_retailer", "exclusive_event",
            "upc", "funko_item_number", "size", "special_feature", "image_url", "fandom_url", "notes"
        ];
        fields.forEach(f => {
            const el = form.elements[f];
            if (!el) return;
            el.value = item[f] ?? "";
        });
        form.elements["is_chase"].checked   = !!item.is_chase;
        form.elements["is_vaulted"].checked = !!item.is_vaulted;
    }

    function readCatalogForm(form) {
        const data = {};
        const textFields = [
            "box_number", "name", "franchise", "series", "variant",
            "release_date", "exclusive_retailer", "exclusive_event",
            "upc", "funko_item_number", "size", "special_feature", "image_url", "fandom_url", "notes"
        ];
        textFields.forEach(f => {
            const el = form.elements[f];
            if (el && el.value !== "") data[f] = el.value;
        });
        const ry = form.elements["release_year"].value;
        if (ry) data.release_year = parseInt(ry);
        data.is_chase   = form.elements["is_chase"].checked ? 1 : 0;
        data.is_vaulted = form.elements["is_vaulted"].checked ? 1 : 0;
        return data;
    }

    /* ─── Form helpers (modal collezione) ─── */
    function fillCollectionForm(form, colEntry) {
        if (!colEntry) return;
        const map = {
            status: "status", condition: "condition", priority: "priority",
            purchase_price: "purchase_price", purchase_date: "purchase_date",
            purchase_source: "purchase_source", purchase_url: "purchase_url",
            estimated_value: "estimated_value", max_budget: "max_budget", notes: "notes"
        };
        Object.entries(map).forEach(([formName, dataName]) => {
            const el = form.elements[formName];
            if (el) el.value = colEntry[dataName] ?? "";
        });
    }

    function readCollectionForm(form) {
        const data = {};
        const textFields = ["status", "condition", "priority", "purchase_date", "purchase_source", "purchase_url", "notes"];
        textFields.forEach(f => {
            const el = form.elements[f];
            if (el && el.value) data[f] = el.value;
        });
        ["purchase_price", "estimated_value", "max_budget"].forEach(f => {
            const el = form.elements[f];
            if (el && el.value !== "") data[f] = parseFloat(el.value);
        });
        return data;
    }

    /* ─── Toast ─── */
    function showToast(msg, type = "success") {
        const container = document.getElementById("toast-container");
        const el = document.createElement("div");
        el.className = `toast ${type}`;
        el.textContent = msg;
        container.appendChild(el);
        setTimeout(() => el.remove(), 3500);
    }

    return {
        renderList, renderStats, renderFranchiseSelect, renderDetailPanel,
        renderSearchResults, renderSelectedFunkoPreview,
        fillCatalogForm, readCatalogForm, fillCollectionForm, readCollectionForm,
        showToast, escHtml, statusClass, statusLabel
    };
})();
