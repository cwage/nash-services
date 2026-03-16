"""
Nash Services - Generic Nashville Open Data proximity search.

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
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
SERVICES_YML = os.path.join(os.path.dirname(os.path.abspath(__file__)), "services.yml")

# In-memory geocode cache (backed by SQLite for persistence across restarts)
_geocode_cache: dict[str, Optional["Coordinates"]] = {}
_GEOCODE_DB = os.environ.get("DISPATCH_CACHE_DB", "/tmp/service_cache.db")


def _init_geocode_db():
    """Ensure the geocode_cache table exists and load into memory."""
    import sqlite3
    try:
        conn = sqlite3.connect(_GEOCODE_DB, timeout=5)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS geocode_cache (
                cache_key TEXT PRIMARY KEY,
                lat REAL,
                lng REAL
            )
        """)
        conn.commit()
        rows = conn.execute("SELECT cache_key, lat, lng FROM geocode_cache").fetchall()
        for key, lat, lng in rows:
            if lat is not None and lng is not None:
                _geocode_cache[key] = Coordinates(lat=lat, lng=lng)
            else:
                _geocode_cache[key] = None
        conn.close()
    except Exception:
        pass  # fall back to empty in-memory cache


def _persist_geocode(key: str, coords: Optional["Coordinates"]):
    """Write a geocode result to SQLite for persistence."""
    import sqlite3
    try:
        conn = sqlite3.connect(_GEOCODE_DB, timeout=5)
        lat = coords.lat if coords else None
        lng = coords.lng if coords else None
        conn.execute(
            "INSERT OR REPLACE INTO geocode_cache (cache_key, lat, lng) VALUES (?, ?, ?)",
            (key, lat, lng),
        )
        conn.commit()
        conn.close()
    except Exception:
        pass


@dataclass
class Coordinates:
    lat: float
    lng: float


_init_geocode_db()

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
class ServiceMeta:
    """Metadata about an ArcGIS service layer."""
    name: str
    has_geometry: bool
    geometry_type: Optional[str]
    fields: list[dict]
    address_field: Optional[str] = None
    city_field: Optional[str] = None
    zip_field: Optional[str] = None
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
            _persist_geocode(full_address, None)
            return None
        coords = matches[0].get("coordinates", {})
        result = Coordinates(lat=coords.get("y"), lng=coords.get("x"))
        _geocode_cache[full_address] = result
        _persist_geocode(full_address, result)
        return result
    except (requests.RequestException, KeyError, IndexError):
        _geocode_cache[full_address] = None
        return None


def geocode_zip(zipcode: str) -> Optional[Coordinates]:
    """Geocode a US ZIP code via Nominatim (OSM). Returns centroid."""
    zipcode = zipcode.strip()[:5]
    cache_key = f"zip:{zipcode}"
    if cache_key in _geocode_cache:
        return _geocode_cache[cache_key]

    params = {
        "postalcode": zipcode,
        "country": "US",
        "format": "json",
        "limit": 1,
    }
    headers = {"User-Agent": "nash-services"}
    try:
        resp = requests.get(NOMINATIM_URL, params=params, headers=headers, timeout=10)
        resp.raise_for_status()
        results = resp.json()
        if not results:
            _geocode_cache[cache_key] = None
            _persist_geocode(cache_key, None)
            return None
        result = Coordinates(lat=float(results[0]["lat"]), lng=float(results[0]["lon"]))
        _geocode_cache[cache_key] = result
        _persist_geocode(cache_key, result)
        return result
    except (requests.RequestException, KeyError, IndexError, ValueError):
        _geocode_cache[cache_key] = None
        return None


def haversine_miles(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in miles."""
    R = 3959
    lat1_r, lat2_r = math.radians(lat1), math.radians(lat2)
    dlat, dlng = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1_r) * math.cos(lat2_r) * math.sin(dlng / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _svc_entry(svc: dict) -> dict:
    entry = {
        "name": svc["name"],
        "description": svc.get("description", ""),
        "category": svc.get("category", "Other"),
    }
    if svc.get("poll"):
        entry["poll"] = True
    return entry


def list_services() -> list[dict]:
    """List curated services from services.yml."""
    catalog = _load_catalog()
    return [_svc_entry(svc) for svc in catalog]


def get_catalog_entry(service_name: str) -> Optional[dict]:
    """Look up a service's catalog entry from services.yml."""
    catalog = _load_catalog()
    for svc in catalog:
        if svc["name"] == service_name:
            return svc
    return None


def search_services(query: str) -> list[dict]:
    """Search curated services by keyword (case-insensitive, matches name, description, or category)."""
    catalog = _load_catalog()
    terms = query.lower().split()
    results = []
    for svc in catalog:
        searchable = f"{svc['name']} {svc.get('description', '')} {svc.get('category', '')}".lower()
        if all(term in searchable for term in terms):
            results.append(_svc_entry(svc))
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

    # Auto-detect address, city, zip, lat/lng, and date fields
    address_field = None
    city_field = None
    zip_field = None
    lat_field = None
    lng_field = None
    date_fields = []

    address_patterns = re.compile(r"^(address|location|street|incident_location|mapped_location)$", re.IGNORECASE)
    city_patterns = re.compile(r"^(city|cityname|city_name)$", re.IGNORECASE)
    zip_patterns = re.compile(r"^(zip|zipcode|zip_code|postalcode|postal_code)$", re.IGNORECASE)
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
        if not zip_field and zip_patterns.match(fname):
            zip_field = fname
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
        zip_field=zip_field,
        lat_field=lat_field,
        lng_field=lng_field,
        date_fields=date_fields,
        display_name=display_name,
    )
    _service_meta_cache[cache_key] = meta
    return meta


def fetch_records(service_name: str, layer: int = 0, max_records: int = 1000,
                  order_by: Optional[str] = None,
                  date_from: Optional[str] = None, date_to: Optional[str] = None,
                  date_field: Optional[str] = None,
                  center: Optional["Coordinates"] = None,
                  radius_miles: Optional[float] = None) -> list[dict]:
    """Fetch records from a service. Returns list of attribute dicts with optional geometry.

    If center and radius_miles are provided, applies a server-side spatial
    filter so ArcGIS only returns records within the radius.
    """
    url = f"{ARCGIS_BASE}/{service_name}/FeatureServer/{layer}/query"

    where = "1=1"
    # Normalize datetime-local format (T separator) to ArcGIS timestamp format
    _df = date_from.replace("T", " ") if date_from else None
    _dt = date_to.replace("T", " ") if date_to else None
    if _df and _dt and date_field:
        where = f"{date_field} BETWEEN timestamp '{_df}' AND timestamp '{_dt}'"
    elif _df and date_field:
        where = f"{date_field} >= timestamp '{_df}'"
    elif _dt and date_field:
        where = f"{date_field} <= timestamp '{_dt}'"

    params = {
        "where": where,
        "outFields": "*",
        "outSR": "4326",
        "f": "json",
        "resultRecordCount": max_records,
    }
    if order_by:
        params["orderByFields"] = order_by

    # Server-side spatial filter: point + radius
    if center is not None and radius_miles is not None and radius_miles > 0:
        params["geometry"] = f"{center.lng},{center.lat}"
        params["geometryType"] = "esriGeometryPoint"
        params["inSR"] = "4326"
        params["spatialRel"] = "esriSpatialRelIntersects"
        params["distance"] = radius_miles
        params["units"] = "esriSRUnit_StatuteMile"

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
            # Nashville datasets use neighborhood/precinct names in the "city" field
            # (e.g. "GERMANTOWN", "DONELSON"), not actual cities. Always use Nashville.
            city_hint = "Nashville, TN"
            return geocode_address(addr, city_hint=city_hint)

    # Last resort: geocode ZIP code centroid via Nominatim
    if meta.zip_field:
        zipcode = record.get(meta.zip_field)
        if zipcode and isinstance(zipcode, str) and zipcode.strip():
            return geocode_zip(zipcode)

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



def _build_time_histogram(records: list[dict], date_field: str) -> list[dict]:
    """Build a time histogram from records, auto-selecting bucket size."""
    timestamps = []
    for r in records:
        val = r.get(date_field)
        if val is None:
            continue
        try:
            if isinstance(val, (int, float)):
                ts = val / 1000  # ArcGIS epoch millis
            else:
                continue
            timestamps.append(ts)
        except (ValueError, TypeError):
            continue

    if not timestamps:
        return []

    timestamps.sort()
    span_hours = (timestamps[-1] - timestamps[0]) / 3600

    # Pick bucket size based on time span
    if span_hours <= 6:
        bucket_secs = 600       # 10 minutes
        fmt = "%H:%M"
    elif span_hours <= 48:
        bucket_secs = 3600      # 1 hour
        fmt = "%m/%d %H:%M"
    elif span_hours <= 720:     # 30 days
        bucket_secs = 86400     # 1 day
        fmt = "%m/%d"
    else:
        bucket_secs = 604800    # 1 week
        fmt = "%m/%d"

    buckets: dict[int, int] = {}
    for ts in timestamps:
        bucket = int(ts // bucket_secs) * bucket_secs
        buckets[bucket] = buckets.get(bucket, 0) + 1

    result = []
    for bucket_ts in sorted(buckets):
        dt = datetime.fromtimestamp(bucket_ts, tz=timezone.utc)
        result.append({
            "t": dt.isoformat(),
            "label": dt.strftime(fmt),
            "count": buckets[bucket_ts],
        })

    return result


def find_nearby(service_name: str, address: str, radius_miles: float = 2.0,
                layer: int = 0, max_records: int = 1000,
                date_from: Optional[str] = None,
                date_to: Optional[str] = None) -> dict:
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

    # Use the explicitly configured date_field from services.yml if available,
    # otherwise skip date filtering entirely (avoids filtering on admin metadata)
    order_by = None
    date_field = None
    catalog = get_catalog_entry(service_name)
    if catalog and catalog.get("date_field"):
        date_field = catalog["date_field"]
        order_by = f"{date_field} DESC"

    # Use server-side spatial filtering for all services with geometry
    spatial_center = query_coords if meta.has_geometry else None
    spatial_radius = radius_miles if meta.has_geometry else None

    records = fetch_records(service_name, layer=layer, max_records=max_records,
                            order_by=order_by, date_from=date_from,
                            date_to=date_to, date_field=date_field,
                            center=spatial_center, radius_miles=spatial_radius)

    nearby = []
    no_location = 0
    for record in records:
        record_coords = _get_record_coords(record, meta)
        if record_coords is None:
            no_location += 1
            continue
        dist = haversine_miles(query_coords.lat, query_coords.lng,
                               record_coords.lat, record_coords.lng)
        # When server-side spatial filter is active, ArcGIS already filtered
        # by radius — but we still compute exact haversine and apply the cutoff
        # since ArcGIS uses envelope intersection (slightly larger than circle)
        if dist <= radius_miles:
            nearby.append(_format_record(record, meta, distance=dist, coords=record_coords))

    nearby.sort(key=lambda r: r.get("_distance_miles", 999))

    result = {
        "service": service_name,
        "display_name": meta.display_name,
        "query_address": address,
        "coordinates": {"lat": query_coords.lat, "lng": query_coords.lng},
        "radius_miles": radius_miles,
        "total_fetched": len(records),
        "count": len(nearby),
        "no_location": no_location,
        "has_geometry": meta.has_geometry,
        "address_field": meta.address_field,
        "cluster": catalog.get("cluster", True) if catalog else True,
        "records": nearby,
    }

    # Time histogram from ALL fetched records (not just nearby)
    if meta.date_fields:
        result["time_histogram"] = _build_time_histogram(records, meta.date_fields[0])

    return result


def get_pollable_services() -> list[dict]:
    """Return services from the catalog that have poll: true."""
    catalog = _load_catalog()
    return [svc for svc in catalog if svc.get("poll")]


def fetch_service_raw(service_name: str, layer: int = 0) -> list[dict]:
    """Fetch raw attribute dicts from a service (for the poller).

    Returns geometry-enriched attribute dicts (point coords or centroids
    injected as _geom_x/_geom_y) so cached records can be mapped without
    re-querying ArcGIS.
    """
    records = fetch_records(service_name, layer=layer, max_records=500)
    return records


def find_nearby_cached(service_name: str, address: str, radius_miles: float = 2.0,
                       cached_events: Optional[list[dict]] = None) -> dict:
    """Proximity search using cached events instead of live-only."""
    meta = get_service_meta(service_name, layer=0)
    if meta is None:
        return {"error": f"Service '{service_name}' not found"}

    query_coords = geocode_address(address)
    if query_coords is None:
        return {"error": "Could not geocode query address", "query_address": address}

    if cached_events is None:
        cached_events = []

    nearby = []
    no_location = 0
    for evt in cached_events:
        record_coords = _get_record_coords(evt, meta)
        if record_coords is None:
            no_location += 1
            continue

        dist = haversine_miles(query_coords.lat, query_coords.lng,
                               record_coords.lat, record_coords.lng)
        if dist <= radius_miles:
            formatted = _format_record(evt, meta, distance=dist, coords=record_coords)
            formatted["_status"] = evt.get("_status", "live")
            formatted["_first_seen"] = evt.get("_first_seen")
            formatted["_last_seen"] = evt.get("_last_seen")
            nearby.append(formatted)

    nearby.sort(key=lambda r: r.get("_distance_miles", 999))

    result = {
        "service": service_name,
        "display_name": meta.display_name + " (Cached)",
        "query_address": address,
        "coordinates": {"lat": query_coords.lat, "lng": query_coords.lng},
        "radius_miles": radius_miles,
        "total_cached": len(cached_events),
        "count": len(nearby),
        "no_location": no_location,
        "has_geometry": meta.has_geometry,
        "address_field": meta.address_field,
        "records": nearby,
    }

    if meta.date_fields:
        result["time_histogram"] = _build_time_histogram(cached_events, meta.date_fields[0])

    return result


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
