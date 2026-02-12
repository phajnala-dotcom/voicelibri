import argparse
import datetime as _dt
import os
import shutil
import sys
from dataclasses import dataclass
from urllib.parse import quote
from pathlib import Path
import hashlib

# Allow running as a standalone script (ensure repo root is on sys.path)
_REPO_ROOT = Path(__file__).resolve().parents[1]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from scripts.aoib_catalog_diff import (
    catalog_expected_rel_ogg_path,
    iter_ogg_files,
    read_catalog_csv,
)


@dataclass(frozen=True)
class MoveAction:
    kind: str  # 'case-fix' | 'extra->expected' | 'extra->quarantine'
    src_rel: str
    dst_rel: str
    note: str


def _norm_slashes(path: str) -> str:
    return path.replace('\\', '/').replace('//', '/')


def _case_only_diff(a: str, b: str) -> bool:
    return a.lower() == b.lower() and a != b


def _safe_move(src: Path, dst: Path, *, allow_overwrite: bool = False) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists():
        if not allow_overwrite:
            raise FileExistsError(f"Destination exists: {dst}")
        if dst.is_dir():
            shutil.rmtree(dst)
        else:
            dst.unlink()
    shutil.move(str(src), str(dst))


def _prune_empty_dirs(root: Path) -> int:
    removed = 0
    # Walk bottom-up so child dirs removed before parents.
    for dirpath, dirnames, filenames in os.walk(root, topdown=False):
        dp = Path(dirpath)
        if dp == root:
            continue
        if not dirnames and not filenames:
            try:
                dp.rmdir()
                removed += 1
            except OSError:
                pass
    return removed


def plan_actions(
    *,
    repo_root: Path,
    catalog_csv: Path,
    aoib_ogg_root: Path,
    quarantine_dirname: str,
    try_match_by_basename: bool,
) -> tuple[list[MoveAction], dict[str, int]]:
    entries = read_catalog_csv(catalog_csv)
    expected_rel: dict[str, str] = {}
    expected_by_lc: dict[str, str] = {}
    expected_by_basename_lc: dict[str, list[str]] = {}

    for e in entries:
        if not e.file_path:
            continue
        rel = catalog_expected_rel_ogg_path(e.file_path)
        expected_rel[rel] = rel
        expected_by_lc[rel.lower()] = rel
        base = Path(rel).name.lower()
        expected_by_basename_lc.setdefault(base, []).append(rel)

    actual_paths = list(iter_ogg_files(aoib_ogg_root))
    actual_rel = [_norm_slashes(os.path.relpath(p, aoib_ogg_root)) for p in actual_paths]
    actual_set = set(actual_rel)
    actual_by_lc = {p.lower(): p for p in actual_rel}

    actions: list[MoveAction] = []

    # 1) Case-only mismatches: actual path matches expected path ignoring case.
    for actual_lc, actual in actual_by_lc.items():
        expected = expected_by_lc.get(actual_lc)
        if expected and _case_only_diff(actual, expected):
            actions.append(
                MoveAction(
                    kind='case-fix',
                    src_rel=actual,
                    dst_rel=expected,
                    note='normalize casing to catalog',
                )
            )

    # 2) Extra files: present on disk, not expected at same relative path.
    expected_set = set(expected_rel.keys())
    extras = sorted(actual_set - expected_set)

    quarantine_root = aoib_ogg_root.parent / quarantine_dirname
    for rel in extras:
        src_base = Path(rel).name.lower()
        if try_match_by_basename:
            matches = expected_by_basename_lc.get(src_base, [])
        else:
            matches = []

        if len(matches) == 1:
            dst_rel = matches[0]
            if dst_rel in actual_set:
                # Destination already exists; quarantine instead. Keep the quarantine path short.
                top = rel.split('/')[0] if '/' in rel else '_root'
                base = Path(rel).name
                h8 = hashlib.sha1(rel.encode('utf-8')).hexdigest()[:8]
                safe_name = f"{Path(base).stem}__{h8}{Path(base).suffix}"
                q_rel = _norm_slashes(str(Path(top) / safe_name))
                actions.append(
                    MoveAction(
                        kind='extra->quarantine',
                        src_rel=rel,
                        dst_rel=q_rel,
                        note='basename matched but expected path already exists',
                    )
                )
            else:
                actions.append(
                    MoveAction(
                        kind='extra->expected',
                        src_rel=rel,
                        dst_rel=dst_rel,
                        note='basename uniquely matches a catalog entry; moving to expected path',
                    )
                )
        else:
            # Unknown or ambiguous: move out to quarantine, do not delete.
            # Windows path length can be a problem if we mirror the full relative path.
            # Use a short quarantine path: <top-category>/<basename>__<hash8>.ogg
            top = rel.split('/')[0] if '/' in rel else '_root'
            base = Path(rel).name
            h8 = hashlib.sha1(rel.encode('utf-8')).hexdigest()[:8]
            safe_name = f"{Path(base).stem}__{h8}{Path(base).suffix}"
            q_rel = _norm_slashes(str(Path(top) / safe_name))
            actions.append(
                MoveAction(
                    kind='extra->quarantine',
                    src_rel=rel,
                    dst_rel=q_rel,
                    note='not in catalog (or ambiguous basename match); quarantined for review',
                )
            )

    stats = {
        'catalog_entries': len(entries),
        'actual_files': len(actual_set),
        'case_fix_actions': sum(1 for a in actions if a.kind == 'case-fix'),
        'extra_files': len(extras),
        'extra_to_expected': sum(1 for a in actions if a.kind == 'extra->expected'),
        'extra_to_quarantine': sum(1 for a in actions if a.kind == 'extra->quarantine'),
    }
    return actions, stats


def apply_actions(
    *,
    repo_root: Path,
    aoib_ogg_root: Path,
    quarantine_dirname: str,
    actions: list[MoveAction],
    dry_run: bool,
) -> tuple[int, int]:
    moved = 0
    errors = 0

    quarantine_root = aoib_ogg_root.parent / quarantine_dirname
    if not dry_run:
        quarantine_root.mkdir(parents=True, exist_ok=True)

    for a in actions:
        src = aoib_ogg_root / a.src_rel
        if a.kind == 'case-fix':
            dst = aoib_ogg_root / a.dst_rel
        elif a.kind == 'extra->expected':
            dst = aoib_ogg_root / a.dst_rel
        elif a.kind == 'extra->quarantine':
            dst = quarantine_root / a.dst_rel
        else:
            raise ValueError(f"Unknown action kind: {a.kind}")

        if dry_run:
            print(f"[DRY] {a.kind}: {src} -> {dst} ({a.note})")
            continue

        try:
            if not src.exists():
                # Already moved by earlier action.
                continue
            _safe_move(src, dst, allow_overwrite=False)
            moved += 1
        except Exception as e:
            errors += 1
            print(f"[ERROR] {a.kind}: {src} -> {dst}: {e}")

    pruned = 0
    if not dry_run:
        pruned = _prune_empty_dirs(aoib_ogg_root)
    return moved, pruned


def write_log(out_md: Path, *, actions: list[MoveAction], stats: dict[str, int]) -> None:
    out_md.parent.mkdir(parents=True, exist_ok=True)
    now = _dt.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    with out_md.open('w', encoding='utf-8', newline='\n') as out:
        out.write('# AOIB OGG Cleanup Log\n\n')
        out.write(f'Generated: {now}\n\n')
        out.write('## Summary\n\n')
        for k, v in stats.items():
            out.write(f'- {k}: **{v}**\n')
        out.write('\n')

        out.write('## Actions\n\n')
        out.write('| Kind | From | To | Note |\n')
        out.write('|---|---|---|---|\n')
        for a in actions:
            if a.kind == 'extra->quarantine':
                target = f"../../soundscape/assets/aoib_ogg__quarantine_extras/{a.dst_rel}"
                to_link = f"[{a.dst_rel}]({quote(target, safe='/:._-')})"
            else:
                target = f"../../soundscape/assets/aoib_ogg/{a.dst_rel}"
                to_link = f"[{a.dst_rel}]({quote(target, safe='/:._-')})"
            from_target = f"../../soundscape/assets/aoib_ogg/{a.src_rel}"
            from_link = f"[{a.src_rel}]({quote(from_target, safe='/:._-')})"
            out.write(f"| {a.kind} | {from_link} | {to_link} | {a.note} |\n")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        '--catalog-csv',
        default='soundscape/assets/All In One Bundle 4824.csv',
        help='Catalog CSV path (repo-relative)',
    )
    ap.add_argument(
        '--aoib-ogg-root',
        default='soundscape/assets/aoib_ogg',
        help='aoib_ogg root (repo-relative)',
    )
    ap.add_argument(
        '--quarantine-dirname',
        default='aoib_ogg__quarantine_extras',
        help='Folder under soundscape/assets/ to move extra files into',
    )
    ap.add_argument('--no-basename-match', action='store_true')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--apply', action='store_true')
    ap.add_argument(
        '--log-md',
        default='',
        help='Optional path for a markdown log (repo-relative). If omitted, uses docs/reports/.',
    )
    args = ap.parse_args()

    if args.apply and args.dry_run:
        raise SystemExit('Choose only one: --dry-run or --apply')
    if not args.apply and not args.dry_run:
        raise SystemExit('Specify one: --dry-run or --apply')

    repo_root = Path(__file__).resolve().parents[1]
    catalog_csv = repo_root / args.catalog_csv
    aoib_ogg_root = repo_root / args.aoib_ogg_root

    actions, stats = plan_actions(
        repo_root=repo_root,
        catalog_csv=catalog_csv,
        aoib_ogg_root=aoib_ogg_root,
        quarantine_dirname=args.quarantine_dirname,
        try_match_by_basename=not args.no_basename_match,
    )

    if args.log_md:
        log_md = repo_root / args.log_md
    else:
        ts = _dt.datetime.now().strftime('%Y%m%d_%H%M%S')
        log_md = repo_root / 'docs' / 'reports' / f'aoib_ogg_cleanup_{ts}.md'

    write_log(log_md, actions=actions, stats=stats)
    print(f"Planned actions log: {log_md}")

    moved, pruned = apply_actions(
        repo_root=repo_root,
        aoib_ogg_root=aoib_ogg_root,
        quarantine_dirname=args.quarantine_dirname,
        actions=actions,
        dry_run=args.dry_run,
    )
    if args.apply:
        print(f"Applied moves: {moved}; pruned empty dirs: {pruned}")


if __name__ == '__main__':
    main()
