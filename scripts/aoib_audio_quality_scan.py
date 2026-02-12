import csv
import datetime as _dt
import json
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


@dataclass(frozen=True)
class QualityResult:
    rel_path: str
    duration_s: float | None
    sample_rate_hz: int | None
    channels: int | None
    bit_rate: int | None
    max_volume_db: float | None
    has_decode_error: bool
    notes: str


def _norm_slashes(path: str) -> str:
    return path.replace('\\', '/').replace('//', '/')


def iter_ogg_files(root: Path) -> Iterable[Path]:
    for p in root.rglob('*.ogg'):
        if p.is_file():
            yield p


def ffprobe_stream_info(path: Path) -> dict:
    cmd = [
        'ffprobe',
        '-v',
        'error',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        str(path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or 'ffprobe failed')
    return json.loads(proc.stdout)


def ffmpeg_max_volume(path: Path) -> float | None:
    cmd = [
        'ffmpeg',
        '-hide_banner',
        '-nostats',
        '-i',
        str(path),
        '-af',
        'volumedetect',
        '-f',
        'null',
        '-',
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        return None
    stderr = proc.stderr or ''
    # Parse: "max_volume: -3.2 dB"
    marker = 'max_volume:'
    idx = stderr.rfind(marker)
    if idx == -1:
        return None
    tail = stderr[idx + len(marker) :].strip()
    try:
        val = tail.split()[0]
        return float(val)
    except Exception:
        return None


def scan_quality(path: Path, rel: str) -> QualityResult:
    notes: list[str] = []
    has_decode_error = False
    try:
        meta = ffprobe_stream_info(path)
    except Exception as e:
        return QualityResult(
            rel_path=rel,
            duration_s=None,
            sample_rate_hz=None,
            channels=None,
            bit_rate=None,
            max_volume_db=None,
            has_decode_error=True,
            notes=f'ffprobe error: {e}',
        )

    streams = meta.get('streams', [])
    audio = None
    for s in streams:
        if s.get('codec_type') == 'audio':
            audio = s
            break
    fmt = meta.get('format', {})

    def _float(v):
        try:
            return float(v)
        except Exception:
            return None

    def _int(v):
        try:
            return int(float(v))
        except Exception:
            return None

    duration_s = _float(fmt.get('duration'))
    bit_rate = _int(fmt.get('bit_rate'))
    sample_rate = _int(audio.get('sample_rate')) if audio else None
    channels = _int(audio.get('channels')) if audio else None

    if duration_s is not None and duration_s <= 0.05:
        notes.append('very short duration')
    if sample_rate is not None and sample_rate not in (48000, 44100):
        notes.append(f'unexpected sample rate: {sample_rate}')
    if channels is not None and channels not in (1, 2, 3, 4, 6):
        notes.append(f'unexpected channels: {channels}')

    max_volume = ffmpeg_max_volume(path)
    if max_volume is None:
        notes.append('volumedetect unavailable (ffmpeg?)')
    else:
        if max_volume > -0.1:
            notes.append('near 0 dBFS peak (possible clipping)')
        if max_volume < -30:
            notes.append('very low peak')

    # Basic decode smoke test: decode first 10 seconds
    cmd = [
        'ffmpeg',
        '-hide_banner',
        '-v',
        'error',
        '-ss',
        '0',
        '-t',
        '10',
        '-i',
        str(path),
        '-f',
        'null',
        '-',
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        has_decode_error = True
        notes.append('decode errors in first 10s')

    return QualityResult(
        rel_path=rel,
        duration_s=duration_s,
        sample_rate_hz=sample_rate,
        channels=channels,
        bit_rate=bit_rate,
        max_volume_db=max_volume,
        has_decode_error=has_decode_error,
        notes='; '.join(notes),
    )


def write_report(*, aoib_ogg_root: Path, out_csv: Path, out_md: Path) -> None:
    out_csv.parent.mkdir(parents=True, exist_ok=True)
    out_md.parent.mkdir(parents=True, exist_ok=True)

    results: list[QualityResult] = []
    for p in iter_ogg_files(aoib_ogg_root):
        rel = _norm_slashes(os.path.relpath(p, aoib_ogg_root))
        results.append(scan_quality(p, rel))

    with out_csv.open('w', encoding='utf-8', newline='') as f:
        w = csv.writer(f)
        w.writerow(
            [
                'rel_path',
                'duration_s',
                'sample_rate_hz',
                'channels',
                'bit_rate',
                'max_volume_db',
                'has_decode_error',
                'notes',
            ]
        )
        for r in results:
            w.writerow(
                [
                    r.rel_path,
                    r.duration_s,
                    r.sample_rate_hz,
                    r.channels,
                    r.bit_rate,
                    r.max_volume_db,
                    r.has_decode_error,
                    r.notes,
                ]
            )

    flagged = [r for r in results if r.has_decode_error or r.notes]
    flagged.sort(key=lambda r: (not r.has_decode_error, r.max_volume_db if r.max_volume_db is not None else 999))

    now = _dt.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    with out_md.open('w', encoding='utf-8', newline='\n') as out:
        out.write('# AOIB OGG Quality Scan (Basic)\n\n')
        out.write(f'Generated: {now}\n\n')
        out.write(f'Audio root: `{aoib_ogg_root}`\n\n')
        out.write(f'Raw results CSV: `{out_csv}`\n\n')
        out.write('## What this checks\n\n')
        out.write('- ffprobe readability (metadata parse)\n')
        out.write('- Decode errors (first 10 seconds)\n')
        out.write('- Sample rate / channel count outliers\n')
        out.write('- Peak outliers via volumedetect (very low peak, or near 0 dBFS peak)\n\n')
        out.write('## Flagged files\n\n')
        out.write('| File | Decode error | Duration (s) | SR | Ch | Bitrate | Max volume (dB) | Notes |\n')
        out.write('|---|:---:|---:|---:|---:|---:|---:|---|\n')
        for r in flagged:
            link = f"[{r.rel_path}](soundscape/assets/aoib_ogg/{r.rel_path})"
            out.write(
                f"| {link} | {'YES' if r.has_decode_error else ''} | {r.duration_s if r.duration_s is not None else ''} | {r.sample_rate_hz if r.sample_rate_hz is not None else ''} | {r.channels if r.channels is not None else ''} | {r.bit_rate if r.bit_rate is not None else ''} | {r.max_volume_db if r.max_volume_db is not None else ''} | {r.notes} |\n"
            )


def main() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    aoib_ogg_root = repo_root / 'soundscape' / 'assets' / 'aoib_ogg'
    ts = _dt.datetime.now().strftime('%Y%m%d_%H%M%S')
    out_csv = repo_root / 'docs' / 'reports' / f'aoib_ogg_quality_{ts}.csv'
    out_md = repo_root / 'docs' / 'reports' / f'aoib_ogg_quality_{ts}.md'
    write_report(aoib_ogg_root=aoib_ogg_root, out_csv=out_csv, out_md=out_md)
    print(f"Wrote: {out_md}")


if __name__ == '__main__':
    main()
