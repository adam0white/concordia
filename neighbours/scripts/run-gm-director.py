#!/usr/bin/env python3
"""One native upstream Concordia GM proposal, then exact zero-call replay."""
import argparse
from datetime import datetime, timezone
import json
import platform
import importlib.metadata
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from concordia.contrib.neighbours.bridge import NodeBridge
from concordia.contrib.neighbours.engine import TownEngine
from concordia.contrib.neighbours.gm_director import (
    ClaudeCliModel, UPSTREAM_SHA, digest, replay_report, run_director, runtime_sources,
    verify_upstream_sources)


def capture_checkpoint(node, seed):
  """Obtain and canonicalize actual fictional HF progression without a model."""
  # Advance a fresh fictional HF town until its actual progression produces a
  # weekly opportunity. Never inject hall progress or import an owner save.
  with tempfile.TemporaryDirectory(prefix='neighbours-gm-checkpoint-') as directory:
    subprocess.run([
        node, str(ROOT / 'neighbours/scripts/capture-weekly.ts'),
        '--output-directory', directory, '--seed', str(seed)],
        cwd=ROOT / 'neighbours', check=True, timeout=180)
    candidate = json.loads((Path(directory) / 'candidate.json').read_text())
    with NodeBridge(seed=seed, population=8, node=node, timeout=100) as bridge:
      engine = TownEngine(bridge)
      engine.restore(candidate)
      checkpoint = engine.save()
  if (checkpoint['runtime']['hallSafe'] is not True
      or checkpoint['runtime']['seed'] != seed
      or len(checkpoint['runtime']['people']) != 8):
    raise RuntimeError('Captured town is not the requested genuine eight-person opened-hall checkpoint')
  return checkpoint


def main():
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument('--model', default='opus')
  parser.add_argument('--seed', type=int, default=42)
  parser.add_argument('--node', default='node')
  parser.add_argument('--replay', type=Path)
  parser.add_argument('--output', type=Path, default=Path('/tmp/neighbours-native-gm.json'))
  args = parser.parse_args()
  if args.replay:
    print(json.dumps(replay_report(json.loads(args.replay.read_text()), ROOT)))
    return
  sources = runtime_sources(ROOT)
  verify_upstream_sources(ROOT)
  checkpoint = capture_checkpoint(args.node, args.seed)
  model = ClaudeCliModel(args.model, max_calls=1)
  result = run_director(model, checkpoint)
  report = {
      'schema': 'native-concordia-gm@1',
      'recordedAt': datetime.now(timezone.utc).isoformat(),
      'runtime': 'Native upstream Concordia EventResolution + MakeObservation + real Claude CLI',
      'upstreamSha': UPSTREAM_SHA,
      'runtimeSources': sources,
      'runtimes': {'python': platform.python_version(), **{name: importlib.metadata.version(name) for name in ('absl-py','numpy','pandas','python-dateutil','reactivex','six','termcolor','typing_extensions')}},
      'sourceFingerprint': sources['sha256'],
      'gitHeadAtRun': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
      'sourceWorkingTreeDirty': bool(subprocess.check_output(['git', 'status', '--porcelain', '--', *sources['files']], cwd=ROOT, text=True).strip()),
      'checkpoint': checkpoint, 'checkpointSha256': digest(checkpoint),
      'modelCalls': len(model.tape), 'responseTape': model.tape,
      'requestedModel': args.model, 'cliVersion': model.cli_version,
      'modelIds': model.tape[0]['modelIds'],
      'proposal': result['proposal'], 'rawResponse': result['rawResponse'],
      'rejection': result['rejection'],
      'result': result,
      'limits': [
          'One bounded native proposal, not a generative town simulation.',
          'No physical host change and no resident observation or decision occurs in this experiment.',
          'The host must independently validate and apply a proposal before it becomes a playable situation.',
          'Observation fallback and model-selected recipients are disabled.',
          'Replay consumes recorded responses and makes zero model calls.',
          'The public browser does not call Claude or run this native GM.',
      ],
  }
  replay = replay_report(report, ROOT)
  report['replayExact'] = replay['replayExact']
  report['replayModelCalls'] = 0
  encoded = json.dumps(report, indent=2, ensure_ascii=False) + '\n'
  if any(token in encoded for token in ('session_id', 'access_token', '/Users/')):
    raise RuntimeError('Artifact contains forbidden private metadata')
  args.output.parent.mkdir(parents=True, exist_ok=True)
  args.output.write_text(encoded)
  print(json.dumps({'output': str(args.output), 'modelCalls': report['modelCalls'],
                    'replayExact': True, 'proposal': result['proposal'],
                    'rejection': result['rejection'], 'checkpointSha256': digest(checkpoint)}))


if __name__ == '__main__':
  main()
