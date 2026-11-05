"""Synthetic offline tests; no customer documents or business systems."""
import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
SPEC = importlib.util.spec_from_file_location("extract_local_pdf", Path(__file__).with_name("extract_local_pdf.py"))
READER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(READER)


def fixture_pdf(text="Synthetic PO FIXTURE-123, 3 units"):
    escaped = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    stream = f"BT /F1 12 Tf 72 720 Td ({escaped}) Tj ET".encode("ascii")
    objects = [b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
               b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
               b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
               b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream"]
    pdf = b"%PDF-1.4\n"; offsets = [0]
    for i, obj in enumerate(objects, 1):
        offsets.append(len(pdf)); pdf += str(i).encode() + b" 0 obj\n" + obj + b"\nendobj\n"
    xref = len(pdf); pdf += b"xref\n0 6\n0000000000 65535 f \n"
    pdf += b"".join(f"{offset:010d} 00000 n \n".encode() for offset in offsets[1:])
    return pdf + f"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()


class Tests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.pdf = Path(self.tmp.name) / "file with spaces & text.pdf"
        self.pdf.write_bytes(fixture_pdf())

    def test_missing_and_wrong_type(self):
        self.assertEqual(READER.extract(self.pdf.with_suffix(".missing"))["reason"], "local_file_not_found")
        self.pdf.write_bytes(b"not a PDF")
        self.assertEqual(READER.extract(self.pdf)["reason"], "not_a_pdf")

    @patch.object(READER.shutil, "which", return_value="pdftotext")
    @patch.object(READER.subprocess, "run")
    def test_checksum_without_python311_file_digest(self, run, _):
        run.return_value = types.SimpleNamespace(returncode=0, stdout=b"Fixture page\f")
        with patch.object(READER.hashlib, "file_digest", side_effect=AssertionError("must not require Python 3.11"), create=True):
            result = READER.extract(self.pdf)
        self.assertTrue(result["complete"])
        self.assertEqual(result["sha256"], READER.hashlib.sha256(self.pdf.read_bytes()).hexdigest())

    def test_size_limit(self):
        self.assertEqual(READER.extract(self.pdf, max_bytes=1)["reason"], "input_size_limit")

    @patch.object(READER.shutil, "which", return_value="pdftotext")
    @patch.object(READER.subprocess, "run")
    def test_literal_path_all_pages_and_hash(self, run, _):
        run.return_value = types.SimpleNamespace(returncode=0, stdout=b"First page\fSecond page\f")
        result = READER.extract(self.pdf)
        self.assertTrue(result["complete"])
        self.assertEqual(result["pages"], 2)
        self.assertEqual(len(result["sha256"]), 64)
        self.assertEqual(run.call_args.args[0][-2], str(self.pdf.resolve()))
        self.assertNotIn("shell", run.call_args.kwargs)

    @patch.object(READER.shutil, "which", return_value="pdftotext")
    @patch.object(READER.subprocess, "run")
    def test_empty_page_and_truncation_are_not_complete(self, run, _):
        run.return_value = types.SimpleNamespace(returncode=0, stdout=b"First page\f\f")
        result = READER.extract(self.pdf, max_chars=10)
        self.assertFalse(result["complete"])
        self.assertEqual(result["empty_pages_requiring_visual_check"], [2])
        self.assertTrue(result["truncated"])

    @patch.object(READER.shutil, "which", return_value="pdftotext")
    @patch.object(READER.subprocess, "run")
    def test_reader_failure_and_timeout(self, run, _):
        run.return_value = types.SimpleNamespace(returncode=1, stdout=b"")
        self.assertEqual(READER.extract(self.pdf)["status"], "blocked")
        run.side_effect = subprocess.TimeoutExpired("pdftotext", 30)
        self.assertEqual(READER.extract(self.pdf)["reason"], "local_reader_timeout")

    @patch.object(READER.shutil, "which", return_value=None)
    @patch.object(READER.importlib, "import_module", side_effect=ImportError)
    def test_no_reader_does_not_install_or_network(self, _, __):
        self.assertIn("no_installed_local_reader", READER.extract(self.pdf)["reason"])

    @patch.object(READER.shutil, "which", return_value=None)
    def test_actual_installed_pypdf_reads_fixture(self, _):
        if importlib.util.find_spec("pypdf") is None:
            self.skipTest("Optional installed reader absent")
        result = READER.extract(self.pdf)
        self.assertTrue(result["complete"])
        self.assertIn("FIXTURE-123", result["text"])


if __name__ == "__main__":
    unittest.main()
