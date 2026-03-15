"""
All The APIs Service - Generic Nashville Open Data proximity search.

Queries any Nashville ArcGIS FeatureServer service by name, auto-detects
geometry and address fields, geocodes as needed, and filters by proximity.
"""

import math
import os
import re
import requests
import yaml
from datetime import datetime, timezone, timedelta
from typing import Optional
from dataclasses import dataclass, field

ARCGIS_BASE = "https://services2.arcgis.com/HdTo6HJqh92wn4D8/arcgis/rest/services"
CENSUS_GEOCODER_URL = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress"
SERVICES_YML = os.path.join(os.path.dirname(os.path.abspath(__file__)), "services.yml")

# In-memory geocode cache
_geocode_cache: dict[str, Optional["Coordinates"]] = {}

# Cache for service metadata (schema doesn't change often)
_service_meta_cache: dict[str, dict] = {}

# Curated service catalog loaded from services.yml
_services_catalog: Optional[list[dict]] = None


def _load_catalog() -> list[dict]:
    """Load the curated service catalog from services.yml."""
    global _services_catalog
    if _services_catalog is not None:
        return _services_catalog
    try:
        with open(SERVICES_YML) as f:
            data = yaml.safe_load(f)
        _services_catalog = data.get("services", [])
    except (FileNotFoundError, yaml.YAMLError):
        _services_catalog = []
    return _services_catalog


@dataclass
class Coordinates:
    lat: float
    lng: float


@dataclass
class ServiceMeta:
    """Metadata about an ArcGIS service layer."""
    name: str
    has_geometry: bool
    geometry_type: Optional[str]
    fields: list[dict]
    address_field: Optional[str] = None
    city_field: Optional[str] = None
    lat_field: Optional[str] = None
    lng_field: Optional[str] = None
    date_fields: list[str] = field(default_factory=list)
    display_name: str = ""


def geocode_address(address: str, city_hint: str = "Nashville, TN") -> Optional[Coordinates]:
    """US Census Geocoder. Append city_hint if not in address. Cache results."""
    full_address = address.strip()
    if city_hint and city_hint.split(",")[0].strip().lower() not in full_address.lower():
        full_address = f"{full_address}, {city_hint}"

    if full_address in _geocode_cache:
        return _geocode_cache[full_address]

    params = {
        "address": full_address,
        "benchmark": "Public_AR_Current",
        "format": "json",
    }
    try:
        resp = requests.get(CENSUS_GEOCODER_URL, params=params, timeout=10)
        resp.raise_for_status()
        matches = resp.json().get("result", {}).get("addressMatches", [])
        if not matches:
            _geocode_cache[full_address] = None
            return None
        coords = matches[0].get("coordinates", {})
        result = Coordinates(lat=coords.get("y"), lng=coords.get("x"))
        _geocode_cache[full_address] = result
        return result
    except (requests.RequestException, KeyError, IndexError):
        _geocode_cache[full_address] = None
        return None


def haversine_miles(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in miles."""
    R = 3959
    lat1_r, lat2_r = math.radians(lat1), math.radians(lat2)
    dlat, dlng = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1_r) * math.cos(lat2_r) * math.sin(dlng / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def list_services() -> list[dict]:
    """List curated services from services.yml."""
    catalog = _load_catalog()
    return [
        {"name": svc["name"], "description": svc.get("description", "")}
        for svc in catalog
    ]


def search_services(query: str) -> list[dict]:
    """Search curated services by keyword (case-insensitive, matches name or description)."""
    catalog = _load_catalog()
    terms = query.lower().split()
    results = []
    for svc in catalog:
        searchable = f"{svc['name']} {svc.get('description', '')}".lower()
        if all(term in searchable for term in terms):
            results.append({"name": svc["name"], "description": svc.get("description", "")})
    return results


def get_service_meta(service_name: str, layer: int = 0) -> Optional[ServiceMeta]:
    """Fetch and parse service metadata (fields, geometry, etc.)."""
    cache_key = f"{service_name}/{layer}"
    if cache_key in _service_meta_cache:
        return _service_meta_cache[cache_key]

    url = f"{ARCGIS_BASE}/{service_name}/FeatureServer/{layer}?f=json"
    try:
        resp = requests.get(url, timeout=15)
        resp.raise_for_status()
        data = resp.json()
    except requests.RequestException:
        return None

    if "error" in data:
        return None

    fields = data.get("fields", [])
    geom_type = data.get("geometryType")
    has_geometry = geom_type is not None and geom_type != ""

    # Auto-detect address, city, lat/lng, and date fields
    address_field = None
    city_field = None
    lat_field = None
    lng_field = None
    date_fields = []

    address_patterns = re.compile(r"^(address|location|street|incident_location|mapped_location)$", re.IGNORECASE)
    city_patterns = re.compile(r"^(city|cityname|city_name)$", re.IGNORECASE)
    lat_patterns = re.compile(r"^(lat|latitude|y)$", re.IGNORECASE)
    lng_patterns = re.compile(r"^(lng|lon|long|longitude|x)$", re.IGNORECASE)

    for f in fields:
        fname = f.get("name", "")
        ftype = f.get("type", "")

        if ftype == "esriFieldTypeDate":
            date_fields.append(fname)

        if not address_field and address_patterns.match(fname):
            address_field = fname
        if not city_field and city_patterns.match(fname):
            city_field = fname
        if not lat_field and lat_patterns.match(fname):
            lat_field = fname
        if not lng_field and lng_patterns.match(fname):
            lng_field = fname

    # If no exact match, do a broader search for address-like fields
    if not address_field:
        for f in fields:
            fname = f.get("name", "")
            if "address" in fname.lower() or "location" in fname.lower():
                ftype = f.get("type", "")
                if ftype == "esriFieldTypeString":
                    address_field = fname
                    break

    display_name = data.get("name", service_name)

    meta = ServiceMeta(
        name=service_name,
        has_geometry=has_geometry,
        geometry_type=geom_type,
        fields=[{"name": f["name"], "type": f["type"], "alias": f.get("alias", f["name"])} for f in fields],
        address_field=address_field,
        city_field=city_field,
        lat_field=lat_field,
        lng_field=lng_field,
        date_fields=date_fields,
        display_name=display_name,
    )
    _service_meta_cache[cache_key] = meta
    return meta


def fetch_records(service_name: str, layer: int = 0, max_records: int = 1000,
                  order_by: Optional[str] = None) -> list[dict]:
    """Fetch records from a service. Returns list of attribute dicts with optional geometry."""
    url = f"{ARCGIS_BASE}/{service_name}/FeatureServer/{layer}/query"
    params = {
        "where": "1=1",
        "outFields": "*",
        "outSR": "4326",
        "f": "json",
        "resultRecordCount": max_records,
    }
    if order_by:
        params["orderByFields"] = order_by

    try:
        resp = requests.get(url, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except requests.RequestException:
        return []

    records = []
    for feat in data.get("features", []):
        record = dict(feat.get("attributes", {}))
        geom = feat.get("geometry")
        if geom and isinstance(geom, dict):
            if "x" in geom and "y" in geom:
                # Point geometry
                record["_geom_x"] = geom["x"]
                record["_geom_y"] = geom["y"]
            else:
                # Polygon (rings) or polyline (paths) — use centroid
                coords = []
                for ring_or_path in geom.get("rings", geom.get("paths", [])):
                    coords.extend(ring_or_path)
                if coords:
                    record["_geom_x"] = sum(c[0] for c in coords) / len(coords)
                    record["_geom_y"] = sum(c[1] for c in coords) / len(coords)
        records.append(record)

    return records


def _get_record_coords(record: dict, meta: ServiceMeta) -> Optional[Coordinates]:
    """Extract or geocode coordinates for a record."""
    # First try geometry from the service
    if meta.has_geometry and record.get("_geom_x") and record.get("_geom_y"):
        return Coordinates(lat=record["_geom_y"], lng=record["_geom_x"])

    # Try explicit lat/lng fields
    if meta.lat_field and meta.lng_field:
        lat = record.get(meta.lat_field)
        lng = record.get(meta.lng_field)
        if lat and lng:
            try:
                return Coordinates(lat=float(lat), lng=float(lng))
            except (ValueError, TypeError):
                pass

    # Fall back to geocoding the address field
    if meta.address_field:
        addr = record.get(meta.address_field)
        if addr and isinstance(addr, str) and addr.strip():
            city_hint = "Nashville, TN"
            if meta.city_field and record.get(meta.city_field):
                city_hint = f"{record[meta.city_field]}, TN"
            return geocode_address(addr, city_hint=city_hint)

    return None


def _format_record(record: dict, meta: ServiceMeta, distance: Optional[float] = None,
                    coords: Optional[Coordinates] = None) -> dict:
    """Format a record for API output, converting dates and adding distance."""
    out = {}
    for f in meta.fields:
        fname = f["name"]
        val = record.get(fname)
        if f["type"] == "esriFieldTypeDate" and val is not None:
            try:
                dt = datetime.fromtimestamp(val / 1000, tz=timezone.utc)
                out[fname] = dt.isoformat()
            except (ValueError, TypeError, OSError):
                out[fname] = val
        else:
            out[fname] = val

    if distance is not None:
        out["_distance_miles"] = round(distance, 2)

    # Include the address used for this record
    if meta.address_field and record.get(meta.address_field):
        addr = record[meta.address_field]
        if isinstance(addr, str) and addr.strip():
            out["_address"] = addr

    # Include coords so CLI can build Maps links as fallback
    if coords:
        out["_lat"] = coords.lat
        out["_lng"] = coords.lng

    return out


def find_nearby(service_name: str, address: str, radius_miles: float = 2.0,
                layer: int = 0, max_records: int = 1000) -> dict:
    """
    Main proximity search: geocode the query address, fetch records from the
    named service, compute distances, filter and sort by proximity.
    """
    meta = get_service_meta(service_name, layer=layer)
    if meta is None:
        return {"error": f"Service '{service_name}' not found or inaccessible"}

    # Geocode the user's query address
    query_coords = geocode_address(address)
    if query_coords is None:
        return {"error": "Could not geocode query address", "query_address": address}

    # Determine sort order (newest first if date fields exist)
    order_by = None
    if meta.date_fields:
        order_by = f"{meta.date_fields[0]} DESC"

    records = fetch_records(service_name, layer=layer, max_records=max_records,
                            order_by=order_by)

    nearby = []
    for record in records:
        record_coords = _get_record_coords(record, meta)
        if record_coords is None:
            continue
        dist = haversine_miles(query_coords.lat, query_coords.lng,
                               record_coords.lat, record_coords.lng)
        if dist <= radius_miles:
            nearby.append(_format_record(record, meta, distance=dist, coords=record_coords))

    nearby.sort(key=lambda r: r.get("_distance_miles", 999))

    return {
        "service": service_name,
        "display_name": meta.display_name,
        "query_address": address,
        "coordinates": {"lat": query_coords.lat, "lng": query_coords.lng},
        "radius_miles": radius_miles,
        "total_fetched": len(records),
        "count": len(nearby),
        "has_geometry": meta.has_geometry,
        "address_field": meta.address_field,
        "records": nearby,
    }


if __name__ == "__main__":
    import sys
    import json

    if len(sys.argv) < 3:
        print("Usage: python alltheapis_service.py <service_name> <address> [radius_miles]")
        print("       python alltheapis_service.py --list [search_query]")
        sys.exit(1)

    if sys.argv[1] == "--list":
        query = " ".join(sys.argv[2:]) if len(sys.argv) > 2 else ""
        svcs = search_services(query) if query else list_services()
        for svc in svcs:
            print(f"  {svc['name']} ({svc['type']})")
        print(f"\n{len(svcs)} service(s) found")
    elif sys.argv[1] == "--info":
        if len(sys.argv) < 3:
            print("Usage: python alltheapis_service.py --info <service_name>")
            sys.exit(1)
        meta = get_service_meta(sys.argv[2])
        if meta:
            print(f"Service: {meta.display_name}")
            print(f"Has geometry: {meta.has_geometry} ({meta.geometry_type})")
            print(f"Address field: {meta.address_field}")
            print(f"City field: {meta.city_field}")
            print(f"Lat/Lng fields: {meta.lat_field}/{meta.lng_field}")
            print(f"Date fields: {meta.date_fields}")
            print("Fields:")
            for f in meta.fields:
                print(f"  {f['name']} ({f['type']}) - {f['alias']}")
        else:
            print(f"Service not found: {sys.argv[2]}")
    else:
        service = sys.argv[1]
        addr = sys.argv[2]
        radius = float(sys.argv[3]) if len(sys.argv) > 3 else 2.0
        result = find_nearby(service, addr, radius_miles=radius)
        print(json.dumps(result, indent=2))
