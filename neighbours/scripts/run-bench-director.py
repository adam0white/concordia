#!/usr/bin/env python3
"""Historical HF3 experiment launcher. Fresh capture refuses before a provider.

Current component protocol replay is distinct from the immutable old reports.
"""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from concordia.contrib.neighbours.bench_director import (
    ClaudeCliModel, UPSTREAM_SHA, digest, replay_report, run_director,
    runtime_sources, verify_upstream_sources)
from concordia.contrib.neighbours.bench_director import BENCH_SEEDS, NO_NATURAL_CASE_SEEDS

SEEDS = list(BENCH_SEEDS)


def capture_checkpoint(node, seed):
  """Refuse the archived HF3 bench experiment before any provider call."""
  del node, seed
  raise RuntimeError(
      'Historical HF3 bench capture is unsupported on current HF4; '
      'the archived experiment is not current evidence. No provider was invoked.')


def main():
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument('--model', default='opus')
  parser.add_argument('--seeds', default='42,73')
  parser.add_argument('--node', default='node')
  parser.add_argument('--replay', type=Path)
  parser.add_argument('--output', type=Path, default=Path('/tmp/neighbours-native-bench.json'))
  args = parser.parse_args()
  if args.replay:
    print(json.dumps(replay_report(json.loads(args.replay.read_text()), ROOT)))
    return
  if args.seeds != '42,73':
    parser.error('The fixed cases are --seeds 42,73; do not select winners')
  verify_upstream_sources(ROOT)
  sources = runtime_sources(ROOT)
  # Freeze every fresh case before any model call. Failed capture makes no call.
  frozen = [(seed, *capture_checkpoint(args.node, seed)) for seed in SEEDS]
  model = ClaudeCliModel(args.model, max_calls=len(SEEDS))
  report = {
      'schema': 'native-concordia-bench@1', 'upstreamSha': UPSTREAM_SHA,
      'recordedAt': datetime.now(timezone.utc).isoformat(), 'seeds': SEEDS, 'noNaturalCaseSeeds': list(NO_NATURAL_CASE_SEEDS),
      'runtime': 'Native upstream EntityAgent/SwitchAct/EventResolution/MakeObservation + real Claude CLI',
      'runtimeSources': sources, 'sourceFingerprint': sources['sha256'],
      'gitHeadAtRun': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
      'sourceWorkingTreeDirty': bool(subprocess.check_output(['git', 'status', '--porcelain', '--', *sources['files']], cwd=ROOT, text=True).strip()),
      'requestedModel': args.model, 'cliVersion': model.cli_version,
      'cases': [],
      'limits': [
          'Fixed seeds captured before model calls; one attempt each with no retry or winner selection.',
          'Seed 101 has no natural bench case within 40 days under Phase C physics; it is recorded, not substituted.',
          'Complete checkpoints precede the next scheduled legal cart-ask decision; current actors can still have jobs.',
          'Typed windows are discussable premises; host application, recipient observations, consent and work remain separate.',
          'Recorded browser cases do not run this live native provider.',
      ],
  }
  for seed, checkpoint, evidence in frozen:
    case = {'seed': seed, 'checkpoint': checkpoint, 'checkpointSha256': digest(checkpoint),
            'captureEvidence': evidence}
    before = len(model.tape)
    try:
      case['result'] = run_director(model, checkpoint, evidence)
    except Exception as error:  # Preserve failed provider attempts, never retry.
      case['failure'] = f'{type(error).__name__}: {error}'
    case['responseTape'] = model.tape[before:]
    case['modelCalls'] = len(case['responseTape'])
    case['modelIds'] = case['responseTape'][0].get('modelIds', []) if case['responseTape'] else []
    report['cases'].append(case)
    if 'failure' in case:
      break  # No further provider calls after any failed attempt, including unclassified limits.
  report['unattemptedSeeds'] = list(SEEDS[len(report['cases']):])
  report['modelCalls'] = len(model.tape)
  if all('result' in case for case in report['cases']):
    report.update(replay_report(report, ROOT))
    # replay_report's modelCalls is the replay count, keep generation separate.
    report.update(modelCalls=len(model.tape), replayModelCalls=0)
  else:
    report.update(replayExact=False, replayFailure='A provider attempt failed; no exact completed-response replay exists.')
  encoded = json.dumps(report, indent=2, ensure_ascii=False) + '\n'
  if any(token in encoded for token in ('session_id', 'access_token', '/Users/')):
    raise RuntimeError('Artifact contains forbidden private metadata')
  args.output.parent.mkdir(parents=True, exist_ok=True)
  args.output.write_text(encoded)
  print(json.dumps({'output': str(args.output), 'modelCalls': len(model.tape),
                    'replayExact': report['replayExact'],
                    'cases': [{'seed': case['seed'], 'result': case.get('result', {}).get('proposal'),
                               'rejection': case.get('result', {}).get('rejection'),
                               'failure': case.get('failure')} for case in report['cases']]}))
  if any('failure' in case for case in report['cases']):
    raise SystemExit(1)


if __name__ == '__main__':
  main()
