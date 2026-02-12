import csv
import datetime as _dt
import json
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


@dataclass(frozen=True)
class LoudnessResult:
    rel_path: str
    input_i_lufs: float | None
    input_tp_db: float | None
    input_lra: float | None
    duration_s: float | None
    error: str | None


def _norm_slashes(path: str) -> str:
    return path.replace('\\', '/').replace('//', '/')


def iter_ogg_files(root: Path) -> Iterable[Path]:
    for p in root.rglob('*.ogg'):
        if p.is_file():
            yield p


def measure_loudness_ffmpeg(path: Path) -> LoudnessResult:
    """Measure integrated loudness using ffmpeg loudnorm's analysis JSON.

    Note: this requires decoding the whole file; on large libraries it will take time.
    """

    # loudnorm prints JSON to stderr.
    cmd = [
        'ffmpeg',
        '-hide_banner',
        '-nostats',
        '-i',
        str(path),
        '-af',
        'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json',
        '-f',
        'null',
        '-',
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True)
    except FileNotFoundError:
        return LoudnessResult(
            rel_path='',
            input_i_lufs=None,
            input_tp_db=None,
            input_lra=None,
            duration_s=None,
            error='ffmpeg not found on PATH',
        )

    stderr = proc.stderr or ''
    json_blob = None
    # Find the last '{...}' block on stderr.
    start = stderr.rfind('{')
    end = stderr.rfind('}')
    if start != -1 and end != -1 and end > start:
        candidate = stderr[start : end + 1]
        try:
            json_blob = json.loads(candidate)
        except Exception:
            json_blob = None

    if proc.returncode != 0 and json_blob is None:
        return LoudnessResult(
            rel_path='',
            input_i_lufs=None,
            input_tp_db=None,
            input_lra=None,
            duration_s=None,
            error=f'ffmpeg failed (code={proc.returncode})',
        )

    def _get_float(key: str) -> float | None:
        if not json_blob:
            return None
        val = json_blob.get(key)
        try:
            return float(val)
        except Exception:
            return None

    return LoudnessResult(
        rel_path='',
        input_i_lufs=_get_float('input_i'),
        input_tp_db=_get_float('input_tp'),
        input_lra=_get_float('input_lra'),
        duration_s=_get_float('input_duration'),
        error=None,
    )


def write_reports(
    *,
    aoib_ogg_root: Path,
    out_csv: Path,
    out_md: Path,
    top_n: int = 100,
) -> None:
    out_csv.parent.mkdir(parents=True, exist_ok=True)
    out_md.parent.mkdir(parents=True, exist_ok=True)

    results: list[LoudnessResult] = []
    for p in iter_ogg_files(aoib_ogg_root):
        rel = _norm_slashes(os.path.relpath(p, aoib_ogg_root))
        r = measure_loudness_ffmpeg(p)
        results.append(
            LoudnessResult(
                rel_path=rel,
                input_i_lufs=r.input_i_lufs,
                input_tp_db=r.input_tp_db,
                input_lra=r.input_lra,
                duration_s=r.duration_s,
                error=r.error,
            )
        )

    with out_csv.open('w', encoding='utf-8', newline='') as f:
        w = csv.writer(f)
        w.writerow(
            [
                'rel_path',
                'input_i_lufs',
                'input_tp_db',
                'input_lra',
                'duration_s',
                'error',
            ]
        )
        for r in results:
            w.writerow(
                [
                    r.rel_path,
                    r.input_i_lufs,
                    r.input_tp_db,
                    r.input_lra,
                    r.duration_s,
                    r.error,
                ]
            )

    def _rank_key(r: LoudnessResult):
        # More negative LUFS = quieter; None/error goes last.
        return (r.input_i_lufs is None, r.input_i_lufs if r.input_i_lufs is not None else 0.0)

    ranked = sorted(results, key=_rank_key)[:top_n]

    now = _dt.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    with out_md.open('w', encoding='utf-8', newline='\n') as out:
        out.write('# AOIB OGG Loudness Scan\n\n')
        out.write(f'Generated: {now}\n\n')
        out.write(f'Audio root: `{aoib_ogg_root}`\n\n')
        out.write(f'Raw results CSV: `{out_csv}`\n\n')
        out.write(f'## 100 Lowest Integrated Loudness (quietest)\n\n')
        out.write('| Rank | File | Integrated (LUFS) | True Peak (dBTP) | LRA | Duration (s) | Notes |\n')
        out.write('|---:|---|---:|---:|---:|---:|---|\n')
        for i, r in enumerate(ranked, start=1):
            link = f"[{r.rel_path}](soundscape/assets/aoib_ogg/{r.rel_path})"
            out.write(
                f"| {i} | {link} | {r.input_i_lufs if r.input_i_lufs is not None else ''} | {r.input_tp_db if r.input_tp_db is not None else ''} | {r.input_lra if r.input_lra is not None else ''} | {r.duration_s if r.duration_s is not None else ''} | {r.error or ''} |\n"
            )


def main() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    aoib_ogg_root = repo_root / 'soundscape' / 'assets' / 'aoib_ogg'
    ts = _dt.datetime.now().strftime('%Y%m%d_%H%M%S')
    out_csv = repo_root / 'docs' / 'reports' / f'aoib_ogg_loudness_{ts}.csv'
    out_md = repo_root / 'docs' / 'reports' / f'aoib_ogg_loudness_lowest100_{ts}.md'
    write_reports(aoib_ogg_root=aoib_ogg_root, out_csv=out_csv, out_md=out_md)
    print(f"Wrote: {out_md}")


if __name__ == '__main__':
    main()
