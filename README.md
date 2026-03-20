# nash-services

A web app for browsing and searching Nashville Open Data by location. Pick a dataset, enter an address, and see what's nearby on a map.

Live at [nash-services.quietlife.net](https://nash-services.quietlife.net).

Built on a curated catalog of Nashville ArcGIS FeatureServer datasets — police dispatch, 311 requests, road closures, fire incidents, short-term rental permits, and more.

## Quick Start

```bash
docker compose up -d
```

Then open [http://localhost:5010](http://localhost:5010).

Pre-built images are also available:

```bash
docker run -p 5000:5000 ghcr.io/cwage/nash-services:latest
```

See [Packages](https://github.com/cwage/nash-services/pkgs/container/nash-services) for available tags.

## How It Works

1. Select a dataset from the curated service catalog (`services.yml`)
2. Enter an address and search radius
3. The app geocodes your address via the US Census Geocoder
4. Queries the ArcGIS FeatureServer for nearby records (using server-side spatial filtering for point/centroid datasets, or client-side filtering for geocode-mode datasets)
5. Results are plotted on a Leaflet map and listed in the sidebar, sorted by distance

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |
| `GET /services?q=<query>` | List/search available services |
| `GET /info/<service_name>` | Service metadata (fields, geometry, etc.) |
| `GET /nearby/<service_name>?address=<addr>&radius=<miles>` | Proximity search |
| `GET /records/<service_name>?max=<n>` | List raw records |

## CLI

A shell CLI (`alltheapis.sh`) also exists for quick lookups:

```bash
./alltheapis.sh --search "police dispatch"
./alltheapis.sh -s Metro_Nashville_Police_Department_Active_Dispatch_Table_view -a "1000 Broadway, Nashville"
```

Run `./alltheapis.sh --help` for full usage.

## Data Source

All data comes from [Nashville Open Data](https://data.nashville.gov/) via ArcGIS FeatureServer. No API key required.

## License

MIT
