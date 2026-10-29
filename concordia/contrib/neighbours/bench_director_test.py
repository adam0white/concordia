"""Scripted-provider controls using the actual upstream GM chain, no live calls."""
import copy
import json
from pathlib import Path
import unittest

from concordia.contrib.neighbours.bench_director import (
    CATALOG, ReplayModel, UPSTREAM_SHA, checkpoint_context, digest, parse_proposal,
    replay_report, run_director, runtime_sources, validate_proposal)
from concordia.contrib.neighbours.gm_director_test import RecordingModel

GOOD = {'schema': 'neighbours-bench-proposal@1', 'kind': 'bench-window', 'slot': 'soon'}
CHECKPOINT = {'runtime': {'now': 480, 'handcart': {'progress': 0, 'requests': []},
    'places': [{'id': 'workshop', 'capacity': 3, 'reserved': 1}],
    'people': [{'person': {'id': 'ada', 'name': 'Ada', 'privateMemory': 'SECRET'},
                'place': 'workshop', 'job': {'offer': {'action': 'work', 'placeId': 'workshop'},
                                            'arrive': 480, 'end': 540}}]}}


class BenchDirectorTest(unittest.TestCase):
  def test_catalog_slots_are_discussable_not_granted(self):
    for slot in ('soon', 'tomorrow', 'brief'):
      self.assertEqual(validate_proposal({**GOOD, 'slot': slot})['slot'], slot)
    self.assertEqual(CATALOG['brief']['durationMinutes'], 30)
    self.assertIn('too short', CATALOG['brief']['description'])

  def test_schema_timing_recipients_sources_invented_completion_and_extra_attributes_reject(self):
    invalid = [None, [], {**GOOD, 'kind': 'bench-permission'}, {**GOOD, 'schema': 'other'},
               {**GOOD, 'slot': 'now'}, {**GOOD, 'slot': []}, {'kind': 'bench-window', 'slot': 'soon'}]
    invalid.extend({**GOOD, key: val} for key, val in (
        ('from', 480), ('until', 600), ('durationMinutes', 60), ('recipient', 'ravi'),
        ('source', 'ada'), ('consent', True), ('completed', True), ('knowledge', 'repair'),
        ('hiddenAbility', 'expert'), ('extra', None)))
    for value in invalid:
      with self.subTest(value=value), self.assertRaises(ValueError):
        validate_proposal(value)
    for raw in ('```json\n' + json.dumps(GOOD) + '\n```',
                json.dumps(GOOD)[:-1] + ',"slot":"tomorrow"}',
                json.dumps(GOOD) + ' ' * 4096, 'é' * 2049):
      with self.assertRaises(ValueError):
        parse_proposal(raw)

  def test_compact_host_projection_does_not_expose_snapshot_or_private_input(self):
    checkpoint = copy.deepcopy(CHECKPOINT)
    checkpoint['ownerFile'] = 'PRIVATE'
    evidence = {'nextDecisionAt': 495, 'raviLegalOfferIds': ['cart-ask'],
                'adaPresentAtWorkshop': True, 'cartProgress': 0, 'ownerNotes': 'PRIVATE'}
    original = copy.deepcopy(checkpoint)
    model = RecordingModel(json.dumps(GOOD))
    result = run_director(model, checkpoint, evidence)
    self.assertEqual(checkpoint, original)
    self.assertNotIn('SECRET', model.prompts[0])
    self.assertNotIn('PRIVATE', model.prompts[0])
    self.assertEqual(result['townContext'], checkpoint_context(checkpoint, evidence))
    self.assertIn('opportunity cost', model.prompts[0])
    self.assertIn('physical capacity', model.prompts[0])
    self.assertIn('not shared resident knowledge', model.prompts[0])
    self.assertEqual(result['townContext']['nextScheduledDecision']['nextDecisionAt'], 495)

  def test_arrived_job_location_is_not_its_stored_origin(self):
    checkpoint = copy.deepcopy(CHECKPOINT)
    checkpoint['runtime']['people'][0]['place'] = 'homes'
    resident = checkpoint_context(checkpoint)['residents'][0]
    self.assertEqual(resident['physicalPlaceId'], 'workshop')
    self.assertEqual(resident['storedPlaceId'], 'homes')
    checkpoint['runtime']['people'][0]['job']['arrive'] = 495
    self.assertIsNone(checkpoint_context(checkpoint)['residents'][0]['physicalPlaceId'])

  def test_actual_upstream_chain_one_scripted_call_and_exact_replay(self):
    model = RecordingModel(json.dumps(GOOD))
    result = run_director(model, CHECKPOINT)
    self.assertEqual(len(model.tape), 1)
    self.assertEqual(json.loads(result['hostInbox']), GOOD)
    self.assertEqual(result['hostInboxRecipient'], 'Host')
    self.assertEqual(result['emptyInbox'], '')
    self.assertFalse(result['hostApplied'])
    self.assertEqual(result['residentObservationsDelivered'], 0)
    replay = ReplayModel(model.tape)
    self.assertEqual(run_director(replay, CHECKPOINT), result)
    self.assertEqual(replay.cursor, 1)
    with self.assertRaises(ValueError):
      run_director(ReplayModel(model.tape), {**CHECKPOINT, 'changed': True})

  def test_invalid_response_retained_without_observation(self):
    for raw in ('{}', json.dumps({**GOOD, 'consent': True})):
      model = RecordingModel(raw)
      result = run_director(model, CHECKPOINT)
      self.assertEqual(result['rawResponse'], raw)
      self.assertIsNone(result['proposal'])
      self.assertTrue(result['rejection'])
      self.assertEqual(result['hostInbox'], '')
      self.assertEqual(len(model.tape), 1)

  def test_fixed_case_source_bound_report_replay_and_tamper_controls(self):
    root = Path(__file__).resolve().parents[3]
    sources = runtime_sources(root)
    cases = []
    for seed, slot in zip((42, 73), ('soon', 'tomorrow')):
      checkpoint = {**CHECKPOINT, 'seed': seed}
      evidence = {'nextDecisionAt': 495}
      model = RecordingModel(json.dumps({**GOOD, 'slot': slot}))
      result = run_director(model, checkpoint, evidence)
      cases.append({'seed': seed, 'checkpoint': checkpoint, 'checkpointSha256': digest(checkpoint),
                    'captureEvidence': evidence, 'responseTape': model.tape, 'modelCalls': 1,
                    'modelIds': ['test-only-model'], 'result': result})
    report = {'schema': 'native-concordia-bench@1', 'upstreamSha': UPSTREAM_SHA,
              'runtimeSources': sources, 'sourceFingerprint': sources['sha256'],
              'requestedModel': 'test-only', 'cliVersion': 'test-only-cli',
              'seeds': [42, 73], 'noNaturalCaseSeeds': [101], 'cases': cases, 'modelCalls': 2}
    self.assertEqual(replay_report(report, root), {'replayExact': True, 'modelCalls': 0, 'caseCount': 2})
    self.assertIn('neighbours/scripts/run-bench-director.py', sources['files'])
    self.assertIn('neighbours/scripts/check-hf4-continuation.ts', sources['files'])
    self.assertNotIn('neighbours/scripts/capture-bench.ts', sources['files'])
    for mutation in (
        lambda r: r.update(upstreamSha='bad'),
        lambda r: r.update(modelCalls=3),
        lambda r: r.update(cliVersion=''),
        lambda r: r.update(sourceFingerprint='bad'),
        lambda r: r['runtimeSources']['files'].update({'invented.py': 'bad'}),
        lambda r: r['cases'][0]['checkpoint'].update(changed=True),
        lambda r: r['cases'][0].update(modelCalls=2),
        lambda r: r['cases'][0]['result'].update(hostInboxRecipient='ravi'),
        lambda r: r['cases'][0]['captureEvidence'].update(nextDecisionAt=500),
        lambda r: r.update(seeds=[73, 42]),
        lambda r: r.update(noNaturalCaseSeeds=[]),
    ):
      broken = copy.deepcopy(report)
      mutation(broken)
      with self.assertRaises(ValueError):
        replay_report(broken, root)


if __name__ == '__main__':
  unittest.main()
