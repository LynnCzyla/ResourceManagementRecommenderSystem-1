import unittest
from modules.module2_nlp import NLPProcessor

class TestWEAAliases(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.nlp = NLPProcessor()

    def _assert_alias(self, skill1, skill2):
        accepted, category, reasons, sig = self.nlp._evaluate_equivalence(skill1, skill2)
        print(f"\n[PASS] {skill1} <-> {skill2}\nExpected: ACCEPT\nActual: {'ACCEPT' if accepted else 'REJECT'}\nSimilarity: {sig.get('similarity', 'N/A')}\nReasons: {reasons}")
        self.assertTrue(accepted)

    def _assert_not_alias(self, skill1, skill2):
        accepted, category, reasons, sig = self.nlp._evaluate_equivalence(skill1, skill2)
        print(f"\n[PASS] {skill1} <-> {skill2}\nExpected: REJECT\nActual: {'ACCEPT' if accepted else 'REJECT'}\nSimilarity: {sig.get('similarity', 'N/A')}\nReasons: {reasons}")
        self.assertFalse(accepted)

    def test_expected_accept_cases(self):
        cases = [
            ("AutoCAD", "Auto CAD"),
            ("Microsoft Word", "microsoft-word"),
            ("Microsoft PowerPoint", "Microsoft Power Point"),
            ("Project Manager", "Project Managers"),
            ("Technical Report Writing", "Technical Reporting"),
        ]
        for skill1, skill2 in cases:
            with self.subTest(skill1=skill1, skill2=skill2):
                self._assert_alias(skill1, skill2)

    def test_expected_reject_cases(self):
        cases = [
            ("Electrical Design", "Electrical Engineering"),
            ("Project Management", "Project Documentation Management"),
            ("Technical Sales", "Technical Sales Engineering"),
            ("AutoCAD 2D", "AutoCAD 3D"),
            ("Client Technical Communication and Support", "Client Relationship Management"),
            ("Document Management Systems", "Project Filing and Archiving Systems"),
            ("Project Coordination", "Industrial Project Coordination"),
        ]
        for skill1, skill2 in cases:
            with self.subTest(skill1=skill1, skill2=skill2):
                self._assert_not_alias(skill1, skill2)

    def test_review_cases(self):
        cases = [
            ("Electrical Design", "Electrical Design Engineering"),
            ("Industrial Electrical Design", "Electrical Design"),
            ("Project Management", "Project Manager"),
            ("Power Distribution", "Electrical Power Distribution"),
            ("UPS Systems", "Uninterruptible Power Supply Systems"),
            ("Technical Documentation", "Technical Document Management"),
            ("Value Engineering", "Cost Optimization"),
            ("Client Requirements Analysis", "Analyzing Client Requirements"),
        ]
        for skill1, skill2 in cases:
            with self.subTest(skill1=skill1, skill2=skill2):
                accepted, category, reasons, sig = self.nlp._evaluate_equivalence(skill1, skill2)
                print(f"\n[REVIEW] {skill1} <-> {skill2}\nActual: {'ACCEPT' if accepted else 'REJECT'}\nSimilarity: {sig.get('similarity', 'N/A')}\nReasons: {reasons}")

if __name__ == '__main__':
    unittest.main()