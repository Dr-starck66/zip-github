import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

MOD = Path(__file__).resolve().parents[1] / 'tools' / 'chatgpt_export_preflight.py'
spec = importlib.util.spec_from_file_location('preflight', MOD)
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)

def conversation():
    def node(parent, role, text, **kwargs):
        return {'parent': parent, 'message': {'author': {'role': role},
                'content': {'parts': [text]}, **kwargs}}
    return {'id': 'abc-123', 'title': 'private title', 'current_node': 'd', 'mapping': {
        'a': node(None, 'user', 'Bonjour, appelons notre projet SOULBRIDGE.'),
        'b': node('a', 'assistant', 'Je le retiens.'),
        'c': node('a', 'assistant', 'ALTERNATIVE BRANCH THAT MUST NOT IMPORT'),
        'd': node('b', 'user', 'Cela concerne un robot.'),
        'e': node('d', 'assistant', 'SECRET TOOL CONTENT', recipient='python'),
    }}

class OfflinePreflightTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.zip = self.home / 'export.zip'
        with zipfile.ZipFile(self.zip, 'w', compression=zipfile.ZIP_DEFLATED) as z:
            z.writestr('conversations.json', json.dumps([conversation()]))
            z.writestr('user_data.json', json.dumps({'secret': 'DO NOT READ'}))

    def test_inventory_does_not_write_capsule(self):
        r = p.inventory(self.zip)
        self.assertEqual(r['conversations_with_visible_text'], 1)
        self.assertFalse(r['private_capsule_created'])
        self.assertEqual(len(list(self.home.iterdir())), 1)

    def test_current_branch_and_hidden_message_rejected(self):
        history = p.visible_history(conversation())
        self.assertEqual([t['role'] for t in history], ['user','assistant','user'])
        self.assertNotIn('ALTERNATIVE', repr(history))
        self.assertNotIn('SECRET', repr(history))

    def test_requires_explicit_consent(self):
        with self.assertRaisesRegex(p.ImportErrorSafe, 'CONSENT'):
            p.make_private_capsule(self.zip, ['abc-123'], self.home / 'private.json')

    def test_prepare_private_local_only(self):
        outfile = self.home / 'private.json'
        result = p.make_private_capsule(self.zip, ['abc-123'], outfile, consent=True)
        data = json.loads(outfile.read_text())
        self.assertEqual(result['excerpts'], 3)
        self.assertEqual(data['processing']['source'], 'chatgpt_export_local_private')
        self.assertFalse(data['processing']['robot_runtime_enabled'])
        self.assertNotIn('private title', outfile.read_text())
        self.assertEqual(outfile.stat().st_mode & 0o777, 0o600)
        with self.assertRaisesRegex(p.ImportErrorSafe, 'OUTPUT_ALREADY_EXISTS'):
            p.make_private_capsule(self.zip, ['abc-123'], outfile, consent=True)

    def test_missing_current_node_fail_closed(self):
        c = conversation()
        c['current_node'] = 'not-here'
        with self.assertRaisesRegex(p.ImportErrorSafe, 'BROKEN_CURRENT'):
            p.visible_history(c)

    def test_cycles_fail_closed(self):
        c = conversation()
        c['mapping']['a']['parent'] = 'd'
        with self.assertRaisesRegex(p.ImportErrorSafe, 'INVALID_CONVERSATION_GRAPH'):
            p.visible_history(c)

    def test_no_archive_traversal(self):
        with zipfile.ZipFile(self.zip, 'w') as z:
            z.writestr('../conversations.json', json.dumps([conversation()]))
        with self.assertRaisesRegex(p.ImportErrorSafe, 'NOT_FOUND'):
            p.inventory(self.zip)

    def test_output_inside_git_blocked(self):
        repo = self.home / 'repo'
        (repo / '.git').mkdir(parents=True)
        with self.assertRaisesRegex(p.ImportErrorSafe, 'GIT_REPOSITORY'):
            p.make_private_capsule(self.zip, ['abc-123'], repo / 'private.json', consent=True)

    def test_no_json_content(self):
        with zipfile.ZipFile(self.zip, 'w') as z:
            z.writestr('conversations.json', 'not-json')
        with self.assertRaisesRegex(p.ImportErrorSafe, 'INVALID_CONVERSATIONS_JSON'):
            p.inventory(self.zip)

    def test_root_large_compression_ratio_rejected(self):
        with zipfile.ZipFile(self.zip, 'w', compression=zipfile.ZIP_DEFLATED) as z:
            z.writestr('conversations.json', ' '*100_000)
        with self.assertRaisesRegex(p.ImportErrorSafe, 'SUSPICIOUS_COMPRESSION_RATIO'):
            p.inventory(self.zip)

    def test_skip_nontext_content(self):
        c = conversation()
        c['mapping']['b']['message']['content']['parts'] = [{'asset_pointer': 'secret'}]
        self.assertEqual(len(p.visible_history(c)),2)

    def test_no_unselected_history_in_capsule(self):
        c = conversation()
        c['id'] = 'another'
        c['mapping']['a']['message']['content']['parts'] = ['EXTRA CONVERSATION PRIVATE']
        with zipfile.ZipFile(self.zip, 'w') as z:
            z.writestr('conversations.json', json.dumps([conversation(),c]))
        out = self.home / 'capsule.json'
        p.make_private_capsule(self.zip, ['abc-123'], out, consent=True)
        self.assertNotIn('EXTRA CONVERSATION PRIVATE',out.read_text())

if __name__ == '__main__':
    unittest.main()
