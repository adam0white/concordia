"""Typed discussable bench premises through actual upstream GM components.

The host is the only inbox recipient. No resident knowledge, consent, physical
access or completed work is established by this producer.
"""
import hashlib
import json

from concordia.agents import entity_agent
from concordia.components.agent import memory
from concordia.components.game_master import event_resolution, make_observation, next_acting, switch_act
from concordia.contrib.neighbours.gm_director import (
    ClaudeCliModel, ReplayModel, UPSTREAM_SHA, digest,
    runtime_sources as gm_runtime_sources, verify_upstream_sources)
from concordia.typing import entity

SCHEMA = 'neighbours-bench-proposal@1'
KEYS = {'schema', 'kind', 'slot'}
CATALOG = {
    'soon': {'description': 'Four-hour window within 08:00–18:00, starting at least 45 minutes after the checkpoint: 15 to the next decision, 15 to ask, 15 to reply. If it cannot fit, use next morning.', 'durationMinutes': 240},
    'tomorrow': {'description': 'Next morning 08:00–12:00 after discussion.', 'durationMinutes': 240},
    'brief': {'description': 'Earliest 30-minute window within 08:00–18:00 with the same 45-minute scheduling lead; too short for known 60-minute main-bench work.', 'durationMinutes': 30},
}
LIMITS = [
    'This proposes a window to discuss, never permission, agreement, knowledge or completed work.',
    'The host maps slots to actual times, checks physical capacity and existing jobs, and routes observations to actual recipients.',
    'Ada has her own paid main-bench work; lending delays access and has opportunity cost, not guaranteed lost income.',
    'Main-bench work requires 60 uninterrupted minutes; a 30-minute brief window is deliberately insufficient.',
    'No hidden ability is inferred. Context is host bookkeeping, not shared resident knowledge.',
    'Only the Host inbox receives this typed proposal; no HF person receives it here.',
]


def validate_proposal(value):
  if (not isinstance(value, dict) or set(value) != KEYS
      or value.get('schema') != SCHEMA or value.get('kind') != 'bench-window'
      or not isinstance(value.get('slot'), str) or value['slot'] not in CATALOG):
    raise ValueError('Bench proposal violates the strict host catalog')
  return dict(value)


def parse_proposal(raw):
  if not isinstance(raw, str) or len(raw.encode('utf-8')) > 4096:
    raise ValueError('Proposal must be text of at most 4096 UTF-8 bytes')
  def unique(pairs):
    value = {}
    for key, item in pairs:
      if key in value:
        raise ValueError('Duplicate proposal key')
      value[key] = item
    return value
  return validate_proposal(json.loads(raw, object_pairs_hook=unique))


def checkpoint_context(checkpoint, capture_evidence=None):
  """Compact fictional host facts; never pass full person snapshots to a model."""
  runtime = checkpoint.get('runtime', {})
  now = runtime.get('now')
  workshop = next((p for p in runtime.get('places', []) if p.get('id') == 'workshop'), {})
  residents = []
  for resident in runtime.get('people', []):
    person = resident['person']
    job = resident.get('job')
    residents.append({
        'id': person['id'], 'name': person['name'], 'storedPlaceId': resident['place'],
        'physicalPlaceId': (job['offer'].get('placeId')
                            if job['arrive'] <= now <= job['end'] else None)
                           if job else resident['place'],
        'currentHostJob': None if not job else {
            'action': job['offer']['action'], 'placeId': job['offer'].get('placeId'),
            'arrivesAt': job['arrive'], 'endsAt': job['end']},
    })
  cart = runtime.get('handcart') or {}
  context = {
      'time': {'minute': now, 'minuteOfDay': now % 1440 if type(now) is int else None},
      'residents': sorted(residents, key=lambda p: p['id']),
      'workshop': {'capacity': workshop.get('capacity'), 'reserved': workshop.get('reserved'),
                   'opensMinuteOfDay': 480, 'closesMinuteOfDay': 1080},
      'cart': {'progress': cart.get('progress'), 'requiredSections': 3,
               'mainBenchWorkMinutes': 60, 'sideBenchWorkMinutes': 120,
               'requestCount': len(cart.get('requests', [])),
               'existingBenchWindow': {key: cart['bench'][key] for key in ('from', 'until')}
                                      if cart.get('bench') else None},
      'limits': LIMITS,
  }
  if capture_evidence:
    # Explicit projection prevents arbitrary caller/file contents entering prompt.
    context['nextScheduledDecision'] = {key: capture_evidence.get(key) for key in (
        'nextDecisionAt', 'raviLegalOfferIds', 'adaPresentAtWorkshop', 'cartProgress',
        'premiseAdmissibleAtBoundary', 'premiseAdmissibleAtNextDecision', 'raviPhysicalPlaceAtBoundary')}
  return context


def run_director(model, checkpoint, capture_evidence=None):
  context = checkpoint_context(checkpoint, capture_evidence)
  request = (
      'Propose one fictional main-bench window for Ravi to DISCUSS with Ada. '
      'This does not give access, consent, resident knowledge or a repair outcome. '
      'The host maps the slot to physical time and routes any actual recipient observation. '
      f'Checkpoint SHA256: {digest(checkpoint)}. '
      f'Fictional host context: {json.dumps(context, sort_keys=True, separators=(",", ":"))}. '
      f'Fixed physical catalog: {json.dumps(CATALOG, sort_keys=True, separators=(",", ":"))}. '
      'Choose one slot; the too-short option is valid and must not be silently improved. '
      'Return exactly {"schema":"neighbours-bench-proposal@1","kind":"bench-window",'
      '"slot":"soon OR tomorrow OR brief"}, selecting one exact slot string. '
      'No extra keys, recipients, invented times, hidden abilities or completion claims. '
      'Plain JSON below 4096 UTF-8 bytes.'
  )
  result = {}
  def propose(document, premise, active_player_name):
    del premise, active_player_name
    raw = document.open_question(question=request, max_tokens=180, terminators=())
    result['rawResponse'] = raw
    try:
      result.update(proposal=parse_proposal(raw), rejection=None)
    except (ValueError, TypeError) as error:
      result.update(proposal=None, rejection=str(error))
    return 'Host bench proposal validated' if result['proposal'] else 'Host bench proposal rejected'
  initiative = next_acting.NextActing(model, ['Host'])
  initiative.set_state({'currently_active_player': 'Host'})
  inbox = make_observation.MakeObservation(model, ['Host'], allow_llm_fallback=False)
  resolver = event_resolution.EventResolution(model, [propose], notify_observers=False)
  gm = entity_agent.EntityAgent('Bench premise director', switch_act.SwitchAct(model, ['Host']), {
      '__memory__': memory.ListMemory(['[putative_event] Host: Request a discussable bench window.']),
      '__next_acting__': initiative, '__resolution__': resolver, '__make_observation__': inbox})
  resolution = gm.act(entity.ActionSpec(call_to_action='Resolve the host bench proposal.', output_type=entity.OutputType.RESOLVE))
  if result['proposal']:
    inbox.add_to_queue('Host', json.dumps(result['proposal'], sort_keys=True))
  spec = entity.ActionSpec(call_to_action=make_observation.DEFAULT_CALL_TO_MAKE_OBSERVATION.format(name='Host'), output_type=entity.OutputType.MAKE_OBSERVATION)
  observation = gm.act(spec)
  empty = gm.act(spec)
  return {**result, 'resolution': resolution, 'hostInbox': observation, 'emptyInbox': empty,
          'hostInboxRecipient': 'Host', 'checkpointSha256': digest(checkpoint),
          'townContext': context, 'catalog': CATALOG,
          'hostApplied': False, 'residentObservationsDelivered': 0}


def runtime_sources(root):
  sources = gm_runtime_sources(root)
  files = dict(sources['files'])
  for path in ('neighbours/scripts/run-bench-director.py', 'neighbours/scripts/capture-bench.ts'):
    files[path] = hashlib.sha256((root / path).read_bytes()).hexdigest()
  identity = {'files': files, 'hf': sources['hf']}
  return {**identity, 'sha256': digest(identity)}


def replay_report(report, root):
  if report.get('schema') != 'native-concordia-bench@1' or report.get('upstreamSha') != UPSTREAM_SHA:
    raise ValueError('Unknown bench artifact or upstream source')
  verify_upstream_sources(root)
  if report.get('runtimeSources') != runtime_sources(root) or report.get('sourceFingerprint') != report['runtimeSources']['sha256']:
    raise ValueError('Runtime sources differ; regenerate actual evidence')
  if (report.get('seeds') != [42, 73, 101] or len(report.get('cases', [])) != 3
      or report.get('modelCalls') != 3
      or not isinstance(report.get('requestedModel'), str) or not report['requestedModel']
      or not isinstance(report.get('cliVersion'), str) or not report['cliVersion']):
    raise ValueError('Fixed three-case bench catalog differs')
  for seed, case in zip(report['seeds'], report['cases']):
    tape = case.get('responseTape')
    if (case.get('seed') != seed or case.get('modelCalls') != 1 or
        not isinstance(tape, list) or len(tape) != 1 or
        tape[0].get('status') != 'completed' or
        not isinstance(tape[0].get('modelIds'), list) or not tape[0]['modelIds'] or
        any(not isinstance(name, str) or not name for name in tape[0]['modelIds']) or
        tape[0].get('modelIds') != case.get('modelIds') or
        tape[0].get('requestedModel') != report.get('requestedModel') or
        tape[0].get('cliVersion') != report.get('cliVersion') or
        digest(case['checkpoint']) != case.get('checkpointSha256')):
      raise ValueError('Invalid bench case, checkpoint or provider provenance')
    replay = ReplayModel(tape)
    actual = run_director(replay, case['checkpoint'], case['captureEvidence'])
    if actual != case['result'] or replay.cursor != 1:
      raise ValueError('Upstream bench replay diverged')
  return {'replayExact': True, 'modelCalls': 0, 'caseCount': 3}
