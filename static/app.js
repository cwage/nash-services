const API = window.location.origin;

// Map setup - centered on Nashville
const map = L.map("map").setView([36.16, -86.78], 12);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
}).addTo(map);

// Layer groups for managing markers
let markersLayer = L.layerGroup().addTo(map);
let radiusCircle = null;
let searchMarker = null;

// Field metadata for the current service (aliases, date fields)
let currentFieldMeta = null;

// DOM elements
const serviceSelect = document.getElementById("service-select");
const addressInput = document.getElementById("address-input");
const radiusSlider = document.getElementById("radius-slider");
const radiusInput = document.getElementById("radius-input");
const searchBtn = document.getElementById("search-btn");
const statusEl = document.getElementById("status");
const resultsList = document.getElementById("results-list");

// Keep slider and number input in sync
radiusSlider.addEventListener("input", () => {
    radiusInput.value = radiusSlider.value;
});
radiusInput.addEventListener("input", () => {
    radiusSlider.value = radiusInput.value;
});

// Enable search when both service and address are filled
function checkReady() {
    searchBtn.disabled = !serviceSelect.value || !addressInput.value.trim();
}
serviceSelect.addEventListener("change", checkReady);
addressInput.addEventListener("input", checkReady);

// Enter key triggers search
addressInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !searchBtn.disabled) {
        doSearch();
    }
});
searchBtn.addEventListener("click", doSearch);

// Load services into the dropdown, grouped by category
async function loadServices() {
    try {
        const resp = await fetch(`${API}/services`);
        const data = await resp.json();

        // Group by category
        const groups = {};
        for (const svc of data.services) {
            const cat = svc.category || "Other";
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(svc);
        }

        serviceSelect.innerHTML = '<option value="">Select a dataset...</option>';
        for (const [category, svcs] of Object.entries(groups)) {
            const optgroup = document.createElement("optgroup");
            optgroup.label = category;
            for (const svc of svcs) {
                const opt = document.createElement("option");
                opt.value = svc.name;
                opt.textContent = svc.description || svc.name;
                optgroup.appendChild(opt);
            }
            serviceSelect.appendChild(optgroup);
        }
        checkReady();
    } catch (err) {
        setStatus("Failed to load services", "error");
    }
}

function setStatus(msg, cls) {
    statusEl.textContent = msg;
    statusEl.className = "status" + (cls ? ` ${cls}` : "");
}

function clearMap() {
    markersLayer.clearLayers();
    if (radiusCircle) {
        map.removeLayer(radiusCircle);
        radiusCircle = null;
    }
    if (searchMarker) {
        map.removeLayer(searchMarker);
        searchMarker = null;
    }
    resultsList.innerHTML = "";
}

function formatFieldValue(key, value) {
    if (value === null || value === undefined) return null;
    // ISO date strings
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
        try {
            const d = new Date(value);
            return d.toLocaleString("en-US", {
                timeZone: "America/Chicago",
                dateStyle: "medium",
                timeStyle: "short",
            });
        } catch {
            return value;
        }
    }
    return String(value);
}

function getFieldAlias(fieldName) {
    if (!currentFieldMeta) return fieldName;
    const field = currentFieldMeta.find(f => f.name === fieldName);
    return field ? (field.alias || field.name) : fieldName;
}

function buildPopupContent(record) {
    let html = '<table class="popup-table">';

    // Show distance first if present
    if (record._distance_miles !== undefined) {
        html += `<tr><td>Distance</td><td><strong>${record._distance_miles} mi</strong></td></tr>`;
    }

    // Show all non-internal fields
    for (const [key, value] of Object.entries(record)) {
        if (key.startsWith("_")) continue;
        const formatted = formatFieldValue(key, value);
        if (formatted === null || formatted.trim() === "") continue;
        const alias = getFieldAlias(key);
        html += `<tr><td>${alias}</td><td>${formatted}</td></tr>`;
    }

    html += "</table>";

    // Directions link
    const lat = record._lat;
    const lng = record._lng;
    if (lat && lng) {
        const addr = record._address || `${lat},${lng}`;
        const dest = record._address
            ? encodeURIComponent(record._address + ", Nashville, TN")
            : `${lat},${lng}`;
        html += `<div class="popup-directions">`;
        html += `<a href="https://www.openstreetmap.org/directions?from=&to=${lat},${lng}" target="_blank">Directions (OSM)</a>`;
        html += ` | <a href="https://www.google.com/maps/dir/?api=1&destination=${dest}" target="_blank">Google Maps</a>`;
        html += `</div>`;
    }

    return html;
}

function summarizeRecord(record) {
    // Pick the first 2-3 non-null, non-internal, non-ID fields for a summary line
    const skip = new Set(["OBJECTID", "ObjectId", "GlobalID", "FID", "Shape__Area", "Shape__Length"]);
    const parts = [];
    for (const [key, value] of Object.entries(record)) {
        if (key.startsWith("_")) continue;
        if (skip.has(key)) continue;
        if (value === null || value === undefined) continue;
        const s = String(value).trim();
        if (!s) continue;
        parts.push(s);
        if (parts.length >= 2) break;
    }
    return parts.join(" - ") || "View details";
}

async function doSearch() {
    const service = serviceSelect.value;
    const address = addressInput.value.trim();
    const radius = parseFloat(radiusInput.value) || 2;

    if (!service || !address) return;

    clearMap();
    setStatus("Searching...", "loading");
    searchBtn.disabled = true;

    try {
        // Fetch field metadata and nearby results in parallel
        const [infoResp, nearbyResp] = await Promise.all([
            fetch(`${API}/info/${service}`),
            fetch(`${API}/nearby/${service}?address=${encodeURIComponent(address)}&radius=${radius}&max=1000`),
        ]);

        const info = await infoResp.json();
        const data = await nearbyResp.json();

        if (data.error) {
            setStatus(data.error, "error");
            searchBtn.disabled = false;
            return;
        }

        currentFieldMeta = info.fields || null;

        const center = [data.coordinates.lat, data.coordinates.lng];

        // Add search location marker
        searchMarker = L.marker(center, {
            icon: L.divIcon({
                className: "search-marker",
                html: '<div style="background:#4a9eff;width:14px;height:14px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 6px rgba(0,0,0,0.4);"></div>',
                iconSize: [14, 14],
                iconAnchor: [7, 7],
            }),
            zIndexOffset: 1000,
        }).addTo(map);
        searchMarker.bindPopup(`<strong>Search location</strong><br>${data.query_address}`);

        // Draw radius circle
        const radiusMeters = radius * 1609.34;
        radiusCircle = L.circle(center, {
            radius: radiusMeters,
            color: "#4a9eff",
            fillColor: "#4a9eff",
            fillOpacity: 0.08,
            weight: 2,
            dashArray: "6 4",
        }).addTo(map);

        // Add result markers
        const markers = [];
        for (const record of data.records) {
            if (!record._lat || !record._lng) continue;

            const marker = L.circleMarker([record._lat, record._lng], {
                radius: 7,
                color: "#e74c3c",
                fillColor: "#e74c3c",
                fillOpacity: 0.7,
                weight: 1.5,
            });

            // Tooltip on hover (brief)
            const summary = summarizeRecord(record);
            const distText = record._distance_miles !== undefined
                ? `${record._distance_miles} mi - ` : "";
            marker.bindTooltip(`${distText}${summary}`, { direction: "top", offset: [0, -8] });

            // Popup on click (full details)
            marker.bindPopup(buildPopupContent(record), { maxWidth: 350, maxHeight: 320 });

            marker.addTo(markersLayer);
            markers.push({ marker, record });
        }

        // Fit map to show radius circle (and markers if any)
        if (markers.length > 0) {
            const group = L.featureGroup([radiusCircle, ...markers.map(m => m.marker)]);
            map.fitBounds(group.getBounds().pad(0.1));
        } else {
            map.fitBounds(radiusCircle.getBounds().pad(0.1));
        }

        // Build results list in sidebar
        setStatus(`${data.count} result(s) found (${data.total_fetched} fetched)`);
        resultsList.innerHTML = "";

        for (const { marker, record } of markers) {
            const item = document.createElement("div");
            item.className = "result-item";

            const dist = record._distance_miles !== undefined
                ? `<span class="result-distance">${record._distance_miles} mi</span> ` : "";
            const summary = summarizeRecord(record);
            item.innerHTML = `${dist}<span class="result-summary">${summary}</span>`;

            item.addEventListener("click", () => {
                map.setView([record._lat, record._lng], 16);
                marker.openPopup();
            });

            resultsList.appendChild(item);
        }
    } catch (err) {
        setStatus(`Error: ${err.message}`, "error");
    }

    searchBtn.disabled = false;
    checkReady();
}

// Init
loadServices();
