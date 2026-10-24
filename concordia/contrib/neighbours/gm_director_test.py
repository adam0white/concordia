"""Actual upstream GM contracts and hostile proposal boundary controls."""
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest

from concordia.components.game_master import make_observation
from concordia.contrib.neighbours.gm_director import (
    ProviderUsageLimit, ReplayModel, bounded_cli_output, checkpoint_context, digest, parse_proposal, replay_report, run_director,
    runtime_sources, validate_proposal, UPSTREAM_SHA)
from concordia.typing import entity

GOOD = {'schema': 'neighbours-gm-proposal@1', 'kind': 'inspection-request',
        'target': 'hall-annex', 'cue': 'wet-sound', 'windowMinutes': 180}


class RecordingModel(ReplayModel):
  def __init__(self, raw):
    super().__init__([])
    self.raw = raw
    self.prompts = []

  def sample_text(self, prompt, **kwargs):
    self.prompts.append(prompt)
    self.tape.append({'promptSha256': digest(prompt), 'status': 'completed',
                      'rawResponse': self.raw, 'modelIds': ['test-only-model'],
                      'cliVersion': 'test-only-cli', 'requestedModel': 'test-only'})
    return self.raw


class GmDirectorTest(unittest.TestCase):
  def test_proposal_utf8_byte_limit_rejects_before_json_parsing(self):
    # A syntactically valid allowed object plus whitespace must still reject.
    raw = json.dumps(GOOD) + ' ' * 4096
    with self.assertRaisesRegex(ValueError, '4096 UTF-8 bytes'):
      parse_proposal(raw)
    with self.assertRaisesRegex(ValueError, '4096 UTF-8 bytes'):
      parse_proposal('é' * 2049)
    result = run_director(RecordingModel(raw), {'fictional': True})
    self.assertEqual(result['rawResponse'], raw)
    self.assertIsNone(result['proposal'])
    self.assertEqual(result['hostInbox'], '')

  def test_cli_envelope_is_bounded_without_calling_a_model(self):
    with tempfile.TemporaryDirectory() as directory:
      self.assertEqual(bounded_cli_output([sys.executable, '-c', 'print("bounded")'], directory), 'bounded\n')
      with self.assertRaisesRegex(RuntimeError, '1 MiB byte limit'):
        bounded_cli_output([sys.executable, '-c', 'import sys; sys.stdout.write("x" * (1024 * 1024 + 1))'], directory)

  def test_usage_limit_escapes_failed_case_handlers_before_another_call(self):
    with tempfile.TemporaryDirectory() as directory:
      with self.assertRaisesRegex(ProviderUsageLimit, 'USAGE LIMIT'):
        bounded_cli_output([sys.executable, '-c', 'import sys; print("Usage limit reached"); sys.exit(1)'], directory)
    self.assertFalse(issubclass(ProviderUsageLimit, Exception))

  def test_stderr_usage_limit_stops_before_timeout_or_generic_failure(self):
    with tempfile.TemporaryDirectory() as directory:
      for ending in ('sys.exit(1)', 'time.sleep(10)'):
        with self.subTest(ending=ending), self.assertRaisesRegex(ProviderUsageLimit, 'USAGE LIMIT'):
          bounded_cli_output([sys.executable, '-c',
              'import sys,time; print("Usage limit reached", file=sys.stderr, flush=True); ' + ending], directory, timeout=0.5)

  def test_runtime_fingerprint_covers_actual_inspection_semantics(self):
    root = Path(__file__).resolve().parents[3]
    self.assertIn('neighbours/src/experiments/inspection.ts', runtime_sources(root)['files'])

  def test_model_receives_actual_saved_facts_with_knowledge_and_stage_limits(self):
    future = {'id': 'class-1', 'kind': 'class', 'organiserId': 'lea',
              'startsAt': 2520, 'endsAt': 2580, 'stage': 'candidate'}
    checkpoint = {'runtime': {
        'now': 1530, 'hall': 13, 'hallSafe': True,
        'places': [{'id': 'hall', 'capacity': 10}],
        'people': [{'person': {'id': 'lea', 'name': 'Lea', 'methods': {'rules': [
            {'id': 'hall-section-inspection', 'evidence': [{'id': 'received-1'}, {'id': 'received-2'}]},
            {'id': 'unrelated-method', 'evidence': [{'id': 'unrelated'}]}]}},
            'role': 'teacher', 'place': 'school', 'job': {
                'offer': {'id': 'teach', 'action': 'teach', 'label': 'Teach at school', 'placeId': 'school'},
                'arrive': 1500, 'end': 1560}}],
        'socialEvenings': {'events': [{**future, 'id': 'past', 'endsAt': 1440}],
                           'recurrence': {'cycles': [{'events': [future]}]}},
    }}
    original = copy.deepcopy(checkpoint)
    context = checkpoint_context(checkpoint)
    self.assertEqual(context['time'], {'minute': 1530, 'day': 2, 'minuteOfDay': 90})
    self.assertEqual(context['hall'], {'repairUnits': 13, 'safe': True, 'capacity': 10})
    self.assertEqual(context['residents'][0]['retainedInspectionRuleCount'], 1)
    self.assertEqual(context['residents'][0]['retainedInspectionEvidenceCount'], 2)
    self.assertEqual(context['residents'][0]['currentHostJob']['action'], 'teach')
    self.assertEqual(context['nextSocialEvents'], [future])
    self.assertEqual(checkpoint, original)
    model = RecordingModel(json.dumps(GOOD))
    result = run_director(model, checkpoint)
    self.assertEqual(result['townContext'], context)
    self.assertIn(json.dumps(context, sort_keys=True, separators=(',', ':')), model.prompts[0])
    self.assertIn('not shared resident knowledge', model.prompts[0])
    self.assertEqual(checkpoint, original)

  def test_closed_hall_context_does_not_grant_host_application(self):
    checkpoint = {'runtime': {'now': 480, 'hall': 0, 'hallSafe': False,
                             'places': [{'id': 'hall', 'capacity': 10}], 'people': []}}
    result = run_director(RecordingModel(json.dumps(GOOD)), checkpoint)
    self.assertFalse(result['townContext']['hall']['safe'])
    self.assertEqual(result['proposal'], GOOD)  # Structural candidate only.
    self.assertFalse(result['hostApplied'])
    self.assertEqual(result['residentObservationsDelivered'], 0)

  def test_allowlist_accepts_all_three_cues_and_boundary_windows(self):
    for cue in ('dry-sound', 'wet-sound', 'unsupported'):
      for window in (60, 1440):
        self.assertEqual(validate_proposal({**GOOD, 'cue': cue, 'windowMinutes': window})['cue'], cue)

  def test_hostile_and_invalid_proposals_reject(self):
    bad = [None, [], 'repaired', {**GOOD, 'outcome': 'success'},
           {**GOOD, 'recipients': ['Invented person']}, {**GOOD, 'expertise': 1},
           {**GOOD, 'kind': 'repair-completed'}, {**GOOD, 'target': 'clinic'},
           {**GOOD, 'schema': 'other'}, {**GOOD, 'cue': 'hidden-fault'},
           {key: val for key, val in GOOD.items() if key != 'cue'}]
    bad.extend({**GOOD, 'windowMinutes': window} for window in (True, 60.0, '60', 59, 1441, None))
    for value in bad:
      with self.subTest(value=value), self.assertRaises(ValueError):
        validate_proposal(value)
    for text in ('```json\n' + json.dumps(GOOD) + '\n```',
                 json.dumps(GOOD)[:-1] + ',"cue":"dry-sound"}'):
      with self.assertRaises(ValueError):
        parse_proposal(text)

  def test_actual_upstream_resolution_and_observation_replay(self):
    model = RecordingModel(json.dumps(GOOD))
    checkpoint = {'fictional': True, 'now': 0}
    result = run_director(model, checkpoint)
    self.assertEqual(len(model.tape), 1)
    self.assertEqual(result['proposal'], GOOD)
    self.assertEqual(json.loads(result['hostInbox']), GOOD)
    self.assertEqual(result['emptyInbox'], '')
    self.assertFalse(result['hostApplied'])
    replay = ReplayModel(model.tape)
    self.assertEqual(run_director(replay, checkpoint), result)
    self.assertEqual(replay.cursor, 1)
    with self.assertRaises(ValueError):
      run_director(ReplayModel(model.tape), {'fictional': True, 'now': 1})

  def test_rejected_model_response_is_retained_and_never_queued(self):
    raw = json.dumps({**GOOD, 'outcome': 'Everyone learned repair'})
    model = RecordingModel(raw)
    result = run_director(model, {'fictional': True})
    self.assertEqual(result['rawResponse'], raw)
    self.assertIsNone(result['proposal'])
    self.assertTrue(result['rejection'])
    self.assertEqual(result['hostInbox'], '')
    self.assertEqual(len(model.tape), 1)

  def test_upstream_disabled_observation_fallback_never_calls_model(self):
    model = ReplayModel([])  # Any sample would raise tape exhausted.
    component = make_observation.MakeObservation(model, ['Ada'], allow_llm_fallback=False)
    spec = entity.ActionSpec(call_to_action=make_observation.DEFAULT_CALL_TO_MAKE_OBSERVATION.format(name='Ada'), output_type=entity.OutputType.MAKE_OBSERVATION)
    self.assertEqual(component.pre_act(spec), '')
    component.add_to_queue('Ada', 'Host-authored observation only.')
    self.assertEqual(component.pre_act(spec).strip(), 'Host-authored observation only.')
    self.assertEqual(component.pre_act(spec), '')
    self.assertEqual(model.cursor, 0)

  def test_artifact_replay_checks_actual_sources_checkpoint_and_schema(self):
    root = Path(__file__).resolve().parents[3]
    model = RecordingModel(json.dumps(GOOD))
    checkpoint = {'fictional': True}
    result = run_director(model, checkpoint)
    report = {'schema': 'native-concordia-gm@1', 'upstreamSha': UPSTREAM_SHA,
              'runtimeSources': runtime_sources(root), 'checkpoint': checkpoint,
              'checkpointSha256': digest(checkpoint), 'responseTape': model.tape,
              'result': result, 'modelCalls': 1, 'cliVersion': 'test-only-cli',
              'modelIds': ['test-only-model'], 'requestedModel': 'test-only',
              'sourceFingerprint': runtime_sources(root)['sha256'],
              'proposal': result['proposal'], 'rawResponse': result['rawResponse'],
              'rejection': result['rejection']}
    self.assertTrue(replay_report(report, root)['replayExact'])
    for mutate in (
        lambda r: r.update(schema='bad'),
        lambda r: r['runtimeSources']['files'].update({'invented.py': 'bad'}),
        lambda r: r['checkpoint'].update(now=1),
        lambda r: r['responseTape'][0].update(rawResponse='{}'),
        lambda r: r.update(modelCalls=2),
        lambda r: r.update(modelIds=[]),
        lambda r: r.update(proposal={**GOOD, 'windowMinutes': 120}),
    ):
      broken = copy.deepcopy(report)
      mutate(broken)
      with self.assertRaises(ValueError):
        replay_report(broken, root)


if __name__ == '__main__':
  unittest.main()
