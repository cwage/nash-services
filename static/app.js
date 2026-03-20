const API = window.location.origin;

// Map setup - centered on Nashville
const map = L.map("map").setView([36.16, -86.78], 12);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
}).addTo(map);

// Layer groups for managing markers
function createClusterGroup() {
    return L.markerClusterGroup({
        maxClusterRadius: 40,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        disableClusteringAtZoom: 18,
        iconCreateFunction: function (cluster) {
            const children = cluster.getAllChildMarkers();
            const count = children.length;
            // Use the "hottest" status color in the cluster
            const STATUS_PRIORITY = { live: 3, recent: 2, stale: 1 };
            let hottest = "stale";
            let isPolledCluster = false;
            for (const m of children) {
                const s = m._record_status;
                if (s) {
                    isPolledCluster = true;
                    if ((STATUS_PRIORITY[s] || 0) > (STATUS_PRIORITY[hottest] || 0)) {
                        hottest = s;
                    }
                }
            }
            const colors = {
                live:   { bg: "rgba(231,76,60,0.7)",  ring: "rgba(231,76,60,0.25)" },
                recent: { bg: "rgba(243,156,18,0.7)",  ring: "rgba(243,156,18,0.25)" },
                stale:  { bg: "rgba(149,165,166,0.7)", ring: "rgba(149,165,166,0.25)" },
            };
            const c = isPolledCluster ? (colors[hottest] || colors.stale) : { bg: "rgba(231,76,60,0.7)", ring: "rgba(231,76,60,0.25)" };
            const size = count < 10 ? 36 : count < 50 ? 44 : 52;
            return L.divIcon({
                html: `<div style="background:${c.ring};border-radius:50%;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;"><div style="background:${c.bg};color:#fff;font-weight:600;font-size:12px;border-radius:50%;width:${size - 10}px;height:${size - 10}px;display:flex;align-items:center;justify-content:center;">${count}</div></div>`,
                className: "marker-cluster-custom",
                iconSize: L.point(size, size),
            });
        },
    });
}

let markersLayer = createClusterGroup();
let markersLayerIsClustered = true;
map.addLayer(markersLayer);
let radiusCircle = null;
let searchMarker = null;

// Current result set for viewport filtering
let currentResults = []; // [{ marker, record, item, index }]
let currentUnmapped = []; // [{ record, isPolled, index }]
let lastSearchAddr = "";
let unmappedCount = 0;

// Field metadata for the current service (aliases, date fields)
let currentFieldMeta = null;

// Track which services are polled (for status-based coloring)
const pollableServices = new Set();

// Status -> color mapping (hot to cold)
const STATUS_COLORS = {
    live:   { color: "#e74c3c", fill: "#e74c3c", opacity: 0.85 },  // red
    recent: { color: "#e67e22", fill: "#f39c12", opacity: 0.65 },  // orange
    stale:  { color: "#7f8c8d", fill: "#95a5a6", opacity: 0.45 },  // gray
};
const DEFAULT_COLOR = { color: "#e74c3c", fill: "#e74c3c", opacity: 0.7 };

// Status labels for display
const STATUS_LABELS = { live: "Live", recent: "Recent", stale: "Older" };

// Full service list for filtering
let allServices = [];

// DOM elements
const serviceSearch = document.getElementById("service-search");
const serviceSelect = document.getElementById("service-select");
const serviceDropdown = document.getElementById("service-dropdown");
const serviceSelectedEl = document.getElementById("service-selected");
const addressInput = document.getElementById("address-input");
const radiusSlider = document.getElementById("radius-slider");
const radiusInput = document.getElementById("radius-input");
const dateRangeDiv = document.getElementById("date-range");
const dateFromInput = document.getElementById("date-from");
const dateToInput = document.getElementById("date-to");
const searchBtn = document.getElementById("search-btn");
const statusEl = document.getElementById("status");
const resultsList = document.getElementById("results-list");
const emptyState = document.getElementById("empty-state");
const mapLoading = document.getElementById("map-loading");

// Keep slider and number input in sync, auto-search on change (debounced)
let _radiusSearchTimeout = null;
function debouncedRadiusSearch() {
    clearTimeout(_radiusSearchTimeout);
    _radiusSearchTimeout = setTimeout(() => {
        if (serviceSelect.value && addressInput.value.trim()) doSearch();
    }, 300);
}
radiusSlider.addEventListener("input", () => {
    radiusInput.value = radiusSlider.value;
});
radiusSlider.addEventListener("change", debouncedRadiusSearch);
radiusInput.addEventListener("input", () => {
    radiusSlider.value = radiusInput.value;
});
radiusInput.addEventListener("change", debouncedRadiusSearch);

// Track which services have date fields (populated on info fetch)
const servicesWithDates = new Set();

// Enable search when both service and address are filled
function checkReady() {
    const hasService = !!serviceSelect.value;
    const hasAddress = !!addressInput.value.trim();
    searchBtn.disabled = !hasService || !hasAddress;
    // Highlight address field when it's the only thing blocking search
    addressInput.classList.toggle("input-required", hasService && !hasAddress);
}
serviceSelect.addEventListener("change", () => {
    checkReady();
    updateDateRange();
});
addressInput.addEventListener("input", checkReady);

async function updateDateRange(preserveDates = false) {
    const service = serviceSelect.value;
    if (!service) {
        dateRangeDiv.style.display = "none";
        return;
    }
    try {
        const resp = await fetch(`${API}/info/${service}`);
        const info = await resp.json();
        if (!info.date_field) {
            dateRangeDiv.style.display = "none";
            dateFromInput.value = "";
            dateToInput.value = "";
            dateFromInput.min = "";
            dateFromInput.max = "";
            dateToInput.min = "";
            dateToInput.max = "";
            return;
        }
        servicesWithDates.add(service);
        const dateField = info.date_field;

        // Query ArcGIS for min/max date
        const statsUrl = `https://services2.arcgis.com/HdTo6HJqh92wn4D8/arcgis/rest/services/${service}/FeatureServer/0/query?where=1%3D1&outStatistics=[{"statisticType":"min","onStatisticField":"${dateField}","outStatisticFieldName":"minDate"},{"statisticType":"max","onStatisticField":"${dateField}","outStatisticFieldName":"maxDate"}]&f=json`;
        const statsResp = await fetch(statsUrl);
        const statsData = await statsResp.json();
        const stats = statsData.features?.[0]?.attributes;

        if (stats && stats.minDate && stats.maxDate) {
            const fmtLocal = (d) =>
              d.getFullYear() + "-" +
              String(d.getMonth() + 1).padStart(2, "0") + "-" +
              String(d.getDate()).padStart(2, "0") + "T" +
              String(d.getHours()).padStart(2, "0") + ":" +
              String(d.getMinutes()).padStart(2, "0");
            const minDate = fmtLocal(new Date(stats.minDate));
            const maxDate = fmtLocal(new Date(stats.maxDate));
            const minDay = minDate.split("T")[0];
            const maxDay = maxDate.split("T")[0];
            dateFromInput.min = minDate;
            dateFromInput.max = maxDate;
            dateToInput.min = minDate;
            dateToInput.max = maxDate;
            if (!preserveDates) {
                dateFromInput.value = minDate;
                dateToInput.value = maxDate;
            }
            dateRangeDiv.querySelector("label").textContent =
                `Date range (data: ${minDay} to ${maxDay})`;
        }
        dateRangeDiv.style.display = "";
    } catch {
        dateRangeDiv.style.display = "none";
    }
}

// Date navigation — shift both dates by the current span
function shiftDates(direction) {
    const from = dateFromInput.value;
    const to = dateToInput.value;
    if (!from || !to) return;

    const fromDate = new Date(from);
    const toDate = new Date(to);
    const spanMs = toDate - fromDate;
    if (spanMs <= 0) return;

    const shift = direction * spanMs;
    const newFrom = new Date(fromDate.getTime() + shift);
    const newTo = new Date(toDate.getTime() + shift);

    // Format as local datetime (datetime-local inputs use local time, not UTC)
    const fmt = (d) =>
      d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0") + "T" +
      String(d.getHours()).padStart(2, "0") + ":" +
      String(d.getMinutes()).padStart(2, "0");
    const newFromStr = fmt(newFrom);
    const newToStr = fmt(newTo);

    const min = dateFromInput.min;
    const max = dateToInput.max;
    if (min && newFromStr < min) return;
    if (max && newToStr > max) return;

    dateFromInput.value = newFromStr;
    dateToInput.value = newToStr;

    if (serviceSelect.value && addressInput.value.trim()) {
        doSearch();
    }
}

document.getElementById("date-prev").addEventListener("click", () => shiftDates(-1));
document.getElementById("date-next").addEventListener("click", () => shiftDates(1));

// Enter key triggers search
addressInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !searchBtn.disabled) {
        doSearch();
    }
});
searchBtn.addEventListener("click", doSearch);

// Select a service programmatically (used by combobox, presets, and URL loading)
function selectService(serviceName) {
    // Update hidden select for form value tracking
    serviceSelect.value = serviceName || "";

    // Update selected label
    if (serviceName) {
        const svc = allServices.find(s => s.name === serviceName);
        const label = svc ? (svc.description || svc.name) : serviceName;
        serviceSelectedEl.innerHTML = "";
        const labelSpan = document.createElement("span");
        labelSpan.textContent = label;
        serviceSelectedEl.appendChild(labelSpan);
        const clearBtn = document.createElement("span");
        clearBtn.className = "clear-service";
        clearBtn.textContent = "\u00d7";
        clearBtn.title = "Clear selection";
        clearBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            selectService("");
        });
        serviceSelectedEl.appendChild(clearBtn);
        if (svc && svc.about) {
            const infoBtn = document.createElement("button");
            infoBtn.type = "button";
            infoBtn.className = "dataset-info-btn";
            infoBtn.textContent = "?";
            infoBtn.title = "About this dataset";
            infoBtn.setAttribute("aria-label", "About this dataset");
            infoBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                openDatasetInfoModal(svc);
            });
            serviceSelectedEl.appendChild(infoBtn);
        }
    } else {
        serviceSelectedEl.textContent = "";
    }

    serviceSearch.value = "";
    closeServiceDropdown();
    checkReady();
}

// Build the visible dropdown panel from a list of services
function buildServicePanel(services) {
    serviceDropdown.innerHTML = "";
    const groups = {};
    for (const svc of services) {
        const cat = svc.category || "Other";
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(svc);
    }

    for (const [category, svcs] of Object.entries(groups)) {
        const groupLabel = document.createElement("div");
        groupLabel.className = "group-label";
        groupLabel.textContent = category;
        serviceDropdown.appendChild(groupLabel);
        for (const svc of svcs) {
            const opt = document.createElement("div");
            opt.className = "service-option";
            opt.dataset.value = svc.name;

            const label = document.createElement("span");
            label.className = "service-option-label";
            label.textContent = svc.description || svc.name;
            opt.appendChild(label);

            if (svc.about) {
                const infoBtn = document.createElement("button");
                infoBtn.type = "button";
                infoBtn.className = "dropdown-info-btn";
                infoBtn.textContent = "?";
                infoBtn.title = "About this dataset";
                infoBtn.setAttribute("aria-label", "About this dataset");
                infoBtn.addEventListener("mousedown", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                });
                infoBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    openDatasetInfoModal(svc);
                });
                opt.appendChild(infoBtn);
            }

            opt.addEventListener("mousedown", (e) => {
                e.preventDefault(); // prevent blur before click registers
                selectService(svc.name);
                updateDateRange();
                if (addressInput.value.trim()) {
                    doSearch();
                } else {
                    addressInput.focus();
                }
            });
            serviceDropdown.appendChild(opt);
        }
    }

}

// Filter services by search query
function filterServices(query) {
    if (!query) return allServices;
    const q = query.toLowerCase();
    return allServices.filter(svc => {
        const name = (svc.description || svc.name).toLowerCase();
        const cat = (svc.category || "").toLowerCase();
        return name.includes(q) || cat.includes(q);
    });
}

function openServiceDropdown() {
    serviceDropdown.classList.add("open");
}

function closeServiceDropdown() {
    serviceDropdown.classList.remove("open");
}

serviceSearch.addEventListener("input", () => {
    const query = serviceSearch.value.trim();
    buildServicePanel(filterServices(query));
    openServiceDropdown();
});

let _blurTimeout = null;

serviceSearch.addEventListener("focus", () => {
    if (_blurTimeout) { clearTimeout(_blurTimeout); _blurTimeout = null; }
    buildServicePanel(filterServices(serviceSearch.value.trim()));
    openServiceDropdown();
});

serviceSearch.addEventListener("blur", () => {
    // Small delay so mousedown on option fires first
    _blurTimeout = setTimeout(() => {
        // Keep dropdown open while dataset info modal is showing
        if (datasetInfoOverlay.classList.contains("open")) return;
        closeServiceDropdown();
        _blurTimeout = null;
    }, 150);
});

serviceSearch.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        closeServiceDropdown();
        serviceSearch.blur();
    }
});

// Load services and build initial panel
async function loadServices() {
    try {
        const resp = await fetch(`${API}/services`);
        const data = await resp.json();

        allServices = data.services;
        for (const svc of allServices) {
            if (svc.poll) pollableServices.add(svc.name);
        }

        // Populate hidden select once with all services (never rebuilt on filter)
        serviceSelect.innerHTML = '<option value="">Select a dataset...</option>';
        for (const svc of allServices) {
            const option = document.createElement("option");
            option.value = svc.name;
            option.textContent = svc.description || svc.name;
            serviceSelect.appendChild(option);
        }

        buildServicePanel(allServices);
        checkReady();
    } catch (err) {
        setStatus("Failed to load services", "error");
    }
}

function setStatus(msg, cls) {
    statusEl.textContent = msg;
    statusEl.className = "status" + (cls ? ` ${cls}` : "");
    statusEl.dataset.baseStatus = msg;
}

function clearMap(useCluster = true) {
    if (useCluster !== markersLayerIsClustered) {
        map.removeLayer(markersLayer);
        markersLayer = useCluster ? createClusterGroup() : L.layerGroup();
        markersLayerIsClustered = useCluster;
        map.addLayer(markersLayer);
    } else {
        markersLayer.clearLayers();
    }
    if (radiusCircle) {
        map.removeLayer(radiusCircle);
        radiusCircle = null;
    }
    if (searchMarker) {
        map.removeLayer(searchMarker);
        searchMarker = null;
    }
    resultsList.innerHTML = "";
    currentResults = [];
    delete statusEl.dataset.baseStatus;
    document.getElementById("share-btn").style.display = "none";
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

function getMarkerStyle(record, isPolled) {
    if (!isPolled || !record._status) return DEFAULT_COLOR;
    return STATUS_COLORS[record._status] || DEFAULT_COLOR;
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

function buildPopupContent(record, isPolled) {
    let html = '<table class="popup-table">';

    // Show status badge for polled services
    if (isPolled && record._status) {
        const label = STATUS_LABELS[record._status] || record._status;
        const style = STATUS_COLORS[record._status] || DEFAULT_COLOR;
        html += `<tr><td>Status</td><td><span class="status-badge" style="background:${style.fill}">${escapeHtml(label)}</span></td></tr>`;
    }

    // Show distance first if present
    if (record._distance_miles !== undefined) {
        html += `<tr><td>Distance</td><td><strong>${escapeHtml(String(record._distance_miles))} mi</strong></td></tr>`;
    }

    // Show all non-internal fields
    for (const [key, value] of Object.entries(record)) {
        if (key.startsWith("_")) continue;
        const formatted = formatFieldValue(key, value);
        if (formatted === null || formatted.trim() === "") continue;
        const alias = getFieldAlias(key);
        html += `<tr><td>${escapeHtml(alias)}</td><td>${escapeHtml(formatted)}</td></tr>`;
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
        html += `<a href="https://www.openstreetmap.org/directions?from=&to=${lat},${lng}" target="_blank" rel="noopener noreferrer">Directions (OSM)</a>`;
        html += ` | <a href="https://www.google.com/maps/dir/?api=1&destination=${dest}" target="_blank" rel="noopener noreferrer">Google Maps</a>`;
        html += `</div>`;
    }

    return html;
}

// Update URL with selected record index (or clear it)
function setRecordInURL(index) {
    const params = new URLSearchParams(window.location.search);
    if (index != null) {
        params.set("record", index);
    } else {
        params.delete("record");
    }
    history.replaceState(null, "", `?${params}`);
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

function buildSparkline(histogram) {
    const container = document.createElement("div");
    container.className = "sparkline";

    const maxCount = Math.max(...histogram.map(b => b.count));
    const barWidth = Math.max(2, Math.floor((320 - histogram.length) / histogram.length));

    const barsDiv = document.createElement("div");
    barsDiv.className = "sparkline-bars";

    for (const bucket of histogram) {
        const pct = (bucket.count / maxCount) * 100;
        const bar = document.createElement("div");
        bar.className = "sparkline-bar";
        bar.style.height = `${Math.max(2, pct)}%`;
        bar.style.width = `${barWidth}px`;
        // Color intensity by count
        const intensity = 0.3 + (bucket.count / maxCount) * 0.7;
        bar.style.background = `rgba(74, 158, 255, ${intensity})`;
        bar.title = `${bucket.label}: ${bucket.count}`;
        barsDiv.appendChild(bar);
    }

    container.appendChild(barsDiv);

    // Labels: first, middle, last
    const labels = document.createElement("div");
    labels.className = "sparkline-labels";
    const first = histogram[0].label;
    const last = histogram[histogram.length - 1].label;
    labels.innerHTML = `<span>${first}</span><span>${last}</span>`;
    container.appendChild(labels);

    return container;
}

// Zoom to uncluster a marker (if using MarkerCluster) and open its popup
function showMarkerPopup(marker) {
    if (markersLayerIsClustered) {
        markersLayer.zoomToShowLayer(marker, () => marker.openPopup());
    } else {
        map.setView(marker.getLatLng(), Math.max(map.getZoom(), 16));
        marker.openPopup();
    }
}

async function doSearch() {
    const service = serviceSelect.value;
    const address = addressInput.value.trim();
    const radius = parseFloat(radiusInput.value) || 2;
    const dateFrom = dateFromInput.value || "";
    const dateTo = dateToInput.value || "";

    if (!service || !address) return;

    clearMap(true);
    clearTimeout(_radiusSearchTimeout);
    emptyState.style.display = "none";
    setStatus("Searching...", "loading");
    searchBtn.disabled = true;
    mapLoading.classList.add("active");
    pushSearchState(service, address, radius, dateFrom, dateTo);

    const isPolled = pollableServices.has(service);

    try {
        // Build nearby URL with optional date range
        let nearbyUrl = `${API}/nearby/${service}?address=${encodeURIComponent(address)}&radius=${radius}&max=2000`;
        if (dateFrom) nearbyUrl += `&from=${dateFrom}`;
        if (dateTo) nearbyUrl += `&to=${dateTo}`;

        // Fetch field metadata and nearby results in parallel
        const [infoResp, nearbyResp] = await Promise.all([
            fetch(`${API}/info/${service}`),
            fetch(nearbyUrl),
        ]);

        const info = await infoResp.json();
        const data = await nearbyResp.json();

        if (data.error) {
            setStatus(data.error, "error");
            return;
        }

        currentFieldMeta = info.fields || null;

        // Switch layer type if clustering mode changed
        clearMap(data.cluster !== false);

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
        for (let i = 0; i < data.records.length; i++) {
            const record = data.records[i];
            if (record._lat == null || record._lng == null) continue;

            const style = getMarkerStyle(record, isPolled);
            const marker = L.circleMarker([record._lat, record._lng], {
                radius: 7,
                color: style.color,
                fillColor: style.fill,
                fillOpacity: style.opacity,
                weight: 1.5,
            });
            // Stash status for cluster coloring
            marker._record_status = record._status || null;

            // Tooltip on hover (brief)
            const summary = summarizeRecord(record);
            const distText = record._distance_miles !== undefined
                ? `${record._distance_miles} mi - ` : "";
            const statusText = isPolled && record._status
                ? `[${STATUS_LABELS[record._status] || record._status}] ` : "";
            marker.bindTooltip(`${statusText}${distText}${summary}`, { direction: "top", offset: [0, -8] });

            // Popup on click (full details)
            marker.bindPopup(buildPopupContent(record, isPolled), { maxWidth: 350, maxHeight: 320 });

            // Update URL when popup opens/closes for deep-linking
            const recordIndex = i;
            marker.on("popupopen", () => setRecordInURL(recordIndex));
            marker.on("popupclose", () => setRecordInURL(null));

            marker.addTo(markersLayer);
            markers.push({ marker, record, index: i });
        }

        // Fit map to radius circle and markers (skip if restoring a saved viewport)
        if (_restoreViewport) {
            map.setView([_restoreViewport.lat, _restoreViewport.lng], _restoreViewport.zoom);
            _restoreViewport = null;
        } else if (markers.length > 0) {
            const group = L.featureGroup([radiusCircle, ...markers.map(m => m.marker)]);
            map.fitBounds(group.getBounds().pad(0.1));
        } else {
            map.fitBounds(radiusCircle.getBounds().pad(0.1));
        }

        // Build status message
        const count = data.count;
        const noun = count === 1 ? "result" : "results";
        lastSearchAddr = addressInput.value.split(",")[0].trim() || data.query_address || addressInput.value.trim();
        setStatus(`${count} ${noun} near ${lastSearchAddr}`);
        resultsList.innerHTML = "";

        // Helpful hint when no results
        if (data.count === 0) {
            const hint = document.createElement("div");
            hint.className = "empty-results-hint";
            const radius = parseFloat(radiusInput.value) || 2;
            let msg = "Try increasing the radius";
            if (radius < 5) msg += ` (currently ${radius} mi)`;
            if (servicesWithDates.has(service)) msg += " or widening the date range";
            msg += ".";
            hint.textContent = msg;
            resultsList.appendChild(hint);
        }

        // Legend for polled services
        if (isPolled && markers.length > 0) {
            const legend = document.createElement("div");
            legend.className = "status-legend";
            legend.innerHTML = Object.entries(STATUS_COLORS).map(([status, s]) => {
                const count = markers.filter(m => m.record._status === status).length;
                if (count === 0) return "";
                return `<span class="legend-item"><span class="legend-dot" style="background:${s.fill}"></span>${STATUS_LABELS[status]} (${count})</span>`;
            }).join("");
            resultsList.appendChild(legend);
        }

        currentResults = [];
        for (const { marker, record, index } of markers) {
            const item = document.createElement("div");
            item.className = "result-item";

            const dist = record._distance_miles !== undefined
                ? `<span class="result-distance">${record._distance_miles} mi</span> ` : "";
            const hasStatusDot = isPolled && record._status;

            // Build result item safely (no innerHTML for external data)
            if (hasStatusDot) {
                const dotSpan = document.createElement("span");
                dotSpan.className = "legend-dot";
                dotSpan.style.background = (STATUS_COLORS[record._status] || DEFAULT_COLOR).fill;
                item.appendChild(dotSpan);
            }
            if (record._distance_miles !== undefined) {
                const distSpan = document.createElement("span");
                distSpan.className = "result-distance";
                distSpan.textContent = `${record._distance_miles} mi`;
                item.appendChild(distSpan);
                item.appendChild(document.createTextNode(" "));
            }
            if (isPolled && record.IncidentTypeName) {
                const incidentSpan = document.createElement("span");
                incidentSpan.className = "result-incident";
                incidentSpan.textContent = record.IncidentTypeName;
                item.appendChild(incidentSpan);
                const time = record.CallReceivedTime
                    ? formatFieldValue("CallReceivedTime", record.CallReceivedTime)
                    : (record._first_seen ? formatFieldValue("_first_seen", record._first_seen) : "");
                if (time) {
                    const timeSpan = document.createElement("span");
                    timeSpan.className = "result-time";
                    timeSpan.textContent = time;
                    item.appendChild(document.createTextNode(" "));
                    item.appendChild(timeSpan);
                }
            } else {
                const summarySpan = document.createElement("span");
                summarySpan.className = "result-summary";
                summarySpan.textContent = summarizeRecord(record);
                item.appendChild(summarySpan);
            }

            item.addEventListener("click", () => {
                showMarkerPopup(marker);
            });

            resultsList.appendChild(item);
            currentResults.push({ marker, record, item, index });
        }

        // Add unmapped records (no lat/lng) to sidebar
        currentUnmapped = [];
        unmappedCount = 0;
        for (let i = 0; i < data.records.length; i++) {
            const record = data.records[i];
            if (record._lat != null && record._lng != null) continue;
            unmappedCount++;
            currentUnmapped.push({ record, isPolled, index: i });

            const item = document.createElement("div");
            item.className = "result-item";

            if (record._distance_miles !== undefined) {
                const distSpan = document.createElement("span");
                distSpan.className = "result-distance";
                distSpan.textContent = `${record._distance_miles} mi`;
                item.appendChild(distSpan);
                item.appendChild(document.createTextNode(" "));
            }

            const summarySpan = document.createElement("span");
            summarySpan.className = "result-summary";
            summarySpan.textContent = summarizeRecord(record);
            item.appendChild(summarySpan);

            const badge = document.createElement("span");
            badge.className = "no-pin-badge";
            badge.textContent = "\uD83D\uDCCD"; // 📍 pin emoji
            badge.title = "Address couldn't be mapped";
            item.appendChild(badge);

            const recordIndex = i;
            item.addEventListener("click", () => {
                openRecordModal(record, isPolled, recordIndex);
            });

            resultsList.appendChild(item);
        }

        filterResultsByViewport();
        document.getElementById("share-btn").style.display = "";

        // Deep-link: if URL has a record param, open that record's popup/modal
        if (_restoreRecord != null) {
            const targetIndex = _restoreRecord;
            _restoreRecord = null;
            // Try mapped records first
            const mapped = currentResults.find(e => e.index === targetIndex);
            if (mapped) {
                showMarkerPopup(mapped.marker);
            } else {
                // Try unmapped records
                const unmappedEntry = currentUnmapped.find(e => e.index === targetIndex);
                if (unmappedEntry) {
                    openRecordModal(unmappedEntry.record, unmappedEntry.isPolled, unmappedEntry.index);
                }
            }
        }
    } catch (err) {
        setStatus(`Error: ${err.message}`, "error");
    } finally {
        searchBtn.disabled = false;
        mapLoading.classList.remove("active");
        checkReady();
    }
}

// Show/hide sidebar result items based on current map viewport,
// collapsing items that share the same map point.
function filterResultsByViewport() {
    if (currentResults.length === 0) return;
    const bounds = map.getBounds();

    // Clean up previous group badges
    for (const el of resultsList.querySelectorAll(".location-group")) {
        el.remove();
    }

    // Hide everything first, then group visible items by location
    const locationGroups = new Map();
    for (const entry of currentResults) {
        entry.item.style.display = "none";
        if (bounds.contains([entry.record._lat, entry.record._lng])) {
            const locKey = `${entry.record._lat.toFixed(5)},${entry.record._lng.toFixed(5)}`;
            if (!locationGroups.has(locKey)) locationGroups.set(locKey, []);
            locationGroups.get(locKey).push(entry);
        }
    }

    // For each visible location: show first item, add group toggle if stacked
    let totalInView = 0;
    for (const entries of locationGroups.values()) {
        totalInView += entries.length;
        entries[0].item.style.display = "";
        if (entries.length > 1) {
            const badge = document.createElement("div");
            badge.className = "location-group";
            badge.textContent = `+${entries.length - 1} more here`;
            badge.addEventListener("click", () => {
                const expanded = badge.dataset.expanded === "1";
                for (let i = 1; i < entries.length; i++) {
                    entries[i].item.style.display = expanded ? "none" : "";
                }
                badge.dataset.expanded = expanded ? "0" : "1";
                badge.textContent = expanded
                    ? `+${entries.length - 1} more here`
                    : `\u25B4 collapse ${entries.length - 1}`;
            });
            entries[0].item.after(badge);
        }
    }

    // Status: show how many are visible vs total (include unmapped in both sides)
    const mappedTotal = currentResults.length;
    const total = mappedTotal + unmappedCount;
    const visible = totalInView + unmappedCount;
    const base = statusEl.dataset.baseStatus || statusEl.textContent;
    if (totalInView < mappedTotal) {
        statusEl.textContent = `Showing ${visible} of ${total} near ${lastSearchAddr}`;
    } else {
        statusEl.textContent = base;
    }
}

map.on("moveend", filterResultsByViewport);

// URL state: push search params into the URL so links are shareable
function pushSearchState(service, address, radius, dateFrom, dateTo) {
    const params = new URLSearchParams({ service, address, radius });
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    // Preserve current viewport if present
    const center = map.getCenter();
    const zoom = map.getZoom();
    params.set("lat", center.lat.toFixed(5));
    params.set("lng", center.lng.toFixed(5));
    params.set("z", zoom);
    history.pushState(null, "", `?${params}`);
}

// Update URL with current viewport on pan/zoom (debounced, replaceState only)
let _viewportUpdateTimeout = null;
function updateViewportInURL() {
    clearTimeout(_viewportUpdateTimeout);
    _viewportUpdateTimeout = setTimeout(() => {
        const params = new URLSearchParams(window.location.search);
        // Only update viewport if there's already a search in the URL
        if (!params.get("service")) return;
        const center = map.getCenter();
        params.set("lat", center.lat.toFixed(5));
        params.set("lng", center.lng.toFixed(5));
        params.set("z", map.getZoom());
        history.replaceState(null, "", `?${params}`);
    }, 300);
}
map.on("moveend", updateViewportInURL);

// When loading from a URL with viewport params, skip fitBounds in doSearch
let _restoreViewport = null;
// When loading from a URL with a record param, open that record after search
let _restoreRecord = null;

function loadSearchFromURL() {
    const params = new URLSearchParams(window.location.search);
    const service = params.get("service");
    const address = params.get("address");
    const radius = params.get("radius");
    const dateFrom = params.get("from");
    const dateTo = params.get("to");
    const lat = params.get("lat");
    const lng = params.get("lng");
    const zoom = params.get("z");
    const record = params.get("record");

    if (service && address) {
        // If URL has viewport, restore it after search instead of auto-fitting
        if (lat && lng && zoom) {
            const parsedLat = Number.parseFloat(lat);
            const parsedLng = Number.parseFloat(lng);
            const parsedZoom = Number.parseInt(zoom, 10);
            if (Number.isFinite(parsedLat) && Number.isFinite(parsedLng) && Number.isFinite(parsedZoom)) {
                _restoreViewport = { lat: parsedLat, lng: parsedLng, zoom: parsedZoom };
            }
        }

        // If URL has a record index, open it after search completes
        if (record) {
            const parsedIndex = Number.parseInt(record, 10);
            if (Number.isFinite(parsedIndex) && parsedIndex >= 0) {
                _restoreRecord = parsedIndex;
            }
        }

        // Wait for services to load, then set values and search
        const waitForServices = setInterval(() => {
            if (allServices.find(s => s.name === service)) {
                clearInterval(waitForServices);
                selectService(service);
                addressInput.value = address;
                if (radius) {
                    radiusInput.value = radius;
                    radiusSlider.value = radius;
                }
                if (dateFrom) dateFromInput.value = dateFrom;
                if (dateTo) dateToInput.value = dateTo;
                updateDateRange(dateFrom || dateTo ? true : false);
                checkReady();
                doSearch();
            }
        }, 100);
        // Give up after 5 seconds
        setTimeout(() => clearInterval(waitForServices), 5000);
    }
}

// Handle browser back/forward
window.addEventListener("popstate", loadSearchFromURL);

// --- Bug report modal ---
const bugOverlay = document.getElementById("bug-modal-overlay");
const bugForm = document.getElementById("bug-report-form");
const bugDescription = document.getElementById("bug-description");
const bugDebugPreview = document.getElementById("bug-debug-preview");
const bugStatusEl = document.getElementById("bug-status");
const bugSubmitBtn = document.getElementById("bug-submit");

function getDebugContext() {
    const parts = [];
    const service = serviceSelect.value;
    const address = addressInput.value.trim();
    const radius = radiusInput.value;
    if (service) parts.push(`Dataset: ${service}`);
    if (address) parts.push(`Address: ${address}`);
    if (radius) parts.push(`Radius: ${radius} mi`);
    if (dateFromInput.value) parts.push(`Date from: ${dateFromInput.value}`);
    if (dateToInput.value) parts.push(`Date to: ${dateToInput.value}`);
    const status = statusEl.textContent;
    if (status) parts.push(`Status: ${status}`);
    parts.push(`Results: ${currentResults.length}`);
    parts.push(`URL: ${window.location.href}`);
    parts.push(`Browser: ${navigator.userAgent}`);
    return parts.join("\n");
}

document.getElementById("bug-report-open").addEventListener("click", () => {
    bugDescription.value = "";
    bugStatusEl.textContent = "";
    bugStatusEl.className = "bug-status";
    bugSubmitBtn.disabled = false;
    bugDebugPreview.textContent = getDebugContext();
    bugOverlay.classList.add("open");
    bugDescription.focus();
});

document.getElementById("bug-cancel").addEventListener("click", () => {
    bugOverlay.classList.remove("open");
});

bugOverlay.addEventListener("click", (e) => {
    if (e.target === bugOverlay) bugOverlay.classList.remove("open");
});

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && bugOverlay.classList.contains("open")) {
        bugOverlay.classList.remove("open");
    }
});

bugForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const description = bugDescription.value.trim();
    if (!description) return;

    bugSubmitBtn.disabled = true;
    bugStatusEl.textContent = "Submitting...";
    bugStatusEl.className = "bug-status";

    try {
        const resp = await fetch(`${API}/report-bug`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                description,
                debug_context: getDebugContext(),
            }),
        });
        const data = await resp.json();
        if (resp.ok) {
            bugStatusEl.textContent = "Thanks! Your report has been submitted.";
            bugStatusEl.className = "bug-status success";
            setTimeout(() => bugOverlay.classList.remove("open"), 2000);
        } else {
            bugStatusEl.textContent = data.error || "Something went wrong. Please try again.";
            bugStatusEl.className = "bug-status error";
            bugSubmitBtn.disabled = false;
        }
    } catch (err) {
        bugStatusEl.textContent = "Could not submit report. Please try again.";
        bugStatusEl.className = "bug-status error";
        bugSubmitBtn.disabled = false;
    }
});

// --- About modal ---
const aboutOverlay = document.getElementById("about-modal-overlay");
const aboutCloseBtn = document.getElementById("about-close");
let aboutPreviousFocus = null;

function openAboutModal() {
    aboutPreviousFocus = document.activeElement;
    aboutOverlay.classList.add("open");
    setTimeout(() => aboutCloseBtn.focus(), 0);
}

function closeAboutModal() {
    aboutOverlay.classList.remove("open");
    if (aboutPreviousFocus) aboutPreviousFocus.focus();
    aboutPreviousFocus = null;
}

document.getElementById("about-open").addEventListener("click", openAboutModal);
aboutCloseBtn.addEventListener("click", closeAboutModal);

aboutOverlay.addEventListener("click", (e) => {
    if (e.target === aboutOverlay) closeAboutModal();
});

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && aboutOverlay.classList.contains("open")) {
        closeAboutModal();
    }
});

// --- Dataset info modal ---
const datasetInfoOverlay = document.getElementById("dataset-info-overlay");
const datasetInfoTitle = document.getElementById("dataset-info-title");
const datasetInfoBody = document.getElementById("dataset-info-body");
const datasetInfoCloseBtn = document.getElementById("dataset-info-close");
let datasetInfoPreviousFocus = null;

function openDatasetInfoModal(svc) {
    datasetInfoPreviousFocus = document.activeElement;
    datasetInfoTitle.textContent = svc.description || svc.name;

    datasetInfoBody.innerHTML = "";

    if (svc.about) {
        const p = document.createElement("p");
        p.className = "info-about";
        p.textContent = svc.about;
        datasetInfoBody.appendChild(p);
    }

    // Derive tips from metadata
    const tips = [];
    if (svc.mode === "geocode") {
        tips.push("Locations are geocoded from street addresses, so map positions may be approximate.");
    }
    if (svc.mode === "centroid") {
        tips.push("This dataset uses line or polygon geometry. Map pins show the center point of each feature.");
    }
    if (svc.date_field) {
        tips.push("Supports date range filtering \u2014 use the date pickers to narrow results to a specific time period.");
    }
    if (svc.poll) {
        tips.push("Live data \u2014 updated automatically every few minutes.");
    }

    if (tips.length) {
        const ul = document.createElement("ul");
        ul.className = "info-tips";
        for (const tip of tips) {
            const li = document.createElement("li");
            li.textContent = tip;
            ul.appendChild(li);
        }
        datasetInfoBody.appendChild(ul);
    }
    datasetInfoOverlay.classList.add("open");
    setTimeout(() => datasetInfoCloseBtn.focus(), 0);
}

function closeDatasetInfoModal() {
    datasetInfoOverlay.classList.remove("open");
    if (datasetInfoPreviousFocus) {
        datasetInfoPreviousFocus.focus();
        // Re-open dropdown if we came from the service search
        if (datasetInfoPreviousFocus === serviceSearch) openServiceDropdown();
    }
    datasetInfoPreviousFocus = null;
}

datasetInfoCloseBtn.addEventListener("click", closeDatasetInfoModal);

datasetInfoOverlay.addEventListener("click", (e) => {
    if (e.target === datasetInfoOverlay) closeDatasetInfoModal();
});

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && datasetInfoOverlay.classList.contains("open")) {
        closeDatasetInfoModal();
    }
});

// --- Record detail modal ---
const recordOverlay = document.getElementById("record-modal-overlay");
const recordModalBody = document.getElementById("record-modal-body");
const recordModalClose = document.getElementById("record-modal-close");
let recordPreviousFocus = null;

function openRecordModal(record, isPolled, recordIndex) {
    recordPreviousFocus = document.activeElement;
    const addr = record._address || "";
    const notice = addr
        ? `<div class="no-location-notice">Address could not be mapped to coordinates. <a href="https://www.google.com/maps/search/${encodeURIComponent(addr + ", Nashville, TN")}" target="_blank" rel="noopener noreferrer">Look up on Google Maps</a></div>`
        : '<div class="no-location-notice">This record has no location data and cannot be shown on the map.</div>';
    recordModalBody.innerHTML = notice + buildPopupContent(record, isPolled);
    recordOverlay.classList.add("open");
    setTimeout(() => recordModalClose.focus(), 0);
    if (recordIndex != null) setRecordInURL(recordIndex);
}

function closeRecordModal() {
    recordOverlay.classList.remove("open");
    if (recordPreviousFocus) recordPreviousFocus.focus();
    recordPreviousFocus = null;
    setRecordInURL(null);
}

recordModalClose.addEventListener("click", closeRecordModal);
recordOverlay.addEventListener("click", (e) => {
    if (e.target === recordOverlay) closeRecordModal();
});
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && recordOverlay.classList.contains("open")) {
        closeRecordModal();
    }
});

// Suggested dataset buttons
for (const btn of document.querySelectorAll(".suggested-btn")) {
    btn.addEventListener("click", () => {
        const service = btn.dataset.service;
        let attempts = 0;
        const trySelect = () => {
            if (allServices.find(s => s.name === service)) {
                selectService(service);
                updateDateRange();
                addressInput.focus();
            } else if (attempts++ < 50) {
                setTimeout(trySelect, 100);
            }
        };
        trySelect();
    });
}

// Share button: create a short URL and copy to clipboard
const shareBtn = document.getElementById("share-btn");
const toastEl = document.getElementById("toast");

function showToast(msg, duration = 2500) {
    toastEl.textContent = msg;
    toastEl.classList.add("visible");
    setTimeout(() => toastEl.classList.remove("visible"), duration);
}

shareBtn.addEventListener("click", async () => {
    const qs = window.location.search.replace(/^\?/, "");
    if (!qs) return;
    shareBtn.disabled = true;
    try {
        const resp = await fetch(`${API}/s`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query_string: qs }),
        });
        const data = await resp.json();
        if (data.error) {
            showToast("Failed to create link");
            return;
        }
        const shortUrl = `${window.location.origin}/s/${data.id}`;
        await navigator.clipboard.writeText(shortUrl);
        showToast("Link copied to clipboard");
    } catch {
        showToast("Failed to create link");
    } finally {
        shareBtn.disabled = false;
    }
});

// Init
loadServices();
loadSearchFromURL();
