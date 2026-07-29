# Shipment Tracker REST API Reference

Base URL: `https://logistics-tracker.ngrok.app/api`

Endpoint rule: use only this production endpoint. Legacy numeric IP endpoints are retired and must not be used.

Authentication: `Authorization: Token <token>` on every request. Add `X-Agent-Name: <agent or service name>` for audit logs.

Permissions:

- Read Only: `GET` only.
- Read Add Update: `GET`, `POST`, `PUT`, `PATCH`. No `DELETE`, no close/reopen, no template management.
- Full CRUD: all API actions.

## Common CRUD pattern

For these entities, use:

- `GET /api/{entity}/` - list
- `GET /api/{entity}/{id}/` - retrieve
- `POST /api/{entity}/` - create
- `PATCH /api/{entity}/{id}/` - update
- `DELETE /api/{entity}/{id}/` - delete

Child entities support `?shipment={shipment_id}` filtering where noted.

## Records - entity `records`

Endpoints:

- `GET /api/records/` - list shipments
- `POST /api/records/` - create shipment
- `GET /api/records/{id}/` - retrieve full detail with nested references, process steps, Actions, activity, tracking, customs, closeout, documents, parties, exceptions
- `PATCH /api/records/{id}/` - update shipment
- `DELETE /api/records/{id}/` - delete shipment, Full CRUD only
- `GET /api/records/search/?q={term}` - search by purchase order, sales order, tracking, internal key, anchor value, reference value, step name
- `GET /api/records/{id}/timeline/` - process step timeline
- `POST /api/records/{id}/notes/` with `{"note":"..."}` - add activity note
- `POST /api/records/{id}/close/` - close, Full CRUD only, requires all steps completed or skipped
- `POST /api/records/{id}/reopen/` - reopen, Full CRUD only

Writable fields:

- Required: `main_reference`
- Optional: `pattern` (`inbound`, `outbound`, `third_party`, `round_trip`, `unknown`), `template`, `movement_status` (`unknown`, `awaiting`, `in_transit`, `at_customs`, `delivered`, `closed`, `exception`), `data_completeness` (`needs_details`, `usable`, `complete`, `closed`), `risk_state` (`unknown`, `on_track`, `at_risk`, `delayed`, `breached`), `owner_user`, `owner_queue`, `next_action`, `next_action_due_date`, `expected_date`, `notes`, `origin_name`, `origin_latitude`, `origin_longitude`, `destination_name`, `destination_latitude`, `destination_longitude`.
- Route validation: provide latitude and longitude together for each endpoint. A name is required when an endpoint has coordinates. All six route values must be present before the Control Tower can map the shipment. Do not guess coordinates.
- Read-only: `id`, `internal_key`, `created_at`, `updated_at`, `closed_at`.

## References - entity `references`

Supports `?shipment={id}`.

Writable fields:

- Required: `shipment`, `anchor_type`, `anchor_value`
- Optional: `source`, `is_primary`
- `anchor_type`: `tracking`, `po`, `so`, `odoo_picking`, `awb`, `bl_bol`, `container`, `invoice`, `customs_reference`, `asset_serial`, `party_context`, `receipt_context`, `other`
- Creating a tracking reference also syncs a tracking entry.
- Reference validation may reject duplicate/invalid primary references.

## Process steps - entity `steps`

Supports `?shipment={id}`.

Writable fields:

- Required: `shipment`, `step_name`
- Optional: `step_order`, `step_type`, `status`, `owner_user`, `owner_queue`, `followers`, `estimated_complete_by`, `hard_due_date`, `actual_completed_at`, `next_action`, `reference_type`, `reference_value`, `document_url`, `customs_status`, `customs_broker`, `customs_hold_reason`, `customs_required_from_verivolt`, `result`, `notes`
- `step_type`: `information`, `initiate`, `supplier_process`, `manufacturing`, `quality_check`, `packing`, `ready_to_ship`, `movement_checkpoint`, `customs_followup`, `calibration`, `repair`, `receipt_followup`, `odoo_closeout`, `shipping`, `customs`, `receiving`, `closeout`, `exception`, `document`, `return_obligation`, `other`
- `status`: `not_started`, `in_progress`, `blocked`, `completed`, `skipped`, `at_risk`, `breached`
- Read-only: `id`, `alarm_state`, display fields, timestamps.
- `alarm_state` is recalculated after create/update.

## Tracking entries - entity `tracking`

Supports `?shipment={id}`.

Writable fields:

- Required: `shipment`, `tracking_number`
- Optional: `carrier`, `package_label`, `status`, `current_location`, `eta`, `last_update_at`, `source`, `notes`
- `status`: `unknown`, `label_created`, `picked_up`, `in_transit`, `at_customs`, `out_for_delivery`, `delivered`, `exception`

## Customs events - entity `customs`

Supports `?shipment={id}`.

Writable fields:

- Required: `shipment`
- Optional: `customs_required`, `jurisdiction`, `broker`, `status`, `reference_number`, `hold_reason`, `next_action`, `notes`
- `customs_required`: `unknown`, `yes`, `no`
- `status`: `not_required`, `expected`, `filed`, `under_review`, `hold`, `cleared`, `released`, `rejected`, `exception`

## Closeout items - entity `closeout`

Supports `?shipment={id}`.

Writable fields:

- Required: `shipment`, `closeout_type`
- Optional: `required`, `status`, `completed_at`, `completed_by`, `reason`, `notes`
- `closeout_type`: `physical_receipt`, `odoo_receipt`, `receiver_confirmation`, `return_received`, `obligation_closed`, `non_odoo_reason`
- `status`: `pending`, `complete`, `not_required`, `blocked`
- Read-only: `is_satisfied`, timestamps.

## Documents - entity `documents`

Supports `?shipment={id}`.

Writable fields:

- Required: `shipment`, `document_type`, `url`
- Optional: `reference_number`, `notes`
- `document_type`: `commercial_invoice`, `packing_list`, `awb_bl`, `customs`, `receipt_proof`, `claim`, `other`
- Read-only: `added_by`, `added_at`.

## Parties - entity `parties`

Supports `?shipment={id}`.

Writable fields:

- Required: `shipment`, `party_name`, `party_type`
- Optional: `role`, `odoo_partner_id`, `contact_info`, `notes`
- `party_type`: `supplier`, `customer`, `cm`, `carrier`, `broker`, `verivolt_site`, `service_provider`, `other`
- `role`: `seller`, `shipper`, `consignee`, `buyer`, `importer`, `exporter`, `broker`, `carrier`, `custodian`, `receiver`, `owner`, `other`

## Exceptions - entity `exceptions`

Supports `?shipment={id}`.

Writable fields:

- Required: `shipment`, `exception_type`, `description`
- Optional: `status`, `scope`, `owner_user`, `claim_reference`, `replacement_shipment`, `resolved_at`
- `exception_type`: `lost`, `damaged`, `delayed`, `customs_hold`, `partial_receipt`, `partial_customs_release`, `misdelivered`, `refused`, `rerouted`, `unknown`
- `status`: `open`, `investigating`, `resolved`, `closed`

## Actions - entity `actions`

Actions are the canonical follow-up work record. An Action attaches to exactly one parent: a Shipment, Process Step, or Exception. Do not use Shipment or Process Step `next_action` fields as a second independently managed Action system.

Endpoints:

- `GET /api/actions/` - list Actions
- `GET /api/actions/?shipment={id}` - list Actions on a shipment, its steps, or its exceptions
- `GET /api/actions/mine/` - current authenticated user's open Actions
- `POST /api/actions/` - create Action
- `GET /api/actions/{id}/` - retrieve Action and history
- `PATCH /api/actions/{id}/` - update Action
- `DELETE /api/actions/{id}/` - delete is restricted by API role; use `cancelled` status rather than deletion for saved Actions

Create fields:

- Required: exactly one of `shipment`, `process_step`, `exception`; `problem_type`.
- Defaulted from the selected problem type when omitted: `assigned_user`, `backup_user`, `next_action`, `action_due_date`.
- Optional: `waiting_on`, `status`, `source`, `source_reference`.
- `status`: `open`, `in_progress`, `waiting`, `resolved`, `cancelled`.
- `waiting_on` is required when status is `waiting`.
- `resolution_note` is required when status is `resolved`.
- `cancellation_reason` is required when status is `cancelled`.
- The API blocks duplicate open Actions with the same parent and problem type.

## Problem types - entity `problem-types`

Problem types are dynamic reusable defaults for new Actions.

Fields:

- Required: `name`, `default_assigned_user`.
- Optional: `description`, `default_backup_user`, `default_due_business_days`, `suggested_next_action`, `is_active`.
- Use `is_active=false` to retire a type. Do not delete a type used by Action history.

## Products - entity `products`

Supports `?shipment={id}` on the full entity list when implemented by the API. Also available under shipment records:

- `GET /api/records/{id}/products/` - list product lines for one shipment
- `POST /api/records/{id}/products/` - add a product line to one shipment

Common CRUD endpoint:

- `GET /api/products/` - list products
- `POST /api/products/` - create product
- `GET /api/products/{id}/` - retrieve product
- `PATCH /api/products/{id}/` - update product
- `DELETE /api/products/{id}/` - delete product, Full CRUD only

Writable fields:

- Required: `shipment`, `product_name`
- Optional: `sku`, `quantity`, `serial_number`, `description`, `country_of_origin`, `hs_code`, `declared_value`, `currency`, `notes`
- Do not send `unit_of_measure`; product quantity is treated as units for now.
- Read-only: `id`, `created_at`, `updated_at`.
- Creating/updating a product with `serial_number` also syncs an Asset serial reference for shipment search.

## Payloads - entity `payloads`

Payloads store external business data attached to a shipment, with optional process-step linkage for future process-level payloads. Payload content is text so it can hold JSON, text, CSV, XML, HTML, email, URL, file reference, or other formats.

Shipment-specific endpoints:

- `GET /api/records/{id}/payloads/` - list payloads for one shipment
- `POST /api/records/{id}/payloads/` - add payload to one shipment

Common CRUD endpoint:

- `GET /api/payloads/` - list payloads
- `POST /api/payloads/` - create payload
- `GET /api/payloads/{id}/` - retrieve payload
- `PATCH /api/payloads/{id}/` - update payload
- `DELETE /api/payloads/{id}/` - delete payload, Full CRUD only

Writable fields:

- Required: `shipment`, `payload_title`, `payload_type`, `payload_content`
- Optional: `process_step`, `payload_source`, `payload_notes`
- `payload_type`: `json`, `text`, `csv`, `xml`, `html`, `email`, `url`, `file_reference`, `other`
- Read-only: `id`, `process_step_name`, `created_by`, `created_at`, `updated_at`

## Templates - entity `templates`

Endpoints:

- `GET /api/templates/` - list templates and nested template steps
- `POST /api/templates/` - create template, Full CRUD only
- `GET /api/templates/{id}/` - retrieve
- `PATCH /api/templates/{id}/` - update, Full CRUD only
- `DELETE /api/templates/{id}/` - delete, Full CRUD only
- `POST /api/templates/{template_id}/apply-to/{shipment_id}/` - apply template to shipment, Full CRUD only

Writable template fields: `name`, `description`, `is_active`.

## Template steps - entity `template-steps`

Writable fields:

- Required: `template`, `step_order`, `step_name`
- Optional: `step_type`, `owner_queue`, `followers`, `next_action`, `notes`

## Issues

Read-only endpoints:

- `GET /api/issues/overdue/` - steps at risk or breached
- `GET /api/issues/shipping/` - open shipping steps
- `GET /api/issues/customs/` - open customs steps
- `GET /api/issues/receiving/` - open receiving steps
- `GET /api/issues/closeout/` - open closeout steps

## Date formats

Use ISO 8601 strings:

- Date fields: `YYYY-MM-DD`
- Date-time fields: `YYYY-MM-DDTHH:MM:SSZ` or timezone-aware ISO format.
