import argparse
import csv
import datetime as _dt
import json
import os
import shutil
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Operation:
    type: str  # move | rename | delete
    from_path: str
    to_path: str | None = None
    allow_overwrite: bool = False


def _norm_rel(p: str) -> str:
    p = p.replace('\\', '/').lstrip('/')
    return p


def load_plan(plan_path: Path) -> tuple[Path, Path | None, list[Operation]]:
    plan = json.loads(plan_path.read_text(encoding='utf-8'))
    catalog = plan['catalog']
    csv_path = Path(catalog['csvPath'])
    xlsx_path = Path(catalog.get('xlsxPath')) if catalog.get('xlsxPath') else None
    ops: list[Operation] = []
    for o in plan['operations']:
        ops.append(
            Operation(
                type=o['type'],
                from_path=_norm_rel(o['from']),
                to_path=_norm_rel(o['to']) if o.get('to') else None,
                allow_overwrite=bool(o.get('allowOverwrite', False)),
            )
        )
    return csv_path, xlsx_path, ops


def read_catalog_rows(csv_path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with csv_path.open('r', encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f)
        headers = list(reader.fieldnames or [])
        rows = [dict(r) for r in reader]
    return headers, rows


def write_catalog_rows(csv_path: Path, headers: list[str], rows: list[dict[str, str]]) -> None:
    tmp = csv_path.with_suffix('.csv.tmp')
    with tmp.open('w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=headers)
        w.writeheader()
        for r in rows:
            w.writerow(r)
    tmp.replace(csv_path)


def catalog_file_path_to_rel_ogg(file_path: str) -> str:
    p = file_path.replace('\\', '/').strip().strip('"')
    if p.lower().startswith('aiob 4824/'):
        p = p[len('AIOB 4824/') :]
    if p.lower().endswith('.wav'):
        p = p[: -4] + '.ogg'
    return p


def rel_ogg_to_catalog_file_path(rel_ogg: str) -> str:
    rel = rel_ogg.replace('\\', '/').lstrip('/')
    if rel.lower().endswith('.ogg'):
        rel = rel[: -4] + '.wav'
    return f"AIOB 4824/{rel}"


def apply_catalog_ops(rows: list[dict[str, str]], ops: list[Operation]) -> int:
    changed = 0
    for row in rows:
        fp = (row.get('FilePath') or '').strip()
        if not fp:
            continue
        rel = catalog_file_path_to_rel_ogg(fp)

        new_rel = rel
        for op in ops:
            if op.type in ('move', 'rename'):
                if op.to_path is None:
                    continue
                if rel == op.from_path or rel.startswith(op.from_path.rstrip('/') + '/'):
                    # Path prefix move for folders; exact match for files works too.
                    new_rel = op.to_path + rel[len(op.from_path) :]
            elif op.type == 'delete':
                if rel == op.from_path:
                    row['Notes'] = (row.get('Notes') or '') + ' [DELETED_BY_PLAN]'
        if new_rel != rel:
            row['FilePath'] = rel_ogg_to_catalog_file_path(new_rel)
            changed += 1
    return changed


def apply_filesystem_ops(aoib_ogg_root: Path, ops: list[Operation], dry_run: bool) -> None:
    for op in ops:
        src = aoib_ogg_root / op.from_path
        if op.type == 'delete':
            if dry_run:
                print(f"[DRY] delete {src}")
            else:
                if src.is_dir():
                    shutil.rmtree(src)
                elif src.exists():
                    src.unlink()
            continue

        if op.to_path is None:
            raise ValueError(f"Operation {op.type} missing 'to' path")
        dst = aoib_ogg_root / op.to_path

        if dry_run:
            print(f"[DRY] {op.type} {src} -> {dst}")
            continue

        dst.parent.mkdir(parents=True, exist_ok=True)

        if dst.exists() and not op.allow_overwrite:
            raise FileExistsError(f"Destination exists: {dst}")
        if op.allow_overwrite and dst.exists():
            if dst.is_dir():
                shutil.rmtree(dst)
            else:
                dst.unlink()

        shutil.move(str(src), str(dst))


def try_update_xlsx(xlsx_path: Path, csv_path: Path) -> str:
    """Best-effort XLSX sync: re-write the first worksheet from CSV.

    Requires openpyxl. If unavailable, returns a message.
    """

    try:
        import openpyxl  # type: ignore
    except Exception:
        return 'openpyxl not installed; skipped xlsx update'

    wb = openpyxl.load_workbook(xlsx_path)
    ws = wb.worksheets[0]

    # Clear sheet
    ws.delete_rows(1, ws.max_row)

    headers, rows = read_catalog_rows(csv_path)
    ws.append(headers)
    for r in rows:
        ws.append([r.get(h, '') for h in headers])

    wb.save(xlsx_path)
    return 'xlsx updated from csv'


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--plan', required=True, help='Path to a JSON change plan')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--apply', action='store_true')
    args = ap.parse_args()

    if args.apply and args.dry_run:
        raise SystemExit('Choose only one: --dry-run or --apply')
    if not args.apply and not args.dry_run:
        raise SystemExit('Specify one: --dry-run or --apply')

    repo_root = Path(__file__).resolve().parents[2]
    aoib_ogg_root = repo_root / 'soundscape' / 'assets' / 'aoib_ogg'

    csv_rel, xlsx_rel, ops = load_plan(Path(args.plan))
    csv_path = repo_root / csv_rel
    xlsx_path = repo_root / xlsx_rel if xlsx_rel else None

    headers, rows = read_catalog_rows(csv_path)

    if args.dry_run:
        print('--- Filesystem operations ---')
        apply_filesystem_ops(aoib_ogg_root, ops, dry_run=True)
        print('--- Catalog operations (preview only) ---')
        changed = apply_catalog_ops(rows, ops)
        print(f"Would update {changed} catalog rows")
        return

    ts = _dt.datetime.now().strftime('%Y%m%d_%H%M%S')
    backup = csv_path.with_suffix(f'.backup_{ts}.csv')
    shutil.copy2(csv_path, backup)
    print(f"Backup CSV: {backup}")

    apply_filesystem_ops(aoib_ogg_root, ops, dry_run=False)
    changed = apply_catalog_ops(rows, ops)
    write_catalog_rows(csv_path, headers, rows)
    print(f"Updated {changed} catalog rows")

    if xlsx_path and xlsx_path.exists():
        print(try_update_xlsx(xlsx_path, csv_path))
    elif xlsx_path:
        print('xlsxPath configured but file does not exist; skipped')


if __name__ == '__main__':
    main()
