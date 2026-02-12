# AOIB Bulk Edit (Scaffold)

Applies a batch of filesystem operations (move/rename/delete) inside `soundscape/assets/aoib_ogg/` and mirrors the **same** operations in the AOIB catalog.

This is designed to be driven by your verbal instructions by translating them into a JSON change plan.

## Safety principles

- **Dry-run first**: prints exactly what would change.
- **No overwrites** by default: collisions fail unless explicitly allowed.
- **Creates a log** of every applied operation.

## Requirements

- Python 3.11+
- For XLSX updates: `openpyxl` (optional)

## Usage

```powershell
python scripts/aoib_bulk_edit/aoib_bulk_edit.py --help
python scripts/aoib_bulk_edit/aoib_bulk_edit.py --plan scripts/aoib_bulk_edit/example_change_plan.json --dry-run
python scripts/aoib_bulk_edit/aoib_bulk_edit.py --plan scripts/aoib_bulk_edit/example_change_plan.json --apply
```

## Plan format

See `example_change_plan.json` and `change_plan.schema.json`.
