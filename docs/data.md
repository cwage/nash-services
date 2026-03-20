# Nashville Open Data Catalog Reference

All data comes from **Metro Nashville's ArcGIS REST services (primarily FeatureServer)**, published through
[Nashville Open Data](https://data.nashville.gov/).

- **ArcGIS Org ID:** `HdTo6HJqh92wn4D8`
- **Catalog endpoint:** `https://services2.arcgis.com/HdTo6HJqh92wn4D8/arcgis/rest/services?f=json`
- **No API key required** — all services are public.
- **Discovery:** The original starting point was the
  [MNPD Active Dispatches page](https://www.nashville.gov/departments/police/online-resources/active-dispatches),
  which embeds an ArcGIS web map. Inspecting network requests revealed the org ID
  and catalog endpoint, which exposes all ~280 public datasets.

Record counts are approximate and were last audited 2026-03-16.

---

## Included Services

These are the services curated in `services.yml` — datasets that have either
point geometry or geocodable address fields suitable for proximity search.

### Active / Real-Time

Live or frequently-updated operational data. Polled services are cached locally
for faster response and to reduce load on ArcGIS.

| Service | What it is | Records | Mode |
|---------|-----------|---------|------|
| `Metro_Nashville_Police_Department_Active_Dispatch_Table_view` | **MNPD active dispatch calls.** Current police dispatch events — incidents officers are actively responding to. Updated in near-real-time. The original dataset that inspired this project, sourced from the [MNPD Active Dispatches page](https://www.nashville.gov/departments/police/online-resources/active-dispatches). No built-in geometry; locations are street addresses that must be geocoded. | ~12 (fluctuates) | geocode, polled |
| `Nashville_Fire_Department_Active_Incidents_view` | **NFD active incidents.** Current fire department responses — structure fires, medical calls, hazmat, etc. Similar to MNPD dispatch but for fire/EMS. | ~40 (fluctuates) | geocode, polled |
| `Metro_Water_Services_Outages_Feature_Layer_view2` | **Water service outages.** Active Metro Water outage locations — main breaks, service interruptions, boil advisories. | ~0 (fluctuates) | point, polled |
| `NERVE_Road_Closures_view` | **Active road closures.** Current road closures managed by Nashville's NERVE center (Nashville Emergency Response & Vital Events). Geometry is lines/polygons (road segments); we use centroids. | ~20 (fluctuates) | centroid, polled |
| `TransportationHazardReports_public` | **Transportation hazard reports.** Citizen-reported road hazards — potholes, debris, signal outages, downed signs, etc. | ~181 | point, polled |
| `Warming_Stations_view` | **Warming stations.** Seasonal locations where people can shelter from cold weather — community centers, churches, etc. Typically active November–March. | ~52 | point |

### Police / Public Safety

Law enforcement data — incidents, calls for service, and related infrastructure.

| Service | What it is | Records | Mode |
|---------|-----------|---------|------|
| `Metro_Nashville_Police_Department_Incidents_view` | **MNPD crime incidents.** Reported crimes with type, location, and date. The primary historical crime dataset. Supports date filtering. | ~871k | point |
| `MNPD_Calls_for_Service_2025_view` | **Police calls for service (2025).** Every call dispatched to MNPD — not just crimes but also welfare checks, traffic stops, alarms, noise complaints, etc. Much higher volume than incidents. Year-specific datasets go back to 2017. | ~377k | point |
| `Metro_Nashville_Police_Department_Calls_for_Service_2023` | **Police calls for service (2023).** | ~446k | point |
| `Metro_Nashville_Police_Department_Calls_for_Service_2022` | **Police calls for service (2022).** | ~381k | point |
| `Metro_Nashville_Police_Department_Calls_for_Service_2021` | **Police calls for service (2021).** | ~530k | point |
| `Metro_Nashville_Police_Department_Calls_for_Service_2020` | **Police calls for service (2020).** | ~692k | point |
| `Metro_Nashville_Police_Department_Calls_for_Service_2019` | **Police calls for service (2019).** | ~828k | point |
| `Metro_Nashville_Police_Department_Calls_for_Service_2018` | **Police calls for service (2018).** | ~1M | point |
| `License_Plate_Reader_Locations` | **LPR camera locations.** Fixed automated license plate reader cameras operated by MNPD. Static dataset of camera positions. | ~24 | point |
| `Sexually_Oriented_Permitted_Businesses_view` | **Sexually oriented business permits.** Businesses permitted under Nashville's sexually oriented business ordinance — adult bookstores, clubs, etc. | ~6 | point |

### 311 / hubNashville

Citizen service requests filed through hubNashville (Nashville's 311 system) —
trash pickup issues, abandoned vehicles, graffiti, streetlight outages, etc.

| Service | What it is | Records | Mode |
|---------|-----------|---------|------|
| `hubNashville_311_Service_Requests_Current_Year_view` | **311 requests (current year).** Rolling dataset of the current calendar year's requests. | ~57k | point |
| `hubNashville_311_Service_Requests_2025_view` | **311 requests (2025).** | ~246k | point |
| `hubNashville_311_Service_Requests_2024_view` | **311 requests (2024).** | ~279k | point |
| `hubNashville_311_Service_Requests_2023_view` | **311 requests (2023).** | ~274k | point |
| `hubNashville_311_Service_Requests_2022_view` | **311 requests (2022).** | ~262k | point |
| `hubNashville_311_Service_Requests_2021_view` | **311 requests (2021).** | ~318k | point |

### Traffic / Transportation

Crashes, road infrastructure, bike facilities, and transportation projects.

| Service | What it is | Records | Mode |
|---------|-----------|---------|------|
| `Crash_Data_WFL1` | **Traffic crash data.** Reported vehicle collisions with location, date, severity, and contributing factors. | ~49k | point |
| `Traffic_Calming_Projects_view` | **Traffic calming projects.** Speed humps, chicanes, roundabouts, and other traffic calming measures — both installed and planned. Geometry is line segments. | ~1.2k | centroid |
| `Road_Damage_Reporting_Winter_2026_Features_view` | **Road damage reports (Winter 2026).** Citizen-reported road damage from the winter freeze/thaw cycle — primarily potholes. Seasonal dataset. | ~11k | point |
| `BCycle_Locations_view` | **BCycle bike share stations.** Docking stations for Nashville's BCycle bike-share program. | ~33 | point |
| `BikeRacks_view` | **Bike rack locations.** Public bike parking racks, mostly downtown and in parks. | ~389 | point |
| `Bikeways_view` | **Bikeways / bike lanes.** Designated bike lanes, shared lanes, and bike routes. Line geometry; we use centroids. | ~519 | centroid |
| `Crosswalks_2_view` | **Crosswalk locations.** Marked pedestrian crosswalks with type (painted, raised, signaled). | ~1.8k | point |
| `Curb_Ramps_view` | **Curb ramp locations.** ADA curb ramps at intersections — includes compliance status. | ~18k | point |
| `Roadway_Paving_Management_Projects` | **Roadway paving projects.** Planned and completed road resurfacing/reconstruction projects. Line geometry. | ~3.2k | centroid |

### Permits / Development

Building permits, zoning, development applications, and business licenses.

| Service | What it is | Records | Mode |
|---------|-----------|---------|------|
| `Building_Permits_Issued_2` | **Building permits issued.** Approved building permits — new construction, additions, demolitions. Includes contractor, valuation, and permit type. | ~30k | point |
| `Building_Permit_Applications_Feature_Layer_view` | **Building permit applications.** Submitted (not necessarily approved) building permit applications. | ~5.5k | point |
| `Trade_Permits_View` | **Trade permits.** Electrical, mechanical, and plumbing permits — the sub-permits that accompany building work. | ~116k | point |
| `Active_Right-of-Way_Permits` | **Active right-of-way permits.** Permits for work in the public right-of-way — utility cuts, sidewalk closures, dumpster placement, etc. | ~20k | point |
| `Board_of_Zoning_Appeals_Cases_view` | **Board of zoning appeals cases.** Variance and special exception requests heard by the BZA. | ~72 | point |
| `Development_Tracker_Cases_view` | **Development tracker cases.** Active development cases being tracked through the planning process — rezonings, specific plans, subdivisions. | ~573 | point |
| `PlanningDepartmentDevelopmentApplications_view` | **Planning department applications.** Applications submitted to the Metro Planning Department. | ~546 | point |
| `Residential_Short_Term_Rental_Permits_view` | **Short-term rental (Airbnb) permits.** Properties permitted for short-term rental use. Useful for seeing STR density in neighborhoods. | ~17k | point |
| `Beer_Permit_Locations_Feature_Layer_view` | **Beer permit locations.** Businesses with beer sales permits — bars, restaurants, convenience stores. | ~2.1k | point |
| `Registered_Professional_Contractors_view_2` | **Registered professional contractors.** Licensed contractors registered with Metro Codes. | ~7.6k | point |

### Property / Housing

Property records, violations, and housing programs.

| Service | What it is | Records | Mode |
|---------|-----------|---------|------|
| `Property_Standards_Violations_2` | **Property standards violations.** Code enforcement cases for overgrown lots, junk vehicles, unsafe structures, etc. | ~41k | point |
| `Housing_Opportunities_WFL1` | **Housing opportunities.** Affordable and subsidized housing listings — MDHA and partner properties. | ~268 | point |
| `Parcels_view` | **Property parcels.** Every tax parcel in Davidson County with owner, address, and basic property info. Very large dataset; clustering disabled for performance. | ~286k | point |
| `Tax_Increment_Financing_Projects` | **TIF projects.** Tax increment financing districts — areas where increased tax revenue funds infrastructure improvements. | ~69 | point |

### Historic

Historic preservation districts, landmarks, and commission activity.

| Service | What it is | Records | Mode |
|---------|-----------|---------|------|
| `Historic_Districts_and_Properties` | **Historic districts and properties.** National Register and locally designated historic districts and individual landmarks. | ~156 | point |
| `Historic_Commission_Permits` | **Historic commission permits.** Permits reviewed by the Metro Historical Commission for work in historic overlay districts. | ~8.8k | point |
| `Metropolitan_Historic_Zoning_Commission_Permits_view` | **Historic zoning commission permits.** Similar to above — permits for exterior changes in historic zoning overlay districts. May overlap with Historic_Commission_Permits. | ~8.8k | point |
| `Historical_Markers_view` | **Historical markers.** Physical historical markers and plaques across Davidson County. | ~263 | point |

### Parks / Public Spaces

Parks, greenways, and public art.

| Service | What it is | Records | Mode |
|---------|-----------|---------|------|
| `Park_Points__view` | **Parks.** Metro Parks locations with name, address, and amenities. | ~150 | point |
| `Metro_Art_in_Public_Places_view` | **Public art installations.** Artworks commissioned through Metro Arts' Art in Public Places program. | ~164 | point |
| `Metro_Arts_Public_Artwork_view` | **Public artwork.** Broader public artwork dataset including murals, sculptures, and installations. | ~178 | point |

### Public Services

Government facilities, schools, voting, and community resources.

| Service | What it is | Records | Mode |
|---------|-----------|---------|------|
| `Fire_Station_Locations` | **Fire station locations.** All Nashville Fire Department stations. | ~40 | point |
| `Library_Facilities` | **Public libraries.** Nashville Public Library branches. | ~21 | point |
| `Metro_Nashville_Public_Schools_view` | **Public schools.** MNPS school locations — elementary, middle, high, and specialty schools. | ~161 | point |
| `Public_Health_Clinics_view` | **Public health clinics.** Metro Public Health Department clinic locations. | ~4 | point |
| `Metro_Public_Health_Community_Partners_view` | **Public health community partners.** Organizations partnering with Metro Public Health — food banks, counseling centers, etc. | ~298 | point |
| `Metro_Social_Services_Locations_and_Services_Offered_View` | **Social services locations.** Metro social services offices and the programs they offer. | ~12 | point |
| `Pharmaceutical_Disposal_Locations_view` | **Pharmaceutical disposal drop-off locations.** Safe medication disposal sites — pharmacies and police precincts with drop boxes. | ~8 | point |
| `Convenience_Centers_and_Recycling_Dropoff_Locations_view` | **Recycling drop-off and convenience centers.** Locations where residents can drop off recyclables, yard waste, and bulk items. | ~13 | point |
| `Metro_Public_WiFi_Locations_view` | **Public WiFi locations.** Free public WiFi hotspots operated by Metro — libraries, community centers, parks. | ~107 | point |
| `Public_Water_Fountains_and_Hydration_Systems_view` | **Public water fountains.** Drinking fountains and bottle-fill stations in public spaces. | ~172 | point |
| `Davidson_County_Voting_Locations_View` | **Voting locations.** Polling places for Davidson County elections. | ~178 | point |
| `Police_Precincts_view` | **Police precinct locations.** MNPD precinct headquarters and substations. | ~8 | point |
| `FoodStores_Total_view` | **Food stores.** Grocery stores, markets, and food retailers — used in food access/food desert analysis. | ~214 | point |
| `Downtown_Special_Events_Recurring` | **Downtown special events.** Permitted events in downtown Nashville — concerts, festivals, parades, private events. | ~1.7k | point |

### Infrastructure

Capital projects, sidewalks, and public works.

| Service | What it is | Records | Mode |
|---------|-----------|---------|------|
| `Capital_Projects_view` | **Capital projects.** Metro-funded capital improvement projects — parks, roads, buildings, utilities. | ~591 | point |
| `Capital_Project_Management_System_view` | **Capital project management.** More detailed capital project tracking with timelines and status. | ~401 | point |
| `NDOTCapitalProjects_view` | **NDOT capital projects.** Nashville Department of Transportation capital projects specifically. | ~568 | point |
| `NERVE_Facilities_Public_View` | **NERVE facilities.** Nashville Emergency Response & Vital Events facility locations. Often shows 0 records. | ~0 | point |
| `Sidewalk_Inventory_for_ADA_Self_Assessment_view` | **Sidewalk ADA assessment inventory.** Every sidewalk segment in the county with ADA compliance assessment data. Very large dataset. | ~188k | point |
| `Pedestrian_Signal_Inventory_and_ADA_Self_Assessments_view` | **Pedestrian signal ADA assessments.** Pedestrian crossing signals with ADA compliance data — button height, audible signals, timing. | ~3.2k | point |

### Environment

Trees, weather events, and energy data.

| Service | What it is | Records | Mode |
|---------|-----------|---------|------|
| `Root_Nashville_Tree_Tracker_Test_Data` | **Tree tracker data.** Trees planted and tracked through Nashville's Root Nashville urban forestry program. Despite "Test Data" in the name, this appears to be the primary public dataset. | ~39k | point |
| `Hail_Storms` | **Hail storm data.** Historical hail event locations with date and severity. | ~243 | point |
| `Metro_Energy_Use_Intensity_Benchmarking_view` | **Building energy use benchmarking.** Energy usage data for large commercial buildings as required by Metro's benchmarking ordinance. No built-in geometry; addresses must be geocoded. | ~675 | geocode |
| `Traverse_Points_Temperature` | **Urban heat traverse temperature points.** Temperature readings from urban heat island studies — vehicles with sensors driving set routes to map heat variation across the city. | ~25k | point |

---

## Excluded Services

The full ArcGIS catalog contains ~280 services. The following are **not** included
in `services.yml` because they lack usable point geometry/addresses, are
duplicates, are purely administrative, or aren't useful for proximity search.

They're documented here for completeness and in case any become useful later.

### Boundary / District Layers (polygon geometry, no meaningful proximity search)

These define geographic boundaries — council districts, precincts, zoning, etc.
They answer "what district is this in?" rather than "what's near me?"

- `2011_Council_Districts_with_2020_and_2010_Demographics_View` — Old council district boundaries with census demographics
- `2020_Census_Geographies_with_Redistricting_Demographics` — Census tract/block group shapes for redistricting
- `2020_Tracts_with_Blight_Criteria` — Census tracts scored for blight indicators
- `2022_Council_Districts_(Future)_view` — Proposed 2022 redistricting boundaries
- `2022_CouncilDistricts_with_Demographics` — Council districts with demographic overlays
- `BMH_Study_Boundary` — Behavioral/mental health study area boundary
- `Business_Improvement_Districts_view` — BID boundaries (downtown, midtown, etc.)
- `Community_Planning_Areas_(Subareas)_view` — Planning sub-area boundaries
- `Council_Districts_(Current)` — Current Metro Council district polygons
- `Council2011_2020Data` — Historical council district data
- `Davidson_County_Boundary_1` — County boundary outline
- `Downtown_Code_Subdistricts_and_Use_Areas_view` — Downtown zoning subdistricts
- `EastBankBoundary` — East Bank development area boundary
- `EastBankCCM` — East Bank connectivity/corridor map
- `EastBankZoning` — East Bank zoning overlay
- `FEMA_Floodplains_and_Floodways_view` — FEMA flood zone polygons
- `License_Plate_Reader_Quadrants` / `License_Plate_Reader_Quadrants_view` — LPR coverage area polygons (we use the point locations instead)
- `Lot_Boundaries` — Property lot boundary polygons (we use Parcels_view for point data)
- `MDHA_Promise_Zones_` — MDHA Promise Zone boundaries
- `MDHA_Redevelopment_Districts` — MDHA redevelopment district polygons
- `MNPD_Reporting_Areas` — Police reporting area polygons
- `MWS_Service_Area` — Metro Water service territory boundary
- `Neighborhood_Boundaries` — Neighborhood boundary polygons
- `NFD_Beats_view` / `NFD_Zones_view` — Fire department response zone polygons
- `Parcels_with_Building_Characteristics_view` — Parcel polygons with building data (we use Parcels_view)
- `Parcels_with_Zoning_view` — Parcel polygons with zoning overlays
- `Pedestrian_Benefit_Zones_View` — Pedestrian priority area polygons
- `Planned_Unit_Developments_Vw` — PUD boundary polygons
- `Police_Precinct_Boundaries_view` — Precinct boundary polygons (we use the point locations)
- `Recycling_Collection_Quads_view` — Recycling collection route polygons
- `Satellite_Cities_view` — Satellite city boundaries (Belle Meade, Berry Hill, etc.)
- `School_Board_Districts_(Current)` — School board district polygons
- `Services_Districts_view` — General services district / urban services district boundary
- `Specific_Plans` — Specific plan area polygons
- `Subdivision_Boundaries` — Subdivision boundary polygons
- `Voting_Precinct_Boundaries_view` — Voting precinct polygons (we use polling place points)
- `Zip_Code_Boundaries_Vw` — ZIP code boundary polygons
- `Steep_Slopes_view` — Steep slope area polygons
- `Zoning_Vw` / `Zoning_Overlay_Districts_Vw` — Zoning district polygons

### Line Geometry (streets, greenways, routes)

Linear features that don't map well to "what's near me?" point queries.

- `Greenways_and_Greenway_Features` / `Greenways_View` / `Greenways_for_Park_Finder` — Greenway trail lines
- `High_Injury_Network_WFL1` / `Vision_Zero_High_Injury_Network_view` — High-crash road segments
- `Hydrography_Layers` — Rivers, creeks, and water features
- `Major_and_Collector_Street_Plan_Vw` — Street classification lines
- `MWS_Street_Sweeping_Routes` / `NDOT_Street_Sweeping_Schedule` — Street sweeping route lines
- `Park_Trails` / `Park_Trails_for_Park_Finder` / `Parks_Trails_and_Trail_Features` — Trail lines
- `Pavement_view` — Pavement condition line segments
- `Planned_Greenways` — Planned/future greenway routes
- `Sidewalks_View` — Sidewalk line segments (we use the ADA point inventory instead)
- `Snow_Routes_Status_Public_View` — Snow/ice treatment route lines
- `SpeedReductionZones` — Speed reduction zone line segments
- `Street_Centerlines_view` / `Street_Classification` — Street centerline geometry
- `Stormwater_Regulation_Buffers_view` — Stormwater buffer zones
- `Tornado_Tracks_1952_2021` — Historical tornado path lines
- `Trash_Collection_Routes_5_Day_Public_View` — Trash collection route lines
- `Wind_Storm_Paths` — Historical wind storm path lines

### Tabular Data (no geometry at all)

Pure table datasets without any spatial component.

- `Community_Enhancement_Fund_Awards_Table_view` — Grant award records
- `Davidson_County_Cemetery_Survey_Table_view` — Cemetery survey records
- `Davidson_County_Election_Results_Table_view` — Election results
- `Direct_Appropriation_Awards_view` — Direct appropriation grant records
- `eBid_GovDeals_Monthly_Sales_2021_Present_view` / `eBid_Monthly_Sales_2013_2021` — Government surplus auction sales
- `Employee_Earnings_Test` / `Metro_Government_Employee_Earnings_Table_view` — Employee pay data
- `Fleet_Vehicle_Purchases_view` — Vehicle procurement records
- `General_Government_Employees_Demographics_Table_view` — Employee demographics
- `General_Government_Employees_Titles_and_Base_Annual_Salaries_view` — Employee titles/salaries
- `Historical_Commission_Preservation_Awards_Table_view` — Preservation awards
- `Marriage_Records_1864_to_1902` — Historical marriage records
- `Metro_Arts_Grant_History_view` — Arts grant history
- `Metro_Budget_to_Actual_Expenses_(FY2010_-_Present)_` — Budget vs actual expenses
- `Metro_Budget_to_Actual_Revenues_(FY2010_-_Present)_view` — Budget vs actual revenues
- `Metro_Credit_Card_Transactions_view` — Government credit card transactions
- `Metro_Immigration_Interactions_view` — Immigration interaction records
- `Metro_Resident_Survey_Responses_Table_view` — Resident survey responses
- `Metro_Vendor_Payments_view` — Vendor payment records
- `Metropolitan_Council_Members_view` — Current council member roster
- `Nashville_Insights_Content_view` — Nashville Insights articles/content
- `NashDigs_Merge_Table_view` — NashDigs utility project tables
- `Proclamation_Archive_List_2023_to_2027_Term` — Mayoral proclamations
- `Schedule_of_Federal_Grant_Awards_2015_Present_view` — Federal grant records
- `Schedule_of_State_Grant_Awards__2015_Present_view` — State grant records
- `SP_Documents_Public` — Specific plan documents
- `Yearbook_Collection_1` — Historical yearbook records

### COVID-19 / Epidemiological (historical, limited ongoing value)

- `cases_latest_public_view` / `Cases_public` — COVID case data
- `COVID19_14Day_Series_View` — 14-day COVID trend data
- `COVID19_Case_Rates_Public_View` — COVID case rates by area
- `Epidemic_Curve_Cases_by_Specimen_Date_Public_View` — Epidemic curve data
- `EMS_2016_2022_OD_ZIP_Trim_Table` / `Nashville_EMS_ZIP_7_24_23` — EMS overdose data by ZIP
- `ESSENCE_Zip` / `Syndromic_Surveillance_Trim` — Syndromic surveillance data
- `ME_1022_ZIP` / `ME_TRIM_1023` / `ME_TRIMM` — Medical examiner data by ZIP
- `Zip_Code_Counts_Public_View` — ZIP-level COVID counts

### Redistricting / Political Process (one-time use, not proximity-searchable)

- `Council_District_Proposal_*` (multiple) — Various redistricting proposals
- `Metro_Council_A_Public_View` / `Metro_Council_Proposal_Public_View` — Council redistricting maps
- `Redistricting *` (multiple) — Population/demographic data for redistricting
- `School_Board_Plan_*` / `School_Board_Proposal_*` — School board redistricting proposals
- `PB_Projects_2023` / `PBBallot` — Participatory budgeting projects/ballots
- `Police_Chief_Search_Survey_Results_view` — Police chief search survey

### Raster / Canopy Analysis (coverage layers, not point-searchable)

- `Urban_Tree_Canopy_2010_2_view` / `Urban_Tree_Canopy_2016_2_view` / `Urban_Tree_Canopy_2021_view` — Tree canopy coverage polygons
- `CountyBoundary_Tree_Count` / `Sub_Areas_Tree_Count` — Tree count aggregations
- `Heat_Vulnerability_Index` — Heat vulnerability score by area
- `Percent_Change_Population_from_2010_to_2020_by_Census_Tract` — Population change by tract
- `Vision_Zero_Equity_Index_View` — Vision Zero equity scores
- `Vulnerability_Indicators_WFL1` — Vulnerability indicator scores

### Duplicate / Alternate Views

Services that are NashView-specific views or duplicates of datasets we already include.

- `Active_ROW_Permits_for_NashView_Feature_Layer_View` / `Active_ROW_Permits_for_Nashville_view` — NashView versions of ROW permits
- `Building_Permits_Issued_for_NashView` — NashView version of building permits
- `Convenience_Centers_and_Recycling_Dropoff_Locations_Vw` — Alternate view of recycling locations
- `hubNashville_(311)_Service_Requests_1` — Older 311 request view
- `hubNashville_311_Service_Requests_for_NashView_2` / `hubNashville_311_Service_Requests_for_NashView_View` — NashView 311 views
- `License_Plate_Reader_Locations_view` — Alternate view of LPR locations
- `Park_Points_for_NashView` — NashView version of park points
- `Property_Standards_Violations_for_NashView` — NashView version of property violations
- `Road_Damage_Reporting_Winter_2026_Pass_2_view` / `Road_Damage_Reporting_Winter_2026_Pass_3_View` — Additional passes of road damage assessment
- `Crash_Profiles_WFL1` — Crash profile aggregations (we use raw crash data)
- `Traffic_Accidents_2` — Older/alternate crash dataset

### Infrastructure / Utilities (operational/internal)

- `CSSBasins08312016` — Combined sewer system basin boundaries
- `Drainage_Area_Estimates_for_Stormwater_Regulations` — Drainage area polygons
- `DryCreekWeir` / `DryCreekWeirData` — Dry Creek weir monitoring station data
- `Water_Pressure_Zones_` — Water pressure zone boundaries
- `Watersheds` — Watershed boundary polygons
- `NonMetro_Water_Service_Areas` — Non-Metro water utility boundaries
- `NashDigs_Project_Layers_view` — NashDigs utility coordination project layers
- `Problem_Soils` — Problematic soil type polygons
- `Soil_and_Conservation_USDA_Projects_in_Metro_Davidson_County_view` — USDA soil conservation projects
- `Transect_view` — Urban-rural transect classification zones

### Miscellaneous / Low-Value

- `3D_Buildings_for_Davidson_County` — 3D building models (SceneServer, not FeatureServer)
- `Air_Quality_and_Pollen_Count_1` — Air quality/pollen data (limited geometry)
- `Affordable_Housing_Map_Barnes_Fund_Public_View` — Barnes Fund affordable housing map
- `Approved_CIB_Projects` — Capital improvements board approved projects
- `Building_Footprints_view` — Building footprint polygons
- `Capital_Project_Management_System_Merged_Tables_view` — Merged capital project tables
- `Choose_How_You_Move_Data_Public_View` / `CHYM_FY26_Public_View` — Transportation survey/plan data
- `Climate_Adaptation_Resilience_Strategies_view` — Climate resilience strategy areas
- `Community_Oversight_Resolution_Reports_1` — Community oversight board reports
- `Council_District_Demographic_Profiles_Public_view` — Council district demographics
- `Council_District_MPC_Recommendation_Public_View` — Planning commission recommendations
- `DRAFT_Locals_To25_USD` — Draft local dataset (unclear purpose)
- `Early_Voting_Locations_View` — Early voting sites (seasonal; we have general voting locations)
- `FoodDesertBlocks_RuralOnly_view` / `FoodDesertBlocks_UrbanOnly__view` — Food desert census blocks
- `Historic_Nashville_City_Cemetery_Interments_(1846-1979)_view` / `Historic_Nashville_City_Cemetery_Interments_(1980-present)_view` — Cemetery interment records
- `Historic_Nashville_Layers` — Historic map overlays
- `Historical_Council_Districts` / `Historical_School_Board_Districts` — Historical district boundaries
- `Metro_Arts_THRIVE_Projects_view` — Arts THRIVE program projects
- `Metro_Rain_Gauge_Data` — Rain gauge readings
- `Metro_Water_Service_Known_System_Issue` — Water system known issues
- `Mobility_Connections_WFL1` / `Social_Connections_WFL1` — Connectivity analysis layers
- `Nashville_Digital_Inclusion_Needs_Assessment_Results_view` — Digital inclusion survey results
- `Nashville_Enslaved_and_Free_People_of_Color_Database_view` — Historical database
- `Nashville_Next_Concept_Map_View` — NashvilleNext plan concept map
- `Nashville_Open_Data_Request_Survey_Public_View` — Open data request survey
- `NESMonthlyEnergyConsumption*` (3 services) — NES energy consumption tables by type/ZIP
- `NERVE_EOC_Status` — Emergency operations center status
- `NERVE_Hazards_Public_View` — NERVE hazard reports (likely overlaps TransportationHazardReports)
- `Park_Boundary_View` / `Park_Features_view` / `Parks_Facilities` / `Parks_Land_Bank_Acquisitions` — Park boundary/feature polygons (we use Park_Points)
- `Road_Closure_Buffer_Public_View` — Road closure buffer polygons (we use NERVE_Road_Closures)
- `RoadClosures_public_*` — Alternate road closure view
- `Schools_Served_by_Metro_Arts_Grantees_view` — Schools receiving arts grants
- `Short_Term_Rental_in_SP_and_PUD` — STRs in specific plans/PUDs
- `Traffic_Management_Center` — Traffic management center location
- `UBT___PUMA_Task_Force_DEMO_view` / `UBT_-_PUMA_Task_Force_DEMO_view` — Demo/test data
- `Zoning_Download_Test` / `Zoning_Download_Test_view` — Test datasets
- `survey123_*` (14 services) — Internal Survey123 form data (not public-facing content)

### Potentially Interesting (may revisit)

Services that could be useful but need investigation or have geometry issues.

- `Metro_Nashville_Police_Department_Calls_for_Service_2024` — 2024 calls for service. Has point geometry but **returned 0 records** as of 2026-03-20 — may be a placeholder or data may live in a differently-named service. Note the naming convention shifted: 2018–2023 use `Metro_Nashville_Police_Department_Calls_for_Service_YYYY`, while 2025 uses `MNPD_Calls_for_Service_2025_view`.
- `Metro_Nashville_Police_Department_Calls_for_Service_2017` — 2017 calls for service. Would extend our history back one more year (currently have 2018–2023 + 2025).
- `Metro_Nashville_Police_Department_Calls_for_Service_view` — Possibly a rolling/current-year view of CFS data. Worth investigating whether this overlaps with the year-specific datasets.
- `hubNashville_311_Service_Requests_2017_view` through `hubNashville_311_Service_Requests_2020_view` — Earlier 311 years. Confirmed: same schema as 2021+ (point geometry, Address field, Date_Time_Opened). Could add these for deeper historical 311 search.
- `Community_Review_Board_Compliance_Review_Reports_view` — Civilian oversight board compliance reviews (may have location data)
- `Affordable_Housing_Map_Barnes_Fund_Public_View` — Affordable housing locations (may have useful point geometry)
- `Downtown_Special_Events_Recurring` — Already included, but there may be a non-recurring events dataset worth finding

---

## Notes for Glossary Modal

The `description` field in `services.yml` is a terse label. The longer descriptions
in this document (the "What it is" column) are intended to be the basis for a
per-dataset glossary popup in the UI — explaining in plain English what the data
represents, who produces it, and what kinds of things you'd find in it.

When implementing the glossary:
- Use the first sentence as a headline/title
- Use subsequent sentences as explanatory body text
- Consider linking to the original Nashville Open Data page where available
- For year-specific datasets (CFS, 311), explain the pattern once and note the year range
