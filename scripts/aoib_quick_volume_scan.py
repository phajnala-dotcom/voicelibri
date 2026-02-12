import argparse
import csv
import datetime as _dt
import os
import re
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable
from urllib.parse import quote


@dataclass(frozen=True)
class QuickVolume:
    rel_path: str
    mean_volume_db: float | None
    max_volume_db: float | None
    error: str | None


def _norm_slashes(path: str) -> str:
    return path.replace('\\', '/').replace('//', '/')


def _long_path_str(p: Path) -> str:
    s = str(p)
    if os.name == 'nt' and not s.startswith('\\\\?\\'):
        return '\\\\?\\' + s
    return s


def _strip_long_prefix(p: str) -> str:
    return p[4:] if p.startswith('\\\\?\\') else p


def iter_ogg_files(root: Path) -> Iterable[Path]:
    # Long-path safe traversal (pathlib/glob can miss >260 char paths on Windows).
    root_lp = _long_path_str(root)
    seen: set[str] = set()
    for dirpath, _dirs, files in os.walk(root_lp):
        for fname in files:
            if not fname.lower().endswith('.ogg'):
                continue
            full = os.path.join(dirpath, fname)
            key = full.lower()
            if key in seen:
                continue
            seen.add(key)
            yield Path(_strip_long_prefix(full))


def iter_ogg_files_sampled(root: Path, *, per_category: int | None) -> list[Path]:
    if per_category is None:
        return list(iter_ogg_files(root))

    buckets: dict[str, list[Path]] = {}
    for p in iter_ogg_files(root):
        rel = _norm_slashes(os.path.relpath(p, root))
        top = rel.split('/')[0] if '/' in rel else '_root'
        buckets.setdefault(top, []).append(p)

    sampled: list[Path] = []
    for top in sorted(buckets.keys()):
        files = sorted(buckets[top], key=lambda x: x.name.lower())
        sampled.extend(files[:per_category])
    return sampled


def _md_link_from_reports(rel_path: str) -> str:
    rel = rel_path.replace('\\', '/').lstrip('/')
    target = f"../../soundscape/assets/aoib_ogg/{rel}"
    return f"[{rel}]({quote(target, safe='/:._-')})"


def _atomic_write_text(path: Path, content: str) -> bool:
    """Best-effort atomic write.

    Writes to a sibling .tmp file and replaces the target. If the target is
    locked (e.g., opened in Excel/VS Code), we keep the temp file and continue.
    """

    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    try:
        with tmp.open('w', encoding='utf-8', newline='\n') as f:
            f.write(content)
    except PermissionError as e:
        print(f"WARN: Could not write temp report {tmp}: {e}")
        return False

    try:
        os.replace(tmp, path)
        return True
    except PermissionError as e:
        print(f"WARN: Could not replace locked report {path}: {e} (kept {tmp})")
        return False


def _atomic_write_csv(path: Path, header: list[str], rows: Iterable[list[object]]) -> bool:
    """Best-effort atomic CSV write.

    Same locking behavior as _atomic_write_text.
    """

    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    try:
        with tmp.open('w', encoding='utf-8', newline='') as f:
            w = csv.writer(f)
            w.writerow(header)
            for r in rows:
                w.writerow(r)
    except PermissionError as e:
        print(f"WARN: Could not write temp CSV {tmp}: {e}")
        return False

    try:
        os.replace(tmp, path)
        return True
    except PermissionError as e:
        print(f"WARN: Could not replace locked CSV {path}: {e} (kept {tmp})")
        return False


_RE_MEAN = re.compile(r"mean_volume:\s*([-0-9.]+)\s*dB")
_RE_MAX = re.compile(r"max_volume:\s*([-0-9.]+)\s*dB")


def volumedetect_sample(path: Path, *, seconds: float) -> QuickVolume:
    cmd = [
        'ffmpeg',
        '-hide_banner',
        '-nostats',
        '-t',
        str(seconds),
        '-i',
        _long_path_str(path),
        '-af',
        'volumedetect',
        '-f',
        'null',
        '-',
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True)
    except FileNotFoundError:
        return QuickVolume(rel_path='', mean_volume_db=None, max_volume_db=None, error='ffmpeg not found on PATH')

    if proc.returncode != 0:
        return QuickVolume(rel_path='', mean_volume_db=None, max_volume_db=None, error=f'ffmpeg failed (code={proc.returncode})')

    stderr = proc.stderr or ''
    m_mean = _RE_MEAN.search(stderr)
    m_max = _RE_MAX.search(stderr)
    mean_v = float(m_mean.group(1)) if m_mean else None
    max_v = float(m_max.group(1)) if m_max else None
    return QuickVolume(rel_path='', mean_volume_db=mean_v, max_volume_db=max_v, error=None)


def write_report(
    *,
    aoib_ogg_root: Path,
    out_csv: Path,
    out_md: Path,
    seconds: float,
    top_n: int,
    per_category: int | None,
) -> None:
    out_csv.parent.mkdir(parents=True, exist_ok=True)
    out_md.parent.mkdir(parents=True, exist_ok=True)

    results: list[QuickVolume] = []
    for p in iter_ogg_files_sampled(aoib_ogg_root, per_category=per_category):
        rel = _norm_slashes(os.path.relpath(p, aoib_ogg_root))
        r = volumedetect_sample(p, seconds=seconds)
        results.append(QuickVolume(rel_path=rel, mean_volume_db=r.mean_volume_db, max_volume_db=r.max_volume_db, error=r.error))

    with out_csv.open('w', encoding='utf-8', newline='') as f:
        w = csv.writer(f)
        w.writerow(['rel_path', 'mean_volume_db', 'max_volume_db', 'error'])
        for r in results:
            w.writerow([r.rel_path, r.mean_volume_db, r.max_volume_db, r.error])

    def _key(r: QuickVolume):
        # More negative mean = quieter; errors last.
        return (r.mean_volume_db is None, r.mean_volume_db if r.mean_volume_db is not None else 0.0)

    ranked = sorted(results, key=_key)[:top_n]

    now = _dt.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    with out_md.open('w', encoding='utf-8', newline='\n') as out:
        out.write('# AOIB OGG Quick Volume Scan (Sampled)\n\n')
        out.write(f'Generated: {now}\n\n')
        out.write(f'Audio root: `{aoib_ogg_root}`\n\n')
        out.write(f'Sample window: first **{seconds} seconds** per file\n\n')
        out.write(f'Raw results CSV: `{out_csv}`\n\n')
        out.write(f'## {top_n} Quietest (by mean_volume over sample)\n\n')
        out.write('| Rank | File | Mean (dB) | Max (dB) | Notes |\n')
        out.write('|---:|---|---:|---:|---|\n')
        for i, r in enumerate(ranked, start=1):
            link = _md_link_from_reports(r.rel_path)
            out.write(f"| {i} | {link} | {r.mean_volume_db if r.mean_volume_db is not None else ''} | {r.max_volume_db if r.max_volume_db is not None else ''} | {r.error or ''} |\n")


def write_lowest_percent_report(
    *,
    aoib_ogg_root: Path,
    out_md: Path,
    out_csv: Path,
    seconds: float,
    percent: float,
    scanned_count: int,
    total_count: int,
    results: list[QuickVolume],
    started_at: float,
) -> None:
    # Persist current scan snapshot to CSV (rewrite; best-effort even if locked)
    _atomic_write_csv(
        out_csv,
        ['rel_path', 'mean_volume_db', 'max_volume_db', 'error'],
        ([r.rel_path, r.mean_volume_db, r.max_volume_db, r.error] for r in results),
    )

    ok = [r for r in results if r.mean_volume_db is not None]
    ok.sort(key=lambda r: r.mean_volume_db)  # more negative = quieter
    k = max(1, int((len(ok) * percent / 100.0) + 0.9999))
    quietest = ok[:k]

    elapsed_s = max(0.1, time.time() - started_at)
    rate = scanned_count / elapsed_s
    eta_s = (total_count - scanned_count) / rate if rate > 0 else 0.0
    now = _dt.datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    lines: list[str] = []
    lines.append('# AOIB OGG Quick Volume Scan (All Files, Rolling Report)\n')
    lines.append(f'Updated: {now}\n')
    lines.append(f'Audio root: `{aoib_ogg_root}`\n')
    lines.append(f'Sample window: first **{seconds} seconds** per file\n')
    lines.append(f'Scanned: **{scanned_count}/{total_count}** ({(scanned_count/total_count*100.0 if total_count else 0.0):.1f}%)\n')
    lines.append(f'Estimated remaining: ~**{eta_s/60.0:.1f} min** (current rate {rate:.2f} files/s)\n')
    lines.append(f'Raw scan CSV (snapshot): `{out_csv}`\n')
    lines.append(f'## Lowest {percent:.2f}% by mean_volume (among scanned OK results)\n')
    lines.append('| Rank | File | Mean (dB) | Max (dB) | Notes |\n')
    lines.append('|---:|---|---:|---:|---|\n')
    for i, r in enumerate(quietest, start=1):
        lines.append(
            f"| {i} | {_md_link_from_reports(r.rel_path)} | {r.mean_volume_db if r.mean_volume_db is not None else ''} | {r.max_volume_db if r.max_volume_db is not None else ''} | {r.error or ''} |\n"
        )
    _atomic_write_text(out_md, '\n'.join(lines) + '\n')


def run_scan_with_rolling_report(
    *,
    aoib_ogg_root: Path,
    seconds: float,
    percent: float,
    report_interval_min: float,
    out_md: Path,
    out_csv: Path,
) -> None:
    files = list(iter_ogg_files(aoib_ogg_root))
    total = len(files)
    started_at = time.time()
    next_report_at = started_at
    results: list[QuickVolume] = []

    print(f"Scanning {total} files (first {seconds}s each). Rolling report every {report_interval_min} min.")
    for idx, p in enumerate(files, start=1):
        rel = _norm_slashes(os.path.relpath(p, aoib_ogg_root))
        r = volumedetect_sample(p, seconds=seconds)
        results.append(QuickVolume(rel_path=rel, mean_volume_db=r.mean_volume_db, max_volume_db=r.max_volume_db, error=r.error))

        # Continuous progress (throttled): every 25 files or on report.
        if idx % 25 == 0 or idx == total:
            elapsed = max(0.1, time.time() - started_at)
            rate = idx / elapsed
            eta_s = (total - idx) / rate if rate > 0 else 0.0
            print(f"{idx}/{total} ({(idx/total*100.0 if total else 0.0):.1f}%)  rate={rate:.2f} files/s  eta~{eta_s/60.0:.1f} min")

        now = time.time()
        if now >= next_report_at:
            write_lowest_percent_report(
                aoib_ogg_root=aoib_ogg_root,
                out_md=out_md,
                out_csv=out_csv,
                seconds=seconds,
                percent=percent,
                scanned_count=idx,
                total_count=total,
                results=results,
                started_at=started_at,
            )
            print(f"Report updated: {out_md}")
            next_report_at = now + report_interval_min * 60.0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--seconds', type=float, default=5.0)
    ap.add_argument('--top-n', type=int, default=100)
    ap.add_argument(
        '--per-category',
        type=int,
        default=10,
        help='Scan only N files per top-level category folder (set 0 to scan all files).',
    )
    ap.add_argument('--scan-all', action='store_true', help='Scan all files and generate rolling lowest-percent report.')
    ap.add_argument('--percent', type=float, default=1.0, help='Percent of quietest files to show in rolling report (default 1%).')
    ap.add_argument('--report-interval-min', type=float, default=10.0, help='Rolling report update interval in minutes (default 10).')
    args = ap.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    aoib_ogg_root = repo_root / 'soundscape' / 'assets' / 'aoib_ogg'
    ts = _dt.datetime.now().strftime('%Y%m%d_%H%M%S')
    out_csv = repo_root / 'docs' / 'reports' / f'aoib_ogg_quick_volume_{ts}.csv'
    out_md = repo_root / 'docs' / 'reports' / f'aoib_ogg_quick_volume_quietest{args.top_n}_{ts}.md'
    out_md_lowest_pct = repo_root / 'docs' / 'reports' / f'aoib_ogg_quick_volume_lowest{args.percent:.2f}pct_{ts}.md'
    per_category = None if args.per_category == 0 else args.per_category

    if args.scan_all:
        run_scan_with_rolling_report(
            aoib_ogg_root=aoib_ogg_root,
            seconds=args.seconds,
            percent=args.percent,
            report_interval_min=args.report_interval_min,
            out_md=out_md_lowest_pct,
            out_csv=out_csv,
        )
        print(f"Final rolling report: {out_md_lowest_pct}")
        return

    write_report(
        aoib_ogg_root=aoib_ogg_root,
        out_csv=out_csv,
        out_md=out_md,
        seconds=args.seconds,
        top_n=args.top_n,
        per_category=per_category,
    )
    print(f"Wrote: {out_md}")


if __name__ == '__main__':
    main()
