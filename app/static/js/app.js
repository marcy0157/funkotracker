(() => {
    /* ═══════════════════ STATE ═══════════════════ */
    const state = {
        activeTab: "dashboard",
        franchises: [],
        chipFilters: new Set(),
        // detail panel
        detailItem: null,
        // modal collezione
        colSelectedFunko: null,   // funko scelto nello step 1
        editingColId: null,       // se stiamo modificando una entry esistente
        // modal catalogo
        editingFunkoId: null,     // se stiamo modificando un funko esistente
    };

    /* ═══════════════════ TAB ═══════════════════ */
    function switchTab(tab) {
        state.activeTab = tab;
        document.querySelectorAll(".tab-btn").forEach(b =>
            b.classList.toggle("active", b.dataset.tab === tab));
        document.querySelectorAll(".tab-panel").forEach(p =>
            p.classList.toggle("active", p.id === `tab-${tab}`));
        if (tab === "dashboard") loadDashboard();
        else if (tab === "catalog")  loadCatalog();
        else if (tab === "wishlist") loadWishlist();
        else if (tab === "owned")    loadOwned();
    }

    /* ═══════════════════ LOADERS ═══════════════════ */
    async function loadDashboard() {
        try {
            const stats = await API.getStats();
            UI.renderStats(stats);
        } catch (e) { UI.showToast("Errore stats: " + e.message, "error"); }
    }

    async function loadCatalog() {
        try {
            const search    = document.getElementById("search-catalog").value;
            const franchise = document.getElementById("filter-franchise-catalog").value;
            const params    = { search, franchise };
            if (state.chipFilters.has("is_vaulted")) params.is_vaulted = 1;
            let items = await API.listFunko(params);
            items = applyChipFilter(items);
            UI.renderList("list-catalog", items);
        } catch (e) { UI.showToast("Errore catalogo: " + e.message, "error"); }
    }

    async function loadWishlist() {
        try {
            const search    = document.getElementById("search-wishlist").value;
            const franchise = document.getElementById("filter-franchise-wishlist").value;
            const items     = await API.listCollection({ search, franchise });
            UI.renderList("list-wishlist", items.filter(i => i.status === "wishlist" || i.status === "evaluating"));
        } catch (e) { UI.showToast("Errore wishlist: " + e.message, "error"); }
    }

    async function loadOwned() {
        try {
            const search    = document.getElementById("search-owned").value;
            const franchise = document.getElementById("filter-franchise-owned").value;
            const items     = await API.listCollection({ search, franchise, status: "owned" });
            UI.renderList("list-owned", items);
        } catch (e) { UI.showToast("Errore posseduti: " + e.message, "error"); }
    }

    function applyChipFilter(items) {
        if (!state.chipFilters.size) return items;
        return items.filter(item => {
            for (const f of state.chipFilters) {
                if (f === "is_vaulted"  && item.is_vaulted) return true;
                if (f === "is_chase"    && item.is_chase) return true;
                if (f === "exclusive"   && (item.exclusive_retailer || item.exclusive_event)) return true;
                if (f === "sdcc"        && (item.exclusive_event || "").toUpperCase().includes("SDCC")) return true;
                if (f === "rides"       && item.size === "rides") return true;
                if (f === "2-pack"      && item.size === "2-pack") return true;
            }
            return false;
        });
    }

    async function loadFranchises() {
        try {
            state.franchises = await API.getFranchises();
            UI.renderFranchiseSelect("filter-franchise-catalog", state.franchises);
            UI.renderFranchiseSelect("filter-franchise-wishlist", state.franchises);
            UI.renderFranchiseSelect("filter-franchise-owned", state.franchises);
        } catch (e) { /* silent */ }
    }

    function refreshCurrentTab() {
        const t = state.activeTab;
        if (t === "dashboard") loadDashboard();
        else if (t === "catalog")  loadCatalog();
        else if (t === "wishlist") loadWishlist();
        else if (t === "owned")    loadOwned();
    }

    /* ═══════════════════ DETAIL PANEL ═══════════════════ */
    async function openDetail(funkoId, colId) {
        try {
            const item = colId
                ? await API.getCollectionEntry(colId)
                : await API.getFunko(funkoId);
            state.detailItem   = item;
            state.detailFunkoId = funkoId;
            state.detailColId  = colId;
            UI.renderDetailPanel(item);
            document.getElementById("detail-panel").classList.remove("hidden");
            document.getElementById("detail-overlay").classList.remove("hidden");
        } catch (e) { UI.showToast("Errore dettaglio: " + e.message, "error"); }
    }

    function closeDetail() {
        document.getElementById("detail-panel").classList.add("hidden");
        document.getElementById("detail-overlay").classList.add("hidden");
        state.detailItem = null;
    }

    /* ═══════════════════ MODAL CATALOGO ═══════════════════ */
    function openCatalogModal(funkoItem = null) {
        state.editingFunkoId = funkoItem ? funkoItem.id : null;
        document.getElementById("modal-cat-title").textContent =
            funkoItem ? "Modifica nel catalogo" : "Aggiungi al catalogo";
        const form = document.getElementById("catalog-form");
        form.reset();
        if (funkoItem) UI.fillCatalogForm(form, funkoItem);
        document.getElementById("modal-catalog-overlay").classList.remove("hidden");
    }

    function closeCatalogModal() {
        document.getElementById("modal-catalog-overlay").classList.add("hidden");
        state.editingFunkoId = null;
    }

    async function handleCatalogFormSubmit(e) {
        e.preventDefault();
        const data = UI.readCatalogForm(document.getElementById("catalog-form"));
        try {
            if (state.editingFunkoId) {
                await API.updateFunko(state.editingFunkoId, data);
                UI.showToast("Funko aggiornato nel catalogo");
            } else {
                await API.createFunko(data);
                UI.showToast("Funko aggiunto al catalogo");
            }
            closeCatalogModal();
            await loadFranchises();
            refreshCurrentTab();
        } catch (e) { UI.showToast("Errore salvataggio: " + e.message, "error"); }
    }

    /* ═══════════════════ MODAL COLLEZIONE ═══════════════════ */
    function openCollectionModal() {
        state.colSelectedFunko = null;
        state.editingColId     = null;
        document.getElementById("modal-col-title").textContent    = "Aggiungi alla collezione";
        document.getElementById("modal-col-subtitle").textContent = "Cerca un Funko nel catalogo";
        // reset step 1
        document.getElementById("col-search-input").value = "";
        document.getElementById("col-search-results").innerHTML = `<div class="search-hint">Inizia a digitare per cercare nel catalogo</div>`;
        // reset step 2
        document.getElementById("collection-form").reset();
        // mostra step 1
        showColStep(1);
        document.getElementById("modal-collection-overlay").classList.remove("hidden");
        // focus sulla ricerca
        setTimeout(() => document.getElementById("col-search-input").focus(), 80);
    }

    function closeCollectionModal() {
        document.getElementById("modal-collection-overlay").classList.add("hidden");
        state.colSelectedFunko = null;
        state.editingColId     = null;
    }

    function showColStep(n) {
        document.getElementById("col-step1").classList.toggle("hidden", n !== 1);
        document.getElementById("col-step2").classList.toggle("hidden", n !== 2);
    }

    async function searchCatalog(query) {
        if (!query.trim()) {
            document.getElementById("col-search-results").innerHTML =
                `<div class="search-hint">Inizia a digitare per cercare nel catalogo</div>`;
            return;
        }
        try {
            const items = await API.listFunko({ search: query, per_page: 50 });
            UI.renderSearchResults("col-search-results", items, onFunkoSelected);
        } catch (e) { UI.showToast("Errore ricerca: " + e.message, "error"); }
    }

    function onFunkoSelected(funko) {
        state.colSelectedFunko = funko;
        UI.renderSelectedFunkoPreview("col-selected-preview", funko);
        document.getElementById("collection-form").reset();
        showColStep(2);
    }

    async function handleCollectionFormSubmit(e) {
        e.preventDefault();
        if (!state.colSelectedFunko && !state.editingColId) return;
        const data = UI.readCollectionForm(document.getElementById("collection-form"));
        try {
            if (state.editingColId) {
                await API.updateCollectionEntry(state.editingColId, data);
                UI.showToast("Aggiornato");
            } else {
                data.funko_id = state.colSelectedFunko.id;
                await API.createCollectionEntry(data);
                UI.showToast("Aggiunto alla collezione");
            }
            closeCollectionModal();
            refreshCurrentTab();
            loadDashboard();
        } catch (e) { UI.showToast("Errore salvataggio: " + e.message, "error"); }
    }

    /* ═══════════════════ EDIT/DELETE DAL DETAIL PANEL ═══════════════════ */
    async function handleEditFromDetail() {
        const item = state.detailItem;
        if (!item) return;

        // Determina se è una entry di collezione o un funko puro del catalogo
        const isCollectionEntry = !!item.funko_id; // ha funko_id → viene da my_collection join
        closeDetail();

        if (isCollectionEntry) {
            // Edit entry di collezione: apri il modal collezione a step 2 con dati precompilati
            try {
                const funko = await API.getFunko(item.funko_id);
                state.colSelectedFunko = funko;
                state.editingColId     = item.id;
                document.getElementById("modal-col-title").textContent    = "Modifica nella collezione";
                document.getElementById("modal-col-subtitle").textContent = `${funko.name} · ${funko.franchise}`;
                UI.renderSelectedFunkoPreview("col-selected-preview", funko);
                UI.fillCollectionForm(document.getElementById("collection-form"), item);
                showColStep(2);
                document.getElementById("modal-collection-overlay").classList.remove("hidden");
            } catch (err) { UI.showToast("Errore: " + err.message, "error"); }
        } else {
            // Edit voce del catalogo puro
            openCatalogModal(item);
        }
    }

    async function handleDeleteFromDetail() {
        const item = state.detailItem;
        if (!item) return;
        const isCollectionEntry = !!item.funko_id;

        if (isCollectionEntry) {
            if (!confirm(`Rimuovere "${item.name}" dalla tua collezione?`)) return;
            try {
                await API.deleteCollectionEntry(item.id);
                closeDetail();
                UI.showToast("Rimosso dalla collezione");
                refreshCurrentTab();
                loadDashboard();
            } catch (e) { UI.showToast("Errore: " + e.message, "error"); }
        } else {
            if (!confirm(`Eliminare "${item.name}" dal catalogo? Verranno rimosse anche le entry di collezione associate.`)) return;
            try {
                await API.deleteFunko(item.id);
                closeDetail();
                UI.showToast("Eliminato dal catalogo");
                await loadFranchises();
                refreshCurrentTab();
            } catch (e) { UI.showToast("Errore: " + e.message, "error"); }
        }
    }

    /* ═══════════════════ DELEGAZIONE CLICK CARD ═══════════════════ */
    function handleListClick(e) {
        // Collapse franchise
        const franchiseHeader = e.target.closest(".franchise-header");
        if (franchiseHeader) {
            franchiseHeader.closest(".franchise-group").classList.toggle("collapsed");
            return;
        }

        const card = e.target.closest(".funko-card");
        if (!card) return;

        const funkoId = parseInt(card.dataset.funkoId);
        const colId   = card.dataset.colId ? parseInt(card.dataset.colId) : null;
        const isEdit  = !!e.target.closest(".card-edit-btn");

        if (isEdit) {
            e.stopPropagation();
            // Stessa logica dell'edit dal detail panel, ma senza aprire il panel prima
            if (colId) {
                (async () => {
                    try {
                        const [funko, colEntry] = await Promise.all([
                            API.getFunko(funkoId),
                            API.getCollectionEntry(colId)
                        ]);
                        state.colSelectedFunko = funko;
                        state.editingColId     = colId;
                        document.getElementById("modal-col-title").textContent    = "Modifica nella collezione";
                        document.getElementById("modal-col-subtitle").textContent = `${funko.name} · ${funko.franchise}`;
                        UI.renderSelectedFunkoPreview("col-selected-preview", funko);
                        document.getElementById("collection-form").reset();
                        UI.fillCollectionForm(document.getElementById("collection-form"), colEntry);
                        showColStep(2);
                        document.getElementById("modal-collection-overlay").classList.remove("hidden");
                    } catch (err) { UI.showToast("Errore: " + err.message, "error"); }
                })();
            } else {
                (async () => {
                    try {
                        const funko = await API.getFunko(funkoId);
                        openCatalogModal(funko);
                    } catch (err) { UI.showToast("Errore: " + err.message, "error"); }
                })();
            }
        } else {
            openDetail(funkoId, colId || null);
        }
    }

    /* ═══════════════════ DEBOUNCE ═══════════════════ */
    function debounce(fn, ms) {
        let t;
        return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
    }

    /* ═══════════════════ INIT ═══════════════════ */
    function on(id, event, fn) {
        const el = document.getElementById(id);
        if (el) el.addEventListener(event, fn);
        else console.warn(`[FunkoTracker] elemento #${id} non trovato`);
    }

    function init() {
        // Sanity check: verifica elementi critici
        const REQUIRED_IDS = [
            "btn-add-collection", "btn-add-catalog",
            "modal-catalog-overlay", "modal-collection-overlay",
            "catalog-form", "collection-form",
            "col-search-input", "col-search-results", "col-selected-preview",
            "col-step1", "col-step2",
            "detail-panel", "detail-overlay", "detail-content",
        ];
        REQUIRED_IDS.forEach(id => {
            if (!document.getElementById(id))
                console.error(`[FunkoTracker] MANCANTE: #${id}`);
        });

        // Tab switching — seleziona TUTTI i .tab-btn ovunque nel DOM
        const tabBtns = document.querySelectorAll(".tab-btn[data-tab]");
        console.log(`[FunkoTracker] trovati ${tabBtns.length} tab buttons`);
        tabBtns.forEach(btn => {
            btn.addEventListener("click", () => switchTab(btn.dataset.tab));
        });

        // Bottone aggiungi (collezione)
        on("btn-add-collection", "click", openCollectionModal);

        // Bottone aggiungi (catalogo — dentro la sezione)
        on("btn-add-catalog", "click", () => openCatalogModal());

        // ── Modal catalogo ──
        on("btn-close-modal-catalog", "click", closeCatalogModal);
        on("btn-cancel-catalog",      "click", closeCatalogModal);
        on("catalog-form",            "submit", handleCatalogFormSubmit);
        on("modal-catalog-overlay",   "click", e => {
            if (e.target.id === "modal-catalog-overlay") closeCatalogModal();
        });

        // ── Modal collezione ──
        on("btn-close-modal-collection", "click", closeCollectionModal);
        on("modal-collection-overlay",   "click", e => {
            if (e.target.id === "modal-collection-overlay") closeCollectionModal();
        });
        const debouncedSearch = debounce(q => searchCatalog(q), 300);
        on("col-search-input",  "input",  e => debouncedSearch(e.target.value));
        on("btn-col-back",      "click",  () => showColStep(1));
        on("collection-form",   "submit", handleCollectionFormSubmit);

        // ── Detail panel ──
        on("btn-close-detail", "click", closeDetail);
        on("detail-overlay",   "click", closeDetail);
        on("btn-edit-detail",  "click", handleEditFromDetail);
        on("btn-delete-detail","click", handleDeleteFromDetail);

        // ── Card click delegato ──
        const main = document.querySelector(".main");
        if (main) main.addEventListener("click", handleListClick);

        // ── Filtri catalog ──
        on("search-catalog",           "input",  debounce(loadCatalog, 300));
        on("filter-franchise-catalog", "change", loadCatalog);
        on("chips-catalog", "click", e => {
            const chip = e.target.closest(".chip");
            if (!chip) return;
            const f = chip.dataset.filter;
            state.chipFilters.has(f) ? state.chipFilters.delete(f) : state.chipFilters.add(f);
            chip.classList.toggle("active", state.chipFilters.has(f));
            loadCatalog();
        });

        // ── Filtri wishlist ──
        on("search-wishlist",           "input",  debounce(loadWishlist, 300));
        on("filter-franchise-wishlist", "change", loadWishlist);

        // ── Filtri owned ──
        on("search-owned",           "input",  debounce(loadOwned, 300));
        on("filter-franchise-owned", "change", loadOwned);

        // ── Escape ──
        document.addEventListener("keydown", e => {
            if (e.key !== "Escape") return;
            const catModal = document.getElementById("modal-catalog-overlay");
            const colModal = document.getElementById("modal-collection-overlay");
            if (catModal && !catModal.classList.contains("hidden"))    closeCatalogModal();
            else if (colModal && !colModal.classList.contains("hidden")) closeCollectionModal();
            else closeDetail();
        });

        // ── Boot ──
        loadFranchises();
        loadDashboard();
    }

    document.addEventListener("DOMContentLoaded", init);
})();
