"""Open complete game recording exports before ordinary engine admission."""
import base64
import gzip
import hashlib
import io
import json
from pathlib import Path

MAX_SAVE_BYTES = 50 * 1024 * 1024
SCHEMA = 'neighbours/recording@1'


def _recording(value):
  return (isinstance(value, dict) and isinstance(value.get('schema'), str)
          and value['schema'].startswith('neighbours/recording@'))


def load_checkpoint(path: Path):
  if path.stat().st_size > MAX_SAVE_BYTES:
    raise ValueError('Save exceeds the 50 MiB import limit.')
  raw = path.read_bytes()
  if raw[:2] == b'\x1f\x8b' or path.name.lower().endswith('.gz'):
    with gzip.GzipFile(fileobj=io.BytesIO(raw)) as stream:
      raw = stream.read(MAX_SAVE_BYTES + 1)
    if len(raw) > MAX_SAVE_BYTES:
      raise ValueError('Save expands beyond the 50 MiB import limit.')
  value = json.loads(raw)
  packed = value
  if isinstance(value, dict) and _recording(value.get('packet')):
    if not ((set(value) == {'slot', 'packet'} and value['slot'] in ('latest', 'previous'))
            or (set(value) == {'file', 'packet'} and value['file'] is True)):
      raise ValueError('Invalid recorded save wrapper.')
    packed = value['packet']
  if not _recording(packed):
    return value
  if (set(packed) != {'schema', 'codec', 'decodedBytes', 'sha256', 'data'}
      or packed['schema'] != SCHEMA or packed['codec'] != 'gzip-base64'
      or type(packed['decodedBytes']) is not int
      or not 1 <= packed['decodedBytes'] <= MAX_SAVE_BYTES
      or not isinstance(packed['sha256'], str) or len(packed['sha256']) != 64
      or any(c not in '0123456789abcdef' for c in packed['sha256'])
      or not isinstance(packed['data'], str)
      or len(packed['data']) > 4 * ((MAX_SAVE_BYTES + 2) // 3)):
    raise ValueError('Invalid recording or decoded size beyond the 50 MiB limit.')
  compressed = base64.b64decode(packed['data'], validate=True)
  if base64.b64encode(compressed).decode() != packed['data']:
    raise ValueError('Invalid recording base64.')
  with gzip.GzipFile(fileobj=io.BytesIO(compressed)) as stream:
    decoded = stream.read(MAX_SAVE_BYTES + 1)
  if len(decoded) > MAX_SAVE_BYTES:
    raise ValueError('Recording expands beyond the 50 MiB import limit.')
  if (len(decoded) != packed['decodedBytes']
      or hashlib.sha256(decoded).hexdigest() != packed['sha256']):
    raise ValueError('Recording size or hash does not match its complete JSON.')
  packet = json.loads(decoded.decode('utf-8'))
  if _recording(packet) or (isinstance(packet, dict) and _recording(packet.get('packet'))):
    raise ValueError('Nested recordings are not supported.')
  return packet
