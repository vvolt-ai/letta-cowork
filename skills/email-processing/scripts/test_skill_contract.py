"""Static instruction compatibility checks, not live email/ERP/model validation."""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]


class ContractTests(unittest.TestCase):
    def setUp(self):
        self.main = (ROOT / 'SKILL.md').read_text()
        self.po = (ROOT / 'references/po-processing.md').read_text()
        self.company = (ROOT / 'references/company-and-doc-review.md').read_text()
        self.execution = (ROOT / 'references/approved-sales-execution.md').read_text()

    def test_current_company_docs_before_business_checks(self):
        self.assertLess(self.main.index('## Step 3'), self.main.index('## Step 4'))
        self.assertIn('Never assume current facts from old history', self.main)
        self.assertIn('Historical', self.execution)
        self.assertIn('read current', self.main.lower())
        self.assertIn('Matching domain', self.main)

    def test_configured_mcp_and_missing_scope(self):
        self.assertIn('enabled configured MCP', self.main)
        self.assertIn('no fallback business access', self.main)
        self.assertIn('currently discovered authorized connector schema', self.main)
        self.assertIn('Historical profile examples are not execution contracts', self.main)
        self.assertIn('no guessed record/method IDs', self.main)

    def test_email_draft_only_and_specific_authority(self):
        self.assertIn('never send, forward, schedule, queue', self.main)
        self.assertIn('even after approval', self.main)
        self.assertIn('exact approved scope', self.main)
        self.assertIn('never authorizes sending', (ROOT / 'references/approval-template.md').read_text())

    def test_no_legacy_executable_route_or_route_change_retry(self):
        for file in [ROOT / 'SKILL.md', *sorted((ROOT / 'references').glob('*.md'))]:
            text = file.read_text()
            self.assertNotRegex(text, r'https?://[^\s"`]+/odoo/')
            self.assertNotIn('A timeout is evidence to change route', text)
            self.assertNotIn('Use direct mounted Odoo tools only', text)
        self.assertIn('inspect outcome before retry', self.main)

    def test_customer_currency_and_coverage_gates(self):
        self.assertIn('verified customer, selling company and currency', self.po)
        self.assertIn('Amount alone is not identity', self.po)
        self.assertIn('limited page cannot establish complete exposure', self.po)
        self.assertIn('lookup leads only', self.execution)
        self.assertIn('denied lookup', self.company)

    def test_attachment_receipts_and_masked_identifier_boundary(self):
        self.assertIn('retrieval not attempted—usable identifiers unavailable', self.main)
        self.assertIn('Listing a filename is not a download', self.main)
        self.assertIn('a download is not an inspection', self.main)
        self.assertIn('never guess, unmask, reconstruct IDs', self.main)
        self.assertIn('one supported same-scope metadata refresh', self.main)
        self.assertIn('retain the task rather than switching', self.main)
        self.assertIn('attachment ledger', self.main)
        self.assertIn('attachmentRef', self.main)
        self.assertIn('only**', self.main)
        self.assertIn('Do not add channel/message/attachment/account/folder', self.main)
        self.assertIn('re-list the same authorized source', self.main)
        self.assertIn('they do not establish reader failure', (ROOT / 'references/approval-template.md').read_text())

    def test_company_reference_is_required_not_optional(self):
        self.assertIn('do not skip this reference', self.main)
        self.assertIn('including invoice, PO, quote', self.main)
        self.assertIn('Do not claim this step complete after only a partner/bill/PO lookup', self.main)
        self.assertIn('Do not claim this reference was followed unless it was actually read', self.company)

    def test_stored_company_read_contract_and_effective_report(self):
        for term in ['get_company_ai_report_sections', 'get_company_ai_context',
                     'company_ai_report_combined_md', 'company_ai_report_md']:
            self.assertIn(term, self.company)
        self.assertIn('old snapshot, not the current section assembly', self.company)
        self.assertIn('exact key returned', self.company)
        self.assertIn('contact-specific and commercial-company attribution separate', self.company)

    def test_instructions_provenance_and_live_fact_separation(self):
        self.assertIn('agent_instructions', self.company)
        self.assertIn('explicitly human-maintained instructions from generated recommendations', self.company)
        self.assertIn('not fresh operational evidence', self.company)
        self.assertIn('Mail metadata in a packet does not replace live email bodies', self.company)
        self.assertIn('provenance/approval limits', self.company)

    def test_no_report_generation_as_email_side_effect(self):
        self.assertIn('Never generate/refresh reports', self.company)
        self.assertIn('create embeddings or invoke setters', self.company)
        self.assertIn('A missing report is not an instruction to build one', self.company)
        self.assertNotIn('set_company_ai_report_section(', self.company)
        self.assertIn('include_existing_report=false', self.company)
        self.assertIn('Never enumerate every child contact', self.company)

    def test_missing_report_not_denial_and_receipt_distinctions(self):
        self.assertIn('Missing methods/fields, denied access and signature errors are different', self.company)
        self.assertIn('An empty catalog may coexist', self.company)
        self.assertIn('Catalog listing is not body inspection', self.company)
        approval = (ROOT / 'references/approval-template.md').read_text()
        self.assertIn('catalog read/empty/not attempted/denied/failed', approval)
        self.assertIn('not a completed stored-company review', approval)
        self.assertIn('blocks only work that actually depends on its contents', self.company)

    def test_configured_only_routing_and_version(self):
        self.assertIn('version: "1.3.2"', self.main)
        for text in (self.main, self.company):
            self.assertIn('VeraMcpListTools and VeraMcpCallTool', text)
            self.assertNotIn('Prefer direct mounted Odoo reads when available', text)
            self.assertNotIn('Use direct mounted Odoo read/search/count/group tools when available', text)
        self.assertIn('actual JSON-string versus array/object argument types', self.company)

    def test_attention_scope_and_resolution(self):
        attention = (ROOT / 'references/attention-and-status.md').read_text()
        for term in ['Routine', 'Action required', 'Urgent', 'Awaiting approval',
                     'Waiting externally', 'technical-review', 'commercial-review',
                     'financial-exception', 'security-review', 'unassigned']:
            self.assertIn(term, attention)
        self.assertIn('does not authorize tagging', attention)
        self.assertIn('Do not automatically remove a resolved tag without authorization', attention)
        self.assertIn('A draft is not a sent request', attention)
        self.assertIn('expected, issued, received', attention)
        self.assertIn('Being copied is not ownership', attention)

    def test_thread_customer_response_and_scenario_contract(self):
        approval = (ROOT / 'references/approval-template.md').read_text()
        self.assertIn('incoming and sent thread', self.main)
        self.assertIn('current explicit retrieval policy', self.main)
        self.assertIn('writer and critic', approval)
        self.assertIn('no proposed controlled action', approval)
        self.assertIn('verified HTML font/signature/footer', approval)
        scenarios = (ROOT / 'references/validation-cases.md').read_text()
        self.assertGreaterEqual(scenarios.count('|'), 90)
        for term in ['Refund expected 100', 'Two quotations share a total',
                     'No configured Odoo connector', 'Customer asks to send',
                     'Two attachments', 'Bank details changed']:
            self.assertIn(term, scenarios)

    def test_triage_precedes_deep_processing(self):
        self.assertLess(self.main.index('## Step 0'), self.main.index('## Step 1'))
        self.assertIn('Ignore means no further analysis or interruption', self.main)
        self.assertIn('not deleting, archiving, marking read', self.main)
        self.assertIn('Skip this step for Ignore', self.main)
        triage = (ROOT / 'references/triage-and-follow-up.md').read_text()
        for term in ['Automated mail', 'immigration', 'Partial payment',
                     'Never follow suspect links', 'exact source', 'not active']:
            self.assertIn(term, triage)
        self.assertIn('configured lead time', self.main)
        self.assertIn('reference/atlas/lookup.md', self.main)
        self.assertIn('case specific operational recommendations', self.main)

    def test_operational_and_false_ignore_regressions(self):
        cases = (ROOT / 'references/validation-cases.md').read_text()
        for term in ['## Operational recommendation regression', 'Morgan',
                     '## Processing depth regressions', 'personal immigration',
                     'Refund completed', 'preview only', 'RMS', 'No contact']:
            self.assertIn(term, cases)
        approval = (ROOT / 'references/approval-template.md').read_text()
        self.assertIn('customer follow through', approval)
        self.assertIn('do not produce this summary', approval)

    def test_operational_role_frames_workflow(self):
        heading = '## Role: Operational Email Analyst and Executive Support Partner'
        self.assertLess(self.main.index(heading), self.main.index('## Step 0'))
        role = self.main.split(heading, 1)[1].split('## Non-negotiable boundaries', 1)[0]
        for term in ['Triage with judgment', 'Understand the actual need',
                     'Resolve the dependency', 'Atlas Agent Brief',
                     'named owner', 'expected result', 'CEO is copied',
                     'customer drafts', 'Advice is not delegation',
                     'Email remains draft only', 'grants no tools']:
            self.assertIn(term, role)

    def test_atlas_business_navigation_and_authority(self):
        atlas = (ROOT / 'references/atlas-business-routing.md').read_text()
        self.assertIn('## Atlas consultation trigger', self.main)
        self.assertIn('not just when the user explicitly asks who to contact', self.main)
        for term in ['AGENT_KERNEL_START', 'AGENT_KERNEL_END', 'observed-pattern',
                     'procedure', 'gap', 'Remote main verification failed',
                     'Email is draft only', 'configured Vera connector',
                     'not a duplicate process manual', 'Atlas is read only']:
            self.assertIn(term, atlas)
        for target in ['sales/README.md', 'order-fulfillment/README.md',
                       'procurement/README.md', 'manufacturing/README.md',
                       'quality/README.md', 'finance/README.md',
                       'engineering/README.md', 'trade/README.md']:
            self.assertIn(target, atlas)
        cases = (ROOT / 'references/validation-cases.md').read_text()
        self.assertIn('## Atlas business routing regressions', cases)
        self.assertIn('Public 404 is not repository absence', cases)
        self.assertIn('no Atlas reads', cases)

    def test_company_contract_matches_maintained_account_reference(self):
        source = ROOT.parent / 'analyzing-customer-accounts/references/odoo-company-context-rpc.md'
        if not source.is_file():
            self.skipTest('Cross-skill parity requires the canonical Skills checkout')
        contract = source.read_text()
        for term in ['get_company_ai_context', 'get_company_ai_report_sections',
                     'company_ai_report_combined_md', 'company_ai_report_md']:
            self.assertIn(term, contract)
            self.assertIn(term, self.company)

    def test_bundled_links_and_source_privacy(self):
        markdown = [ROOT / 'SKILL.md', *sorted((ROOT / 'references').glob('*.md'))]
        for file in markdown:
            text = file.read_text()
            self.assertNotRegex(text, r'/Users/|C:\\Users\\|Bearer\s+[A-Za-z0-9._-]{30,}')
            for target in re.findall(r'\[[^\]]+\]\(([^)]+)\)', text):
                if re.match(r'^[a-z]+:', target) or target.startswith('#'):
                    continue
                resolved = (file.parent / target.split('#')[0]).resolve()
                self.assertIn(ROOT, resolved.parents)
                self.assertTrue(resolved.is_file(), target)


if __name__ == '__main__':
    unittest.main()
