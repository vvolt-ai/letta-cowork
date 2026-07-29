---
name: logistic-shipment
description: Uses the hosted Verivolt Shipment Tracker REST API for shipment records, references, process steps, Actions, dynamic problem types, tracking, customs, closeout, documents, parties, exceptions, products, payloads, templates, issue lists, search, notes, close/reopen, and full Create Read Update Delete workflows. Use when the user asks to work with shipment-tracker, logistic tracker, shipment Actions, problem types, shipment REST API, shipment CRUD, or the hosted URL logistics-tracker.ngrok.app.
---

# Logistic Shipment

Use this skill to operate the hosted Shipment Tracker application at `https://logistics-tracker.ngrok.app/api`.

Use only this production endpoint. Legacy numeric IP endpoints are retired and must not be used in commands, examples, cached context, or helper overrides.
Do not pass `--base-url`; the helper rejects endpoint overrides to prevent stale cached context from reaching retired servers.

## Critical rules

- The API token must be configured securely as a Letta secret (`SHIPMENT_TRACKER_TOKEN`).
- Never ask the user to paste the raw token into the chat transcript. Instruct them to set the secret.
- Use the helper script for reliable requests: `scripts/shipment_tracker.py`.
- Read `references/api-reference.md` before doing non-trivial creates, updates, deletes, template work, or when field names/enum values are uncertain.
- Use `GET` first before destructive or important updates so the target record and current state are verified.

## Token setup

This skill reads the API token securely from the environment using `SHIPMENT_TRACKER_TOKEN`. Do **not** ask the user to provide their token in chat.

Verify the token is available by running:

```bash
SHIPMENT_TRACKER_TOKEN="$SHIPMENT_TRACKER_TOKEN" python3 "<skill-dir>/scripts/shipment_tracker.py" auth status
```

Use the same `SHIPMENT_TRACKER_TOKEN="$SHIPMENT_TRACKER_TOKEN"` prefix for authenticated helper commands.

## Helper quick reference

Replace `<skill-dir>` with the installed skill directory.

```bash
# Search and read
SHIPMENT_TRACKER_TOKEN="$SHIPMENT_TRACKER_TOKEN" python3 "<skill-dir>/scripts/shipment_tracker.py" search "PO-123"
SHIPMENT_TRACKER_TOKEN="$SHIPMENT_TRACKER_TOKEN" python3 "<skill-dir>/scripts/shipment_tracker.py" list records
SHIPMENT_TRACKER_TOKEN="$SHIPMENT_TRACKER_TOKEN" python3 "<skill-dir>/scripts/shipment_tracker.py" get records 12
SHIPMENT_TRACKER_TOKEN="$SHIPMENT_TRACKER_TOKEN" python3 "<skill-dir>/scripts/shipment_tracker.py" timeline 12

# Create, update, delete any CRUD entity
SHIPMENT_TRACKER_TOKEN="$SHIPMENT_TRACKER_TOKEN" python3 "<skill-dir>/scripts/shipment_tracker.py" create records --data '{"main_reference":"PO-123","pattern":"inbound","owner_queue":"India Ops"}'
SHIPMENT_TRACKER_TOKEN="$SHIPMENT_TRACKER_TOKEN" python3 "<skill-dir>/scripts/shipment_tracker.py" update records 12 --data '{"movement_status":"in_transit","next_action":"Monitor carrier updates"}'
SHIPMENT_TRACKER_TOKEN="$SHIPMENT_TRACKER_TOKEN" python3 "<skill-dir>/scripts/shipment_tracker.py" delete documents 7

# Child entity list filtered by shipment
SHIPMENT_TRACKER_TOKEN="$SHIPMENT_TRACKER_TOKEN" python3 "<skill-dir>/scripts/shipment_tracker.py" list steps --shipment 12
SHIPMENT_TRACKER_TOKEN="$SHIPMENT_TRACKER_TOKEN" python3 "<skill-dir>/scripts/shipment_tracker.py" list tracking --shipment 12

# Special actions
SHIPMENT_TRACKER_TOKEN="$SHIPMENT_TRACKER_TOKEN" python3 "<skill-dir>/scripts/shipment_tracker.py" note 12 "Called broker; clearance expected tomorrow."
SHIPMENT_TRACKER_TOKEN="$SHIPMENT_TRACKER_TOKEN" python3 "<skill-dir>/scripts/shipment_tracker.py" close 12
SHIPMENT_TRACKER_TOKEN="$SHIPMENT_TRACKER_TOKEN" python3 "<skill-dir>/scripts/shipment_tracker.py" reopen 12
SHIPMENT_TRACKER_TOKEN="$SHIPMENT_TRACKER_TOKEN" python3 "<skill-dir>/scripts/shipment_tracker.py" issues overdue
SHIPMENT_TRACKER_TOKEN="$SHIPMENT_TRACKER_TOKEN" python3 "<skill-dir>/scripts/shipment_tracker.py" apply-template 3 12

# Raw endpoint escape hatch
SHIPMENT_TRACKER_TOKEN="$SHIPMENT_TRACKER_TOKEN" python3 "<skill-dir>/scripts/shipment_tracker.py" request GET "records/search/" --param q=PO-123
```

## Entity names for helper commands

Use these entity names with `list`, `get`, `create`, `update`, and `delete`:

- `records` or `shipments`
- `references` or `anchors`
- `steps` or `process-steps`
- `tracking`
- `customs`
- `closeout`
- `documents`
- `parties`
- `exceptions`
- `actions`
- `problem-types`
- `products`
- `payloads`
- `templates`
- `template-steps`

## Workflow patterns

### Create a shipment

1. Search first to avoid duplicate records.
2. Create `records` with at least `main_reference`.
3. Add references, parties, process steps, tracking, customs, documents, exceptions, or closeout items as needed.
4. Retrieve the shipment detail and summarize the result.

### Update a shipment or child record

1. Retrieve the current record by ID.
2. Patch only the fields that should change.
3. Retrieve again or inspect the response to verify the change.

### Route data and map readiness

Use shipment route fields when a record must appear on the Control Tower route map. A route is map-ready only when all six values are confirmed:

- `origin_name`, `origin_latitude`, `origin_longitude`
- `destination_name`, `destination_latitude`, `destination_longitude`

Do not infer or guess coordinates from a reference, carrier scan, or partial address. Get the confirmed origin and destination from the requester, shipment documents, carrier record, or an approved source. Supply latitude and longitude together for each endpoint.

Example patch after retrieving and verifying the record:

```bash
SHIPMENT_TRACKER_TOKEN="$SHIPMENT_TRACKER_TOKEN" python3 "<skill-dir>/scripts/shipment_tracker.py" update records 49 --data '{"origin_name":"San Francisco, United States","origin_latitude":"37.77490","origin_longitude":"-122.41940","destination_name":"Bogota, Colombia","destination_latitude":"4.71100","destination_longitude":"-74.07210"}'
```

When route data is incomplete, leave the map fields empty and keep the next Action focused on collecting confirmed route details. The Control Tower lists these as unmapped active events rather than drawing an uncertain route.

For dashboard review, use the web views: `/?layout=control`, `/?layout=operations`, and `/?layout=intelligence`. Control Tower uses a Pacific-centered map. Apply owner, risk, movement, or carrier filters before reporting a focused queue.

### Product detail workflow

Use products for what is moving in the shipment. Use the process timeline for what is happening to the shipment.

1. Get the shipment first.
2. Create `products` with `shipment`, `product_name`, and optional `sku`, `quantity`, `serial_number`, `description`, `country_of_origin`, `hs_code`, `declared_value`, `currency`, and `notes`.
3. Do not send `unit_of_measure`; product quantity is treated as units for now.
4. If a serial number is saved, the app also creates/searches an Asset serial reference.
5. Search can find product name, SKU, serial number, and HS code.

### Payload / external data workflow

Use payloads for business data received from another system that should stay attached to a shipment. Payload content can be JSON, text, CSV, XML, HTML, email, URL, file reference, or other text.

1. Get the shipment first.
2. Create `payloads` with `shipment`, `payload_title`, `payload_type`, and `payload_content`.
3. Optionally set `process_step` if the payload belongs to a specific timeline step. For now, most payloads are shipment-level.
4. Optionally set `payload_source` and `payload_notes`.
5. Search can find payload title, source, and content.

### Delete a record

1. Verify the exact record with `get`.
2. Warn if the user has not clearly requested deletion.
3. Delete only the target entity ID.

### Close a shipment

1. Get the timeline.
2. Confirm every process step status is `completed` or `skipped`.
3. Run `close`. If the API rejects it, report the open steps or error detail.

## REST API details

For field lists, allowed enum values, nested response structure, permissions, and all endpoints, read:

`references/api-reference.md`
