"""
All The APIs - Flask server for generic Nashville Open Data proximity search.
"""

import logging
from functools import partial
from flask import Flask, request, jsonify, send_from_directory
from alltheapis_service import (
    find_nearby, fetch_records, get_service_meta,
    list_services, search_services, _format_record,
    get_pollable_services, fetch_service_raw, find_nearby_cached,
    get_catalog_entry,
)
from dispatch_cache import ServicePoller, get_cached_events, get_cache_stats

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)

app = Flask(__name__, static_folder="static")

# Build poller with all poll: true services
poller = ServicePoller()
_pollable_names = set()
for svc in get_pollable_services():
    poller.add_target(svc["name"], partial(fetch_service_raw, svc["name"]))
    _pollable_names.add(svc["name"])


@app.route("/")
def index():
    return send_from_directory("static", "index.html")


@app.route("/health")
def health():
    stats = get_cache_stats()
    return jsonify({"status": "ok", "cache": stats})


@app.route("/services")
def services():
    """List or search available services."""
    query = request.args.get("q", "")
    if query:
        svcs = search_services(query)
    else:
        svcs = list_services()
    return jsonify({"count": len(svcs), "services": svcs})


@app.route("/info/<path:service_name>")
def info(service_name):
    """Get metadata about a service (fields, geometry type, etc.)."""
    layer = int(request.args.get("layer", 0))
    meta = get_service_meta(service_name, layer=layer)
    if meta is None:
        return jsonify({"error": f"Service '{service_name}' not found"}), 404
    catalog = get_catalog_entry(service_name)
    configured_date_field = catalog.get("date_field") if catalog else None
    return jsonify({
        "name": meta.name,
        "display_name": meta.display_name,
        "has_geometry": meta.has_geometry,
        "geometry_type": meta.geometry_type,
        "address_field": meta.address_field,
        "city_field": meta.city_field,
        "lat_field": meta.lat_field,
        "lng_field": meta.lng_field,
        "date_field": configured_date_field,
        "date_fields": meta.date_fields,
        "fields": meta.fields,
        "poll": service_name in _pollable_names,
    })


@app.route("/nearby/<path:service_name>")
def nearby(service_name):
    """Proximity search: find records near a given address.

    For polled services, uses cached data (live + recent + stale) by default.
    Pass ?live_only=1 to skip the cache and query ArcGIS directly.
    """
    address = request.args.get("address")
    if not address:
        return jsonify({"error": "Missing required 'address' parameter"}), 400
    radius = float(request.args.get("radius", 2.0))
    layer = int(request.args.get("layer", 0))
    max_records = min(int(request.args.get("max", 1000)), 5000)
    live_only = request.args.get("live_only", "0") == "1"
    date_from = request.args.get("from")  # e.g. 2020-12-25
    date_to = request.args.get("to")      # e.g. 2020-12-26

    # Use cached data for polled services (bypass cache when date filtering)
    if service_name in _pollable_names and not live_only and not date_from and not date_to:
        cached = get_cached_events(service_name)
        if cached:
            result = find_nearby_cached(service_name, address,
                                        radius_miles=radius,
                                        cached_events=cached)
            if "error" in result:
                return jsonify(result), 404
            return jsonify(result)

    # Fall through to live query
    result = find_nearby(service_name, address, radius_miles=radius,
                         layer=layer, max_records=max_records,
                         date_from=date_from, date_to=date_to)
    if "error" in result:
        return jsonify(result), 404
    return jsonify(result)


@app.route("/cache/stats")
def cache_stats():
    """Cache statistics across all polled services."""
    service = request.args.get("service")
    return jsonify(get_cache_stats(service_name=service))


@app.route("/records/<path:service_name>")
def records(service_name):
    """List raw records from a service (no proximity filter)."""
    layer = int(request.args.get("layer", 0))
    max_records = min(int(request.args.get("max", 100)), 5000)

    meta = get_service_meta(service_name, layer=layer)
    if meta is None:
        return jsonify({"error": f"Service '{service_name}' not found"}), 404

    order_by = None
    if meta.date_fields:
        order_by = f"{meta.date_fields[0]} DESC"

    items = fetch_records(service_name, layer=layer, max_records=max_records,
                          order_by=order_by)
    formatted = [_format_record(r, meta) for r in items]

    return jsonify({
        "service": service_name,
        "display_name": meta.display_name,
        "count": len(formatted),
        "records": formatted,
    })


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=5000)
    args = parser.parse_args()
    poller.start()
    app.run(host=args.host, port=args.port, debug=False)
