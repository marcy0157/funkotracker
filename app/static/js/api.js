const API = (() => {
    async function request(method, path, body) {
        const opts = {
            method,
            headers: { "Content-Type": "application/json" },
        };
        if (body !== undefined) opts.body = JSON.stringify(body);
        const res = await fetch(path, opts);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        return data;
    }

    return {
        getStats: () => request("GET", "/api/stats"),
        getFranchises: () => request("GET", "/api/franchises"),

        listFunko: (params = {}) => {
            const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== "" && v !== null && v !== undefined));
            return request("GET", `/api/funko?${qs}`);
        },
        getFunko: (id) => request("GET", `/api/funko/${id}`),
        createFunko: (data) => request("POST", "/api/funko", data),
        updateFunko: (id, data) => request("PUT", `/api/funko/${id}`, data),
        deleteFunko: (id) => request("DELETE", `/api/funko/${id}`),

        listCollection: (params = {}) => {
            const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== "" && v !== null && v !== undefined));
            return request("GET", `/api/collection?${qs}`);
        },
        getCollectionEntry: (id) => request("GET", `/api/collection/${id}`),
        createCollectionEntry: (data) => request("POST", "/api/collection", data),
        updateCollectionEntry: (id, data) => request("PUT", `/api/collection/${id}`, data),
        deleteCollectionEntry: (id) => request("DELETE", `/api/collection/${id}`),
    };
})();
