"""
All The APIs - Flask server for generic Nashville Open Data proximity search.
"""

from flask import Flask, request, jsonify
from alltheapis_service import (
    find_nearby, fetch_records, get_service_meta,
    list_services, search_services, _format_record,
)

app = Flask(__name__)


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


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
    return jsonify({
        "name": meta.name,
        "display_name": meta.display_name,
        "has_geometry": meta.has_geometry,
        "geometry_type": meta.geometry_type,
        "address_field": meta.address_field,
        "city_field": meta.city_field,
        "lat_field": meta.lat_field,
        "lng_field": meta.lng_field,
        "date_fields": meta.date_fields,
        "fields": meta.fields,
    })


@app.route("/nearby/<path:service_name>")
def nearby(service_name):
    """Proximity search: find records near a given address."""
    address = request.args.get("address")
    if not address:
        return jsonify({"error": "Missing required 'address' parameter"}), 400
    radius = float(request.args.get("radius", 2.0))
    layer = int(request.args.get("layer", 0))
    max_records = min(int(request.args.get("max", 1000)), 5000)

    result = find_nearby(service_name, address, radius_miles=radius,
                         layer=layer, max_records=max_records)
    if "error" in result:
        return jsonify(result), 404
    return jsonify(result)


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
    app.run(host=args.host, port=args.port, debug=False)
