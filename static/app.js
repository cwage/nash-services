const API = window.location.origin;

// Featured presets — curated interesting visualizations
const FEATURED = [
    {
        label: "2020 Christmas Bombing",
        service: "Metro_Nashville_Police_Department_Calls_for_Service_2020",
        address: "166 2nd Ave N, Nashville, TN",
        radius: 2,
        from: "2020-12-25T12:00",
        to: "2020-12-25T14:00",
    },
];

// Map setup - centered on Nashville
const map = L.map("map").setView([36.16, -86.78], 12);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
}).addTo(map);

// Layer groups for managing markers
let markersLayer = L.markerClusterGroup({
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
map.addLayer(markersLayer);
let radiusCircle = null;
let searchMarker = null;

// Current result set for viewport filtering
let currentResults = []; // [{ marker, record, item }]

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

// Keep slider and number input in sync, auto-search on change
radiusSlider.addEventListener("input", () => {
    radiusInput.value = radiusSlider.value;
});
radiusSlider.addEventListener("change", () => {
    if (serviceSelect.value && addressInput.value.trim()) doSearch();
});
radiusInput.addEventListener("input", () => {
    radiusSlider.value = radiusInput.value;
});
radiusInput.addEventListener("change", () => {
    if (serviceSelect.value && addressInput.value.trim()) doSearch();
});

// Track which services have date fields (populated on info fetch)
const servicesWithDates = new Set();

// Enable search when both service and address are filled
function checkReady() {
    searchBtn.disabled = !serviceSelect.value || !addressInput.value.trim();
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
            opt.textContent = svc.description || svc.name;
            opt.dataset.value = svc.name;
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

serviceSearch.addEventListener("focus", () => {
    buildServicePanel(filterServices(serviceSearch.value.trim()));
    openServiceDropdown();
});

serviceSearch.addEventListener("blur", () => {
    // Small delay so mousedown on option fires first
    setTimeout(closeServiceDropdown, 150);
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
    currentResults = [];
    delete statusEl.dataset.baseStatus;
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

function buildPopupContent(record, isPolled) {
    let html = '<table class="popup-table">';

    // Show status badge for polled services
    if (isPolled && record._status) {
        const label = STATUS_LABELS[record._status] || record._status;
        const style = STATUS_COLORS[record._status] || DEFAULT_COLOR;
        html += `<tr><td>Status</td><td><span class="status-badge" style="background:${style.fill}">${label}</span></td></tr>`;
    }

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

async function doSearch() {
    const service = serviceSelect.value;
    const address = addressInput.value.trim();
    const radius = parseFloat(radiusInput.value) || 2;
    const dateFrom = dateFromInput.value || "";
    const dateTo = dateToInput.value || "";

    if (!service || !address) return;

    clearMap();
    setStatus("Searching...", "loading");
    searchBtn.disabled = true;
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

            marker.addTo(markersLayer);
            markers.push({ marker, record });
        }

        // Sector aggregate circles for records without precise location
        // Use absolute scale so circles are comparable across time periods
        const sectorMarkers = [];
        if (data.sector_summary && data.sector_summary.length > 0) {
            const maxSectorCount = Math.max(...data.sector_summary.map(s => s.count));
            for (const sector of data.sector_summary) {
                // Scale relative to max in this result set — makes dominant sector obvious
                const relScale = sector.count / maxSectorCount;
                // Radius: small sectors ~300m, dominant sector ~3000m
                const circleRadius = 300 + relScale * relScale * 2700;
                // Color: low counts = faded yellow, high counts = bright red-orange
                const r = Math.round(230 + relScale * 25);
                const g = Math.round(180 - relScale * 120);
                const b = Math.round(50 - relScale * 30);
                const color = `rgb(${r},${g},${b})`;

                const sectorCircle = L.circle([sector.lat, sector.lng], {
                    radius: circleRadius,
                    color: color,
                    fillColor: color,
                    fillOpacity: 0.1 + relScale * 0.4,
                    weight: 1.5 + relScale * 2,
                });

                sectorCircle.bindTooltip(
                    `${sector.name} sector: ${sector.count} calls (no precise location)`,
                    { direction: "top", offset: [0, -10] }
                );
                sectorCircle.bindPopup(
                    `<strong>${sector.name} Sector</strong><br>` +
                    `${sector.count} call(s) without precise location<br>` +
                    `<em style="color:#999">Shown at sector centroid</em>`
                );

                sectorCircle.addTo(markersLayer);
                sectorMarkers.push(sectorCircle);
            }
        }

        // Fit map to radius circle and markers only (not distant sector circles)
        if (markers.length > 0) {
            const group = L.featureGroup([radiusCircle, ...markers.map(m => m.marker)]);
            map.fitBounds(group.getBounds().pad(0.1));
        } else {
            map.fitBounds(radiusCircle.getBounds().pad(0.1));
        }

        // Build status message
        const fetchedLabel = data.total_cached !== undefined
            ? `${data.total_cached} cached` : `${data.total_fetched} fetched`;
        let statusMsg = `${data.count} result(s) found (${fetchedLabel})`;
        if (data.no_location > 0) {
            const sectorCount = data.sector_summary
                ? data.sector_summary.reduce((sum, s) => sum + s.count, 0) : 0;
            statusMsg += ` · ${data.no_location} without location`;
            if (sectorCount > 0) {
                statusMsg += ` (${sectorCount} by sector)`;
            }
        }
        setStatus(statusMsg);
        resultsList.innerHTML = "";

        // Sector summary in sidebar
        if (data.sector_summary && data.sector_summary.length > 0) {
            const sectorDiv = document.createElement("div");
            sectorDiv.className = "sector-summary";
            sectorDiv.innerHTML = `<div class="sector-title">Calls by sector (no precise location)</div>`;
            // Absolute scale: 200 calls = 100% bar width
            for (const sector of data.sector_summary) {
                const pct = Math.min(100, (sector.count / 200) * 100);
                const row = document.createElement("div");
                row.className = "sector-row";
                row.innerHTML = `
                    <span class="sector-name">${sector.name}</span>
                    <div class="sector-bar-bg"><div class="sector-bar" style="width:${pct}%"></div></div>
                    <span class="sector-count">${sector.count}</span>`;
                sectorDiv.appendChild(row);
            }
            resultsList.appendChild(sectorDiv);
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
        for (const { marker, record } of markers) {
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
                map.setView([record._lat, record._lng], 16);
                marker.openPopup();
            });

            resultsList.appendChild(item);
            currentResults.push({ marker, record, item });
        }
        filterResultsByViewport();
    } catch (err) {
        setStatus(`Error: ${err.message}`, "error");
    }

    searchBtn.disabled = false;
    checkReady();
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

    // Status: show locations count (matches dots on map)
    const total = currentResults.length;
    const base = statusEl.dataset.baseStatus || statusEl.textContent;
    const dots = locationGroups.size;
    if (totalInView < total) {
        statusEl.textContent = dots < totalInView
            ? `Showing ${dots} locations (${totalInView} records) in view`
            : `Showing ${totalInView} in view`;
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
    history.pushState(null, "", `?${params}`);
}

function loadSearchFromURL() {
    const params = new URLSearchParams(window.location.search);
    const service = params.get("service");
    const address = params.get("address");
    const radius = params.get("radius");
    const dateFrom = params.get("from");
    const dateTo = params.get("to");

    if (service && address) {
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

async function applyPreset(preset) {
    // Wait for services to load
    await new Promise((resolve) => {
        const waitForServices = setInterval(() => {
            if (allServices.find(s => s.name === preset.service)) {
                clearInterval(waitForServices);
                resolve();
            }
        }, 100);
        setTimeout(() => { clearInterval(waitForServices); resolve(); }, 5000);
    });

    selectService(preset.service);
    addressInput.value = preset.address;
    radiusInput.value = preset.radius;
    radiusSlider.value = preset.radius;

    // Get bounds from the dataset, then force preset dates
    await updateDateRange(true);
    // Force preset dates after updateDateRange completes
    if (preset.from) dateFromInput.value = preset.from;
    if (preset.to) dateToInput.value = preset.to;
    dateRangeDiv.style.display = "";
    checkReady();
    doSearch();
}

function buildFeaturedList() {
    const list = document.getElementById("featured-list");
    for (const preset of FEATURED) {
        const item = document.createElement("a");
        item.className = "featured-item";
        item.href = "#";
        item.textContent = preset.label;
        item.addEventListener("click", (e) => {
            e.preventDefault();
            // Clear any URL state so loadSearchFromURL doesn't interfere
            history.replaceState(null, "", window.location.pathname);
            applyPreset(preset);
        });
        list.appendChild(item);
    }
}

// Init
loadServices();
buildFeaturedList();
loadSearchFromURL();
