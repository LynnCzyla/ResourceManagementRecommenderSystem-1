"""
Unit tests for the alias/synonym true-equivalence logic in module2_nlp.py.

Run with:
    python -m pytest test_alias_equivalence.py -v
or:
    python test_alias_equivalence.py

Requires the real project environment (spaCy model + modules/ package)
since it exercises the real NLPProcessor, including real spaCy semantic
similarity — that's the point: these are the same code paths production
uses. If you're running this somewhere without Supabase configured,
the NLPProcessor will still load fine (it just fetches an empty skill set).
"""
import sys
import unittest
from pathlib import Path

PYTHON_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PYTHON_DIR))

from module2_nlp import NLPProcessor


class TestAliasEquivalence(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.nlp = NLPProcessor()

    def _assert_alias(self, skill1, skill2):
        accepted, category, reasons, sig = self.nlp._evaluate_equivalence(skill1, skill2)
        self.assertTrue(
            accepted,
            f"Expected \"{skill1}\" <-> \"{skill2}\" to be ACCEPTED as a true alias, "
            f"but got category={category}, reasons={reasons}, signals={sig}"
        )

    def _assert_not_alias(self, skill1, skill2):
        accepted, category, reasons, sig = self.nlp._evaluate_equivalence(skill1, skill2)
        self.assertFalse(
            accepted,
            f"Expected \"{skill1}\" <-> \"{skill2}\" to be REJECTED (not a true alias), "
            f"but it was ACCEPTED. signals={sig}"
        )

    # ---- SHOULD ACCEPT ----

    def test_accepts_autocad_spacing_variant(self):
        self._assert_alias("AutoCAD", "Auto CAD")

    def test_accepts_near_equivalent_wording(self):
        self._assert_alias("technical report writing", "technical reporting")

    def test_accepts_singular_plural_variation(self):
        self._assert_alias("project manager", "project managers")

    def test_accepts_punctuation_case_variation(self):
        self._assert_alias("Microsoft Word", "microsoft-word")

    # ---- SHOULD REJECT ----

    def test_rejects_related_but_different_client_responsibilities(self):
        self._assert_not_alias(
            "client technical communication and support",
            "client relationship management",
        )

    def test_rejects_related_but_different_deliverables(self):
        self._assert_not_alias(
            "client technical communication and support",
            "project deliverables and technical reports",
        )

    def test_rejects_related_document_systems(self):
        self._assert_not_alias(
            "document management systems",
            "project filing and archiving systems",
        )

    def test_rejects_electrical_design_vs_engineering(self):
        self._assert_not_alias("electrical design", "electrical engineering")

    def test_rejects_project_management_vs_documentation_management(self):
        self._assert_not_alias("project management", "project documentation management")

    def test_is_true_alias_public_api_matches_internal_decision(self):
        # Sanity check that the public wrapper agrees with the internal one.
        self.assertTrue(self.nlp.is_true_alias("AutoCAD", "Auto CAD"))
        self.assertFalse(self.nlp.is_true_alias("electrical design", "electrical engineering"))


if __name__ == '__main__':
    unittest.main()