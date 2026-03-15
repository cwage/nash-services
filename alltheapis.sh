#!/bin/bash
#
# alltheapis.sh - CLI for querying Nashville Open Data services by proximity
#
# Usage:
#   alltheapis.sh -s <service_name> -a <address> [-r <radius_miles>]
#   alltheapis.sh -s <service_name> -l
#   alltheapis.sh --search <query>
#   alltheapis.sh --info <service_name>
#   alltheapis.sh --list
#

API_BASE="http://127.0.0.1:5010"

BOLD="\033[1m"
DIM="\033[2m"
RESET="\033[0m"
CYAN="\033[36m"
YELLOW="\033[33m"
GREEN="\033[32m"
RED="\033[31m"

usage() {
    echo "Usage:"
    echo "  $(basename "$0") -s <service> -a <address> [-r <radius>]   Proximity search"
    echo "  $(basename "$0") -s <service> -l [-m <max>]                List records"
    echo "  $(basename "$0") --search <query>                          Search services by keyword"
    echo "  $(basename "$0") --info <service>                          Show service schema"
    echo "  $(basename "$0") --list                                    List all services"
    echo ""
    echo "Options:"
    echo "  -s, --service   ArcGIS service name"
    echo "  -a, --address   Address to search near"
    echo "  -r, --radius    Radius in miles (default: 2.0)"
    echo "  -l, --list-records  List records without proximity filter"
    echo "  -m, --max       Max records to fetch (default: 1000)"
    echo ""
    echo "Examples:"
    echo "  $(basename "$0") --search 'police dispatch'"
    echo "  $(basename "$0") --info Metro_Nashville_Police_Department_Active_Dispatch_Table_view"
    echo "  $(basename "$0") -s Metro_Nashville_Police_Department_Active_Dispatch_Table_view -a '1000 Broadway, Nashville'"
    echo "  $(basename "$0") -s hubNashville_311_Service_Requests_Current_Year_view -a '1000 Broadway' -r 1"
    exit 1
}

check_api() {
    if ! curl -sf "${API_BASE}/health" > /dev/null 2>&1; then
        echo -e "${RED}Error: API is not running at ${API_BASE}${RESET}"
        echo ""
        echo "Start it with:"
        echo "  cd $(dirname "$0") && docker compose up -d"
        exit 1
    fi
}

format_timestamp() {
    local iso_ts="$1"
    if [ -z "$iso_ts" ] || [ "$iso_ts" = "null" ]; then
        echo "N/A"
        return
    fi
    TZ="America/Chicago" date -d "$iso_ts" "+%Y-%m-%d %I:%M:%S %p %Z" 2>/dev/null || echo "$iso_ts"
}

time_ago() {
    local iso_ts="$1"
    if [ -z "$iso_ts" ] || [ "$iso_ts" = "null" ]; then
        echo ""
        return
    fi
    local then_epoch
    then_epoch=$(date -d "$iso_ts" +%s 2>/dev/null) || return
    local now_epoch
    now_epoch=$(date +%s)
    local diff=$(( now_epoch - then_epoch ))

    if [ $diff -lt 0 ]; then
        echo "in the future"
    elif [ $diff -lt 60 ]; then
        echo "${diff}s ago"
    elif [ $diff -lt 3600 ]; then
        echo "$(( diff / 60 ))m ago"
    elif [ $diff -lt 86400 ]; then
        local h=$(( diff / 3600 ))
        local m=$(( (diff % 3600) / 60 ))
        echo "${h}h ${m}m ago"
    else
        local d=$(( diff / 86400 ))
        local h=$(( (diff % 86400) / 3600 ))
        echo "${d}d ${h}h ago"
    fi
}

print_record() {
    local record="$1"
    local search_address="$2"
    local fields_json="$3"
    local date_fields_json="$4"

    local distance
    distance=$(echo "$record" | jq -r '._distance_miles // empty')
    local record_address
    record_address=$(echo "$record" | jq -r '._address // empty')

    # Header line with distance if available
    if [ -n "$distance" ]; then
        echo -e "${BOLD}${CYAN}═══ ${distance} miles away ═══${RESET}"
    else
        echo -e "${BOLD}${CYAN}═══════════════════${RESET}"
    fi

    # Print each field (skip internal fields)
    echo "$record" | jq -r 'to_entries[] | select(.key | startswith("_") | not) | "\(.key)\t\(.value)"' | while IFS=$'\t' read -r key value; do
        if [ "$value" = "null" ] || [ -z "$value" ]; then
            continue
        fi

        # Check if this is a date field
        local is_date="false"
        if echo "$date_fields_json" | jq -e --arg k "$key" 'index($k) != null' > /dev/null 2>&1; then
            is_date="true"
        fi

        # Get display alias
        local alias
        alias=$(echo "$fields_json" | jq -r --arg k "$key" '.[] | select(.name == $k) | .alias // .name' 2>/dev/null)
        if [ -z "$alias" ] || [ "$alias" = "null" ]; then
            alias="$key"
        fi

        if [ "$is_date" = "true" ]; then
            local formatted
            formatted=$(format_timestamp "$value")
            local ago
            ago=$(time_ago "$value")
            if [ -n "$ago" ]; then
                echo -e "  ${DIM}${alias}:${RESET} ${formatted} ${DIM}(${ago})${RESET}"
            else
                echo -e "  ${DIM}${alias}:${RESET} ${formatted}"
            fi
        else
            echo -e "  ${DIM}${alias}:${RESET} ${value}"
        fi
    done

    # Google Maps directions link
    if [ -n "$search_address" ]; then
        local encoded_search
        encoded_search=$(echo "$search_address" | tr -d '\n' | jq -sRr @uri)
        local dest
        if [ -n "$record_address" ]; then
            dest=$(echo "$record_address" | tr -d '\n' | jq -sRr @uri)
        else
            # Fall back to lat/lng coords
            local lat lng
            lat=$(echo "$record" | jq -r '._lat // empty')
            lng=$(echo "$record" | jq -r '._lng // empty')
            if [ -n "$lat" ] && [ -n "$lng" ]; then
                dest="${lat},${lng}"
            fi
        fi
        if [ -n "$dest" ]; then
            echo -e "  ${DIM}Map:${RESET} https://www.google.com/maps/dir/${encoded_search}/${dest}"
        fi
    fi

    echo ""
}

do_search() {
    local query="$1"
    check_api

    local encoded_query
    encoded_query=$(echo "$query" | tr -d '\n' | jq -sRr @uri)
    local result
    result=$(curl -sf "${API_BASE}/services?q=${encoded_query}")
    local count
    count=$(echo "$result" | jq -r '.count')

    echo -e "${BOLD}Found ${count} service(s) matching '${query}':${RESET}"
    echo ""
    local script
    script=$(basename "$0")
    echo "$result" | jq -r '.services[] | "\(.name)\t\(.description // "")"' | while IFS=$'\t' read -r name desc; do
        if [ -n "$desc" ]; then
            echo -e "  ${DIM}# ${desc}${RESET}"
        fi
        echo -e "  ${script} -s ${name} -a ${DIM}<address>${RESET} -r ${DIM}<radius>${RESET}"
        echo ""
    done
}

do_info() {
    local service="$1"
    check_api

    local result
    result=$(curl -sf "${API_BASE}/info/${service}")

    if echo "$result" | jq -e '.error' > /dev/null 2>&1; then
        echo -e "${RED}Error: $(echo "$result" | jq -r '.error')${RESET}"
        exit 1
    fi

    local display_name
    display_name=$(echo "$result" | jq -r '.display_name')
    local has_geometry
    has_geometry=$(echo "$result" | jq -r '.has_geometry')
    local geometry_type
    geometry_type=$(echo "$result" | jq -r '.geometry_type // "none"')
    local address_field
    address_field=$(echo "$result" | jq -r '.address_field // "none"')

    echo -e "${BOLD}${display_name}${RESET}"
    echo -e "  ${DIM}Service:${RESET}  ${service}"
    echo -e "  ${DIM}Geometry:${RESET} ${has_geometry} (${geometry_type})"
    echo -e "  ${DIM}Address:${RESET}  ${address_field}"
    echo ""
    echo -e "${BOLD}Fields:${RESET}"
    echo "$result" | jq -r '.fields[] | "  \(.name) (\(.type)) - \(.alias)"'
}

do_list_all() {
    check_api

    local result
    result=$(curl -sf "${API_BASE}/services")
    local count
    count=$(echo "$result" | jq -r '.count')

    echo -e "${BOLD}${count} Nashville Open Data services available:${RESET}"
    echo ""
    local script
    script=$(basename "$0")
    echo "$result" | jq -r '.services[] | "\(.name)\t\(.description // "")"' | while IFS=$'\t' read -r name desc; do
        if [ -n "$desc" ]; then
            echo -e "  ${DIM}# ${desc}${RESET}"
        fi
        echo -e "  ${script} -s ${name} -a ${DIM}<address>${RESET} -r ${DIM}<radius>${RESET}"
        echo ""
    done
}

do_nearby() {
    local service="$1"
    local address="$2"
    local radius="$3"
    local max_records="$4"
    check_api

    # First get service info for field metadata
    local info
    info=$(curl -sf "${API_BASE}/info/${service}")
    if echo "$info" | jq -e '.error' > /dev/null 2>&1; then
        echo -e "${RED}Error: $(echo "$info" | jq -r '.error')${RESET}"
        exit 1
    fi

    local fields_json
    fields_json=$(echo "$info" | jq '.fields')
    local date_fields_json
    date_fields_json=$(echo "$info" | jq '.date_fields')
    local display_name
    display_name=$(echo "$info" | jq -r '.display_name')

    echo -e "${DIM}Searching ${display_name} within ${radius} miles of '${address}'...${RESET}"
    echo ""

    local encoded_address
    encoded_address=$(echo "$address" | tr -d '\n' | jq -sRr @uri)
    local result
    result=$(curl -sf "${API_BASE}/nearby/${service}?address=${encoded_address}&radius=${radius}&max=${max_records}")

    if echo "$result" | jq -e '.error' > /dev/null 2>&1; then
        echo -e "${RED}Error: $(echo "$result" | jq -r '.error')${RESET}"
        exit 1
    fi

    local count
    count=$(echo "$result" | jq -r '.count')
    local total
    total=$(echo "$result" | jq -r '.total_fetched')

    echo -e "${BOLD}${GREEN}${count} record(s) found nearby${RESET} ${DIM}(out of ${total} fetched)${RESET}"
    echo ""

    if [ "$count" -eq 0 ]; then
        echo "No records within ${radius} miles."
        return
    fi

    echo "$result" | jq -c '.records[]' | while read -r record; do
        print_record "$record" "$address" "$fields_json" "$date_fields_json"
    done
}

do_list_records() {
    local service="$1"
    local max_records="$2"
    check_api

    local info
    info=$(curl -sf "${API_BASE}/info/${service}")
    if echo "$info" | jq -e '.error' > /dev/null 2>&1; then
        echo -e "${RED}Error: $(echo "$info" | jq -r '.error')${RESET}"
        exit 1
    fi

    local fields_json
    fields_json=$(echo "$info" | jq '.fields')
    local date_fields_json
    date_fields_json=$(echo "$info" | jq '.date_fields')
    local display_name
    display_name=$(echo "$info" | jq -r '.display_name')

    echo -e "${DIM}Fetching records from ${display_name}...${RESET}"
    echo ""

    local result
    result=$(curl -sf "${API_BASE}/records/${service}?max=${max_records}")

    local count
    count=$(echo "$result" | jq -r '.count')

    echo -e "${BOLD}${count} record(s)${RESET}"
    echo ""

    echo "$result" | jq -c '.records[]' | while read -r record; do
        print_record "$record" "" "$fields_json" "$date_fields_json"
    done
}

# Parse arguments
SERVICE=""
ADDRESS=""
RADIUS="2.0"
MAX="1000"
LIST_RECORDS=false
MODE=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        -s|--service)
            SERVICE="$2"; shift 2 ;;
        -a|--address)
            ADDRESS="$2"; shift 2 ;;
        -r|--radius)
            RADIUS="$2"; shift 2 ;;
        -m|--max)
            MAX="$2"; shift 2 ;;
        -l|--list-records)
            LIST_RECORDS=true; shift ;;
        --search)
            MODE="search"; SEARCH_QUERY="$2"; shift 2 ;;
        --info)
            MODE="info"; INFO_SERVICE="$2"; shift 2 ;;
        --list)
            MODE="list_all"; shift ;;
        -h|--help)
            usage ;;
        *)
            echo "Unknown option: $1"
            usage ;;
    esac
done

case "$MODE" in
    search)
        do_search "$SEARCH_QUERY"
        exit 0
        ;;
    info)
        do_info "$INFO_SERVICE"
        exit 0
        ;;
    list_all)
        do_list_all
        exit 0
        ;;
esac

if [ -z "$SERVICE" ]; then
    echo "Error: --service is required"
    echo ""
    usage
fi

if [ "$LIST_RECORDS" = true ]; then
    do_list_records "$SERVICE" "$MAX"
elif [ -n "$ADDRESS" ]; then
    do_nearby "$SERVICE" "$ADDRESS" "$RADIUS" "$MAX"
else
    echo "Error: --address is required for proximity search (or use -l to list records)"
    echo ""
    usage
fi
