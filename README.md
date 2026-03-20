# nash-services

Generic proximity search tool for Nashville Open Data (ArcGIS). Pass any service name and an address, get back what's nearby.

Works with all 300+ Nashville ArcGIS FeatureServer datasets — police dispatch, 311 requests, road closures, fire incidents, short-term rental permits, and more.

## Docker Image

Pre-built images are published to `ghcr.io/cwage/nash-services` on an as-needed basis. You can run the latest release with:

```bash
docker run -p 5000:5000 ghcr.io/cwage/nash-services:latest
```

Or pin to a specific version (e.g. `ghcr.io/cwage/nash-services:0.10.2`). See [Packages](https://github.com/cwage/nash-services/pkgs/container/nash-services) for available tags.

## Requirements

- Docker & Docker Compose
- `jq` and `curl` (for the CLI)

## Quick Start

```bash
# Start the API (builds from source)
docker compose up -d

# Search for a service
./alltheapis.sh --search "police dispatch"

# See service fields/schema
./alltheapis.sh --info Metro_Nashville_Police_Department_Active_Dispatch_Table_view

# Find active police dispatches near an address
./alltheapis.sh -s Metro_Nashville_Police_Department_Active_Dispatch_Table_view -a "1000 Broadway, Nashville"

# 311 requests within 1 mile
./alltheapis.sh -s hubNashville_311_Service_Requests_Current_Year_view -a "1000 Broadway" -r 1

# List all available services
./alltheapis.sh --list

# List records without proximity filter
./alltheapis.sh -s Metro_Nashville_Police_Department_Active_Dispatch_Table_view -l
```

## CLI Usage

```
Usage:
  alltheapis.sh -s <service> -a <address> [-r <radius>]   Proximity search
  alltheapis.sh -s <service> -l [-m <max>]                List records
  alltheapis.sh --search <query>                          Search services by keyword
  alltheapis.sh --info <service>                          Show service schema
  alltheapis.sh --list                                    List all services

Options:
  -s, --service        ArcGIS service name
  -a, --address        Address to search near
  -r, --radius         Radius in miles (default: 2.0)
  -l, --list-records   List records without proximity filter
  -m, --max            Max records to fetch (default: 1000)
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |
| `GET /services?q=<query>` | List/search available services |
| `GET /info/<service_name>` | Service metadata (fields, geometry, etc.) |
| `GET /nearby/<service_name>?address=<addr>&radius=<miles>` | Proximity search |
| `GET /records/<service_name>?max=<n>` | List raw records |

## How It Works

1. Queries the Nashville ArcGIS FeatureServer for the named service
2. Auto-detects whether records have geometry (lat/lng) or only addresses
3. Geocodes addresses (yours and the records') via the US Census Geocoder
4. Calculates haversine distance and filters by radius
5. Returns results sorted by proximity

## Data Source

All data comes from [Nashville Open Data](https://data.nashville.gov/) via ArcGIS FeatureServer. No API key required.

## License

MIT
