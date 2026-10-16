#!/usr/bin/env python3
"""Actual native Concordia mixed town, then exact replay without model calls."""
import argparse
import copy
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import platform
import json
from pathlib import Path
import sys
import subprocess

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from concordia.contrib.neighbours.bridge import NodeBridge
from concordia.contrib.neighbours.engine import TownEngine


def runtime_sources():
  paths = {
      'concordia/typing/entity.py', 'concordia/environment/engine.py',
      'concordia/environment/step_controller.py',
      'concordia/contrib/neighbours/engine.py', 'concordia/contrib/neighbours/bridge.py',
      'neighbours/src/contracts.ts', 'neighbours/src/bridge-port.ts',
      'neighbours/src/experiments/inspection.ts', 'neighbours/src/experiments/mixed-native.ts',
      'neighbours/src/experiments/claude-native.ts', 'neighbours/src/experiments/llm.ts',
      'neighbours/scripts/mixed-bridge.ts', 'neighbours/scripts/run-mixed-town.py',
  }
  paths.update(str(p.relative_to(ROOT)) for p in (ROOT / 'neighbours/src/core').glob('*.ts'))
  files = {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in sorted(paths)}
  package = json.loads((ROOT / 'neighbours/node_modules/@adam0white/human-framework/package.json').read_text())
  identity = {'files': files, 'hf': {'name': package['name'], 'version': package['version']}}
  digest = hashlib.sha256(json.dumps(identity,sort_keys=True,separators=(',',':')).encode()).hexdigest()
  return {**identity, 'sha256': digest}


def replay_report(report, node):
  if report.get('runtimeSources') != runtime_sources():
    raise RuntimeError('Runtime source digest differs from recorded evidence; regenerate after review')
  initial = copy.deepcopy(report['initialCheckpoint'])
  initial['runtime']['mixed'] = copy.deepcopy(report['responseTape'])
  initial['runtime']['mixed']['cursor'] = 0
  with NodeBridge(seed=initial['runtime']['seed'], population=8, node=node, timeout=100,
                  script=ROOT / 'neighbours/scripts/mixed-bridge.ts', args=('--mode', 'replay')) as bridge:
    engine = TownEngine(bridge)
    engine.restore(initial)
    if engine.advance(report['rounds']) != report['view'] or engine.save() != report['checkpoint']:
      raise RuntimeError('Recorded-response replay diverged')
  return True


def main():
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument('--rounds', type=int, default=12)
  parser.add_argument('--seed', type=int, default=42)
  parser.add_argument('--model', default='opus')
  parser.add_argument('--node', default='node')
  parser.add_argument('--replay', type=Path, help='Verify a recorded artifact; never call a model')
  parser.add_argument('--output', type=Path, default=Path('/tmp/neighbours-native-mixed.json'))
  args = parser.parse_args()
  if args.replay:
    report = json.loads(args.replay.read_text())
    replay_report(report, args.node)
    print(json.dumps({'replayExact': True, 'modelCalls': 0, 'runtimeSourceSha256': report['runtimeSources']['sha256']}))
    return
  sources = runtime_sources()
  script = ROOT / 'neighbours/scripts/mixed-bridge.ts'
  with NodeBridge(seed=args.seed, population=8, node=args.node, timeout=100,
                  script=script, args=('--mode', 'live', '--model', args.model)) as bridge:
    engine = TownEngine(bridge)
    initial = engine.save()
    view = engine.advance(args.rounds)
    final = engine.save()
  # Attach the actual recorded future responses to the original starting point.
  # Replay consumes these responses at their exact state hashes and cannot call a model.
  replay_start = copy.deepcopy(initial)
  replay_start['runtime']['mixed'] = copy.deepcopy(final['runtime']['mixed'])
  replay_start['runtime']['mixed']['cursor'] = 0
  with NodeBridge(seed=args.seed, population=8, node=args.node, timeout=100,
                  script=script, args=('--mode', 'replay')) as bridge:
    replay = TownEngine(bridge)
    replay.restore(replay_start)
    replay_view = replay.advance(args.rounds)
    if replay_view != view or replay.save() != final:
      raise RuntimeError('Recorded-response replay diverged')
  tape = final['runtime']['mixed']
  report = {'schema': 'native-mixed-town@1', 'recordedAt': datetime.now(timezone.utc).isoformat(), 'runtime': 'Python Concordia + persistent Node + real Claude CLI',
            'population': 8, 'hfControllers': 7, 'llmControllers': 1,
            'runtimeSources': sources,
            'runtimes': {'node': subprocess.check_output([args.node, '--version'], text=True).strip(),
                         'python': sys.version.split()[0], 'abslPy': importlib.metadata.version('absl-py'),
                         'platform': sys.platform, 'architecture': platform.machine()},
            'gitHeadAtRun': subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
            'sourceWorkingTreeDirty': bool(subprocess.check_output(['git','status','--porcelain','--',*sources['files']],cwd=ROOT,text=True).strip()),
            'llmActor': tape['actorId'], 'rounds': args.rounds,
            'modelDecisions': len(tape['entries']), 'replayExact': True,
            'replayModelCalls': 0, 'responseTape': tape, 'initialCheckpoint': initial,
            'checkpoint': final, 'view': view,
            'checkpointSha256': hashlib.sha256(json.dumps(final,sort_keys=True,separators=(',',':')).encode()).hexdigest(),
            'limits': ['One short native run, not an HF-versus-LLM superiority result.',
                       'The LLM actor uses HF body and person state but an explicitly external choice record.',
                       'This is recorded native evidence. The public browser town does not call a model.',
                       'Replay uses saved responses; it does not regenerate model answers.']}
  if runtime_sources() != sources:
    raise RuntimeError('Runtime sources changed during the model run; do not publish this artifact')
  encoded = json.dumps(report,ensure_ascii=False,indent=2)+'\n'
  if 'session_id' in encoded or 'access_token' in encoded or '/Users/' in encoded:
    raise RuntimeError('Artifact contains forbidden private metadata')
  args.output.parent.mkdir(parents=True,exist_ok=True)
  args.output.write_text(encoded)
  print(json.dumps({'output':str(args.output),'modelDecisions':report['modelDecisions'],
                    'replayExact':True,'rounds':args.rounds,'checkpointSha256':report['checkpointSha256']}))


if __name__ == '__main__':
  main()
