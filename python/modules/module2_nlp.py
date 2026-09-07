"""
🤖 Module 2: Natural Language Processing (100% Dynamic)
NO hardcoded lists - learns everything from documents
"""
import spacy
import re
import json
import os
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime
from difflib import SequenceMatcher
import hashlib
from pathlib import Path
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.cluster import KMeans
from sklearn.metrics.pairwise import cosine_similarity
from modules.skill_classifier import SkillClassifier
from modules.supabase_client import supabase

# ============ FIX: connectors that should never lead a skill phrase ============
LEADING_CONNECTORS = ('and', 'of', 'for', 'with', 'to', 'in', 'on', 'at')

# ============ FALLBACK (Layer 3) SAFETY CONSTANTS ============
# Used only when the ML classifier is unavailable/untrained/errors - see
# _is_likely_skill()'s Layer 3. Not used at all when ML is active, so these
# never touch the ML thresholds or the KB layer.
FRAGMENT_CONNECTORS = {
    'while', 'with', 'and', 'for', 'the', 'of', 'to', 'in', 'on', 'by',
    'from', 'that', 'this', 'are', 'is', 'as', 'a', 'an'
}
JOB_TITLE_ROLE_NOUNS = {
    'drafter', 'designer', 'engineer', 'manager', 'director', 'supervisor',
    'technician', 'analyst', 'coordinator', 'specialist', 'officer',
    'administrator', 'architect', 'consultant', 'developer'
}

# ============ ALIAS / SYNONYM EQUIVALENCE THRESHOLDS ============
# These control _should_merge() / is_true_alias() — the decision of whether
# two skill phrases are the SAME skill (safe to alias) vs merely
# semantically RELATED (must never be aliased). They are intentionally
# stricter than plain semantic similarity; see is_true_alias() docstring
# for the reasoning. Tune based on the [ALIAS] ACCEPTED/REJECTED log lines
# you see in production — never lower ALIAS_MIN_SEMANTIC_SIMILARITY below
# ~0.80, that floor is what stops two merely-related phrases with
# coincidental lexical overlap from being merged.
ALIAS_FUZZY_TOKEN_MATCH_THRESHOLD = 0.72        # difflib ratio for two tokens to count as "the same word" (handles report/reporting, plural/singular, minor typos)
ALIAS_MEANINGFUL_OVERLAP_THRESHOLD = 0.65       # fraction of tokens (fuzzy-matched) that must line up between the two phrases
ALIAS_CORE_OVERLAP_THRESHOLD = 0.50             # fraction of *non-generic* tokens that must line up
ALIAS_EXTRA_TOKEN_RELATEDNESS_THRESHOLD = 0.55  # how related a single leftover/unmatched token must be to not count as "a new concept"
ALIAS_MIN_SEMANTIC_SIMILARITY = 0.80            # hard floor for spaCy similarity — dynamic learning may only raise this, never lower it (see _get_merge_threshold)

# Dynamic (corpus-derived) "generic word" detection — words like
# "management"/"support"/"technical" that show up across many unrelated
# skills and therefore carry little distinguishing meaning on their own.
# This is computed from self.learned_skills at runtime (see
# _get_generic_terms), NOT a hardcoded skill/word list, so it stays true
# to the "100% dynamic" design of this module.
GENERIC_TERM_MIN_SKILLS = 15      # don't trust corpus-based generic detection until we've learned at least this many skills
GENERIC_TERM_DOC_FREQ_RATIO = 0.12  # a token appearing in >=12% of learned skills is a candidate generic term...
GENERIC_TERM_MIN_COUNT = 4          # ...provided it also appears in at least this many distinct skills (avoids noise at small corpus sizes)

# ============ SUPABASE FACTS CACHE ============
# Each PDF upload spawns a brand-new Python process (see pythonService.js's
# spawn() call), so an in-memory cache alone is useless — the process, and
# everything in it, is gone before the next upload starts. To avoid
# re-downloading the full skills + skill_aliases + feedback_training tables
# on every single upload, we snapshot them to a small local JSON file and
# reuse that snapshot for FACTS_CACHE_TTL_SECONDS before hitting Supabase
# again. Any new skill/alias/feedback write invalidates the cache immediately
# so freshly-approved data is never stale for longer than one write.
FACTS_CACHE_TTL_SECONDS = 600  # 10 minutes


class NLPProcessor:
    """100% Dynamic NLP - Learns everything from documents"""

    # ============ DUPLICATE-WORK DIAGNOSTICS (process-lifetime counters) ============
    # Pure instrumentation, added to answer "how many times was NLPProcessor
    # constructed / merge_synonyms_dynamically() invoked in this process, and
    # by whom" without changing any behavior. Reset to 0 each time a fresh
    # Python process starts (each document upload spawns a new process), so
    # these counts are always scoped to a single request.
    _instance_count = 0
    _merge_invocation_count = 0
    # ================================================================================

    def __init__(self, model_name='en_core_web_md', skill_db_path=None):
        """Initialize with empty learning - everything learned from data"""

        NLPProcessor._instance_count += 1
        print(f"[NLP-INIT-DIAG] NLPProcessor instance #{NLPProcessor._instance_count} "
              f"being constructed (pid={os.getpid()})", file=sys.stderr)

        # Not cleared between merges - lets merge_synonyms_dynamically() report
        # whether the skill set actually changed since the last time it ran.
        self._last_merge_skillset_signature = None

        # Load spaCy model
        try:
            self.nlp = spacy.load(model_name)
        except OSError:
            print(f"[NLP] Model {model_name} not found. Downloading...")
            spacy.cli.download(model_name)
            self.nlp = spacy.load(model_name)
        
        # ============ STRUCTURAL PATTERNS ONLY ============
        # These are for finding specific data types, NOT skills
        self.prc_pattern = re.compile(r'\bPRC\s*[\#]?\s*(\d{7})\b', re.IGNORECASE)
        self.email_pattern = re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b')
        self.phone_pattern = re.compile(r'\b\d{4}\s*\d{3}\s*\d{4}\b|\b\d{3}-\d{4}\b')
        
        # ============ PURELY DYNAMIC - EMPTY INITIAL ============
        self.skill_db_path = skill_db_path or self._get_default_db_path()
        
        # All data structures start empty
        self.skill_dictionary = {}          # skill -> category (learned)
        self.skill_categories = {}          # category -> list of skills (learned)
        self.learned_skills = set()         # All learned skills (includes aliases)
        
        # Alias structures (NEW)
        self.skill_aliases = {}              # master -> [aliases]
        self.alias_lookup = {}               # alias -> master
        
        # Learning statistics - grows with data
        self.word_frequency = Counter()      # All words in documents
        self.phrase_frequency = Counter()    # All phrases in documents
        self.skill_candidates = Counter()    # Words that appear in skill contexts
        
        # Skill patterns learned from data
        self.skill_patterns = Counter()      # Patterns that indicate skills
        self.non_skill_patterns = Counter()  # Patterns that indicate non-skills
        
        # Document corpus for learning
        self.doc_texts = []                  # Recent document texts
        self.doc_skills = []                 # Skills extracted from each doc
        self.max_docs = 50                   # Keep last 50 docs for learning
        
        # Dynamic learning structures
        self.learned_sections = {}           # Section names learned from documents
        self.type_thresholds = {}            # Merge thresholds learned from data
        self.skill_importance = {}           # Importance scores learned from feedback
        self.merge_history = []              # History of merge decisions
        self.feedback_log = {}               # User feedback log

        # ============ MERGE-RUN PERFORMANCE CACHES ============
        # merge_synonyms_dynamically() naively compares every skill pair
        # (O(n^2)): at ~233 learned skills that's ~27k pairs. The dominant
        # cost was never the O(n^2) Python loop itself — it was calling the
        # spaCy pipeline (self.nlp(...)) TWICE per pair with no caching, so
        # the same skill text got re-parsed by spaCy up to n-1 times. These
        # caches make every per-skill computation (normalization, tokens,
        # spaCy doc/vector, learned type, learned importance) happen at most
        # ONCE per skill for the lifetime of this process, no matter how
        # many pairs that skill is compared against. They are pure functions
        # of (skill text, self.doc_texts/self.skill_dictionary), so it's
        # safe to keep them warm across multiple merge runs; call
        # _clear_merge_run_caches() if doc_texts/skill_dictionary changed
        # and you need a guaranteed-fresh recompute.
        self._skill_cache = {}               # skill -> {norm, nospace, tokens, token_set}
        self._nlp_doc_cache = {}             # skill -> spaCy Doc (or None on failure)
        self._skill_type_cache = {}          # skill -> learned type string
        self._skill_importance_cache = {}    # skill -> learned importance float
        self.last_merge_stats = {}           # diagnostics from the most recent merge_synonyms_dynamically() run
        self._merge_history_load_attempted = False  # avoids re-reading skill_db_path on every pair when merge_history starts empty
        
        self.classifier = SkillClassifier()
        # ============ SMART ML ACTIVATION ============
        # FIX: self.use_ml was previously only ever assigned when
        # self.classifier.is_trained was True - with no else branch, so on
        # a fresh deployment (no skill_classifier.pkl yet, nothing to train
        # on), self.use_ml was never set at all and the first read of it
        # anywhere (e.g. `if self.use_ml:` in _is_likely_skill, or
        # runner.py logging self.nlp.use_ml right after construction)
        # raised AttributeError. Defaulting to False here is behavior-
        # neutral for every case that worked before (is_trained True still
        # sets True) and only changes the previously-broken untrained case
        # from a crash into the same "no ML available" state _is_likely_skill
        # already handles via its self.use_ml check.
        self.use_ml = bool(self.classifier.is_trained)
        # Try to get accuracy from model file
        try:
            with open(self.classifier.model_path, 'rb') as f:
                import pickle
                data = pickle.load(f)
                accuracy = data.get('training_stats', {}).get('accuracy', 0)
                print(f"[NLP]  ML Classifier is ACTIVE!")
                print(f"[NLP]    Trained on {self.classifier.training_stats.get('total_samples', 0)} samples")
                print(f"[NLP]    Accuracy: {accuracy:.2%}")
        except:
            print(f"[NLP]  ML Classifier is ACTIVE!")
            print(f"[NLP]    Trained on {self.classifier.training_stats.get('total_samples', 0)} samples")
            # ==============================================
        
        # ============ DYNAMIC REJECTION LEARNING ============
        self.rejected_phrases = defaultdict(int)      # phrase -> rejection count
        self.rejected_single_words = defaultdict(int) # word -> rejection count
        self.rejected_names = defaultdict(int)        # name -> rejection count
        self.rejected_fragments = defaultdict(int)    # fragment -> rejection count
        self.learned_skill_keywords = set()           # learned from approved skills
        # ===================================================
        
        # Stats
        self.stats = {
            'total_processed': 0,
            'total_skills_extracted': 0,
            'total_licenses_found': 0,
            'new_skills_learned': 0,
            'new_categories_created': 0,
            'documents_analyzed': 0
        }
        
        # Load existing learning or start empty
        self._load_data()
        
        print(f"[NLP] 100% Dynamic NLP initialized")
        print(f"[NLP] Learned {len(self.skill_dictionary)} skills from {self.stats['documents_analyzed']} documents")
        print(f"[NLP] Discovered {len(self.skill_categories)} categories")
        print(f"[NLP] Alias groups: {len(self.skill_aliases)}")
    
    def _get_default_db_path(self):
        """Get path for learning database"""
        base_dir = Path(__file__).parent.parent.parent
        skill_dir = base_dir / 'shared-data' / 'skills_db'
        skill_dir.mkdir(parents=True, exist_ok=True)
        return skill_dir / 'learned_skills.json'
    
    def _load_data(self):
        """
        Load facts (skills, categories, aliases, feedback) from Supabase —
        this is the system of record now, not the JSON file.
        Ephemeral learning state (word frequencies, thresholds, merge
        history) still loads from the local JSON cache.
        """
        if not hasattr(self, 'stats'):
            self.stats = {
                'total_processed': 0,
                'total_skills_extracted': 0,
                'total_licenses_found': 0,
                'new_skills_learned': 0,
                'new_categories_created': 0,
                'documents_analyzed': 0
            }

        # ============ LOAD FACTS (skills/categories/aliases/feedback) ============
        # Cache-first: reuse the local snapshot if it's still fresh, only
        # hit Supabase when it's missing/expired. See FACTS_CACHE_TTL_SECONDS.
        facts_cache_path = self._get_facts_cache_path()
        facts = self._load_facts_from_cache(facts_cache_path)

        if facts is None:
            facts = self._fetch_facts_from_supabase()
            if facts is not None:
                self._save_facts_cache(facts_cache_path, facts)

        if facts is not None:
            self._apply_facts(facts)
        else:
            print("[NLP] No facts available (Supabase unreachable and no local cache) — skills/feedback start empty")
        # =====================================================

        # ============ LOAD EPHEMERAL STATE FROM LOCAL JSON ============
        if os.path.exists(self.skill_db_path):
            try:
                with open(self.skill_db_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)

                    loaded_wf = data.get('word_frequency', {})
                    for word, count in loaded_wf.items():
                        self.word_frequency[word] += count

                    loaded_pf = data.get('phrase_frequency', {})
                    for phrase, count in loaded_pf.items():
                        self.phrase_frequency[phrase] += count

                    loaded_sc = data.get('skill_candidates', {})
                    for word, count in loaded_sc.items():
                        self.skill_candidates[word] += count

                    loaded_sp = data.get('skill_patterns', {})
                    for word, count in loaded_sp.items():
                        self.skill_patterns[word] += count

                    loaded_nsp = data.get('non_skill_patterns', {})
                    for word, count in loaded_nsp.items():
                        self.non_skill_patterns[word] += count

                    loaded_history = data.get('merge_history', [])
                    if loaded_history:
                        existing_entries = {(h.get('skill1'), h.get('skill2')): h for h in self.merge_history}
                        for entry in loaded_history:
                            key = (entry.get('skill1'), entry.get('skill2'))
                            if key not in existing_entries:
                                self.merge_history.append(entry)
                                existing_entries[key] = entry

                    loaded_sections = data.get('learned_sections', {})
                    for section, count in loaded_sections.items():
                        self.learned_sections[section] = self.learned_sections.get(section, 0) + count

                    loaded_thresholds = data.get('type_thresholds', {})
                    for key, value in loaded_thresholds.items():
                        self.type_thresholds[key] = value

                    self.stats['documents_analyzed'] = data.get('documents_analyzed', 0)
                    print(f"[NLP] Loaded ephemeral state: {self.stats['documents_analyzed']} docs analyzed, "
                          f"{len(self.merge_history)} merge history entries")
            except Exception as e:
                print(f"[NLP] Error loading ephemeral JSON: {e}")
        else:
            print("[NLP] No local ephemeral cache yet — starting fresh")
        # ==================================================================
    
    # ---------------- Supabase facts cache helpers ----------------

    def _get_facts_cache_path(self):
        """Local snapshot of the skills/skill_aliases/feedback_training
        tables, shared by every short-lived Python process."""
        base_dir = Path(__file__).parent.parent.parent
        cache_dir = base_dir / 'shared-data' / 'skills_db'
        cache_dir.mkdir(parents=True, exist_ok=True)
        return cache_dir / 'supabase_facts_cache.json'

    def _load_facts_from_cache(self, cache_path):
        """Return the cached facts dict if present and younger than
        FACTS_CACHE_TTL_SECONDS, else None (meaning: go fetch from Supabase)."""
        if not os.path.exists(cache_path):
            return None
        try:
            with open(cache_path, 'r', encoding='utf-8') as f:
                facts = json.load(f)
            fetched_at = datetime.fromisoformat(facts.get('fetched_at'))
            age = (datetime.now() - fetched_at).total_seconds()
            if age > FACTS_CACHE_TTL_SECONDS:
                print(f"[NLP] Facts cache is {int(age)}s old (> {FACTS_CACHE_TTL_SECONDS}s) — refreshing from Supabase")
                return None
            print(f"[NLP] Using cached facts ({int(age)}s old, no Supabase call): "
                  f"{len(facts.get('skills', []))} skills, {len(facts.get('aliases', []))} aliases, "
                  f"{len(facts.get('feedback', []))} feedback rows")
            return facts
        except Exception as e:
            print(f"[NLP] Could not read facts cache, will refetch: {e}")
            return None

    def _fetch_facts_from_supabase(self):
        """Pull skills/aliases/feedback fresh from Supabase. Only ONE query
        against skill_aliases now — previously the table was queried twice
        (a complex joined query whose result was never actually used, plus
        the simple query that was). The unused query was pure wasted egress."""
        try:
            client = supabase.get_client()
            if not client:
                print("[NLP] Supabase client not available — skills/feedback start empty")
                return None

            # 1. Skills
            # NOTE: the live `skills` table has NO `category` column (confirmed
            # via a live 42703 "column does not exist" Postgrest error) — do
            # NOT select/upsert 'category' against Supabase anywhere. Category
            # is tracked in-memory only (self.skill_dictionary), never synced
            # to the `skills` table itself.
            skills_resp = client.table('skills').select('id, skill_name').execute()
            id_to_name = {row['id']: row['skill_name'].lower() for row in skills_resp.data}

            # 2. Aliases — fetch ALL rows in pages to avoid Supabase's 1000-row limit
            alias_rows = []
            page_size = 1000
            offset = 0

            while True:
                response = (
                    client.table('skill_aliases')
                    .select('master_skill_id, alias_skill_id')
                    .range(offset, offset + page_size - 1)
                    .execute()
                )

                page = response.data or []
                alias_rows.extend(page)

                if len(page) < page_size:
                    break

                offset += page_size

            # 3. Feedback (approved/rejected) — drives rejection filters
            feedback_resp = client.table('feedback_training').select('phrase, label').execute()

            facts = {
                'fetched_at': datetime.now().isoformat(),
                'skills': [
                    {'name': row['skill_name'], 'category': 'Other'}
                    for row in skills_resp.data
                ],
                'aliases': [
                    {'master': id_to_name.get(row['master_skill_id']), 'alias': id_to_name.get(row['alias_skill_id'])}
                    for row in alias_rows
                    if id_to_name.get(row['master_skill_id']) and id_to_name.get(row['alias_skill_id'])
                ],
                'feedback': [
                    {'phrase': row['phrase'], 'label': row['label']}
                    for row in feedback_resp.data
                ],
            }
            print(f"[NLP] Fetched FRESH facts from Supabase: {len(facts['skills'])} skills, "
                  f"{len(facts['aliases'])} aliases, {len(facts['feedback'])} feedback rows")
            return facts
        except Exception as e:
            print(f"[NLP] Error loading from Supabase: {e}")
            return None

    def _save_facts_cache(self, cache_path, facts):
        """Write the facts snapshot to disk so the next process (next
        upload) can reuse it instead of hitting Supabase again."""
        try:
            with open(cache_path, 'w', encoding='utf-8') as f:
                json.dump(facts, f, ensure_ascii=False)
        except Exception as e:
            print(f"[NLP] Could not write facts cache: {e}")

    def _invalidate_facts_cache(self):
        """Delete the local snapshot so the very next process refetches
        fresh from Supabase. Called right after any write (new skill, new
        alias, new feedback) so approvals/rejections are never stale for
        longer than a single write — same freshness guarantee as before,
        just without re-downloading on every read."""
        try:
            cache_path = self._get_facts_cache_path()
            if os.path.exists(cache_path):
                os.remove(cache_path)
        except Exception as e:
            print(f"[NLP] Could not invalidate facts cache: {e}")

    def _apply_facts(self, facts):
        """Populate in-memory skill/alias/feedback structures from a facts
        dict, whether it came fresh from Supabase or from the local cache."""
        for row in facts.get('skills', []):
            name = row['name'].lower()
            self.learned_skills.add(name)
            category = row.get('category') or 'Other'
            self.skill_dictionary[name] = category
            self.skill_categories.setdefault(category, [])
            if name not in self.skill_categories[category]:
                self.skill_categories[category].append(name)

        for row in facts.get('aliases', []):
            master = row.get('master')
            alias = row.get('alias')
            if master and alias:
                self.skill_aliases.setdefault(master, [])
                if alias not in self.skill_aliases[master]:
                    self.skill_aliases[master].append(alias)
                self.alias_lookup[alias] = master

        for row in facts.get('feedback', []):
            phrase = row['phrase'].lower()
            words = phrase.split()
            if row['label'] == 'Skill':
                # Approved training examples must also enter the knowledge
                # base, otherwise _is_likely_skill() will never hit its
                # auto-approve branch for them.
                self.learned_skills.add(phrase)
                self.skill_dictionary.setdefault(phrase, 'Other')
                self.skill_categories.setdefault('Other', [])
                if phrase not in self.skill_categories['Other']:
                    self.skill_categories['Other'].append(phrase)

                self.feedback_log.setdefault('approved', [])
                if row['phrase'] not in self.feedback_log['approved']:
                    self.feedback_log['approved'].append(row['phrase'])
                for w in words:
                    if len(w) > 3:
                        self.learned_skill_keywords.add(w)
            else:
                self.feedback_log.setdefault('rejected', [])
                if row['phrase'] not in self.feedback_log['rejected']:
                    self.feedback_log['rejected'].append(row['phrase'])
                self.rejected_phrases[phrase] += 1
                if len(words) == 1:
                    self.rejected_single_words[phrase] += 1

        print(f"[NLP] Facts applied: {len(self.learned_skills)} skills, "
              f"{len(self.skill_aliases)} alias groups, "
              f"{len(self.feedback_log.get('approved', []))} approved / "
              f"{len(self.feedback_log.get('rejected', []))} rejected feedback rows")

    def _save_data(self):
            """Save ephemeral learning state locally. Facts (skills, aliases,
            feedback) are written to Supabase at the point they're created —
            see _save_skill_to_db / _save_alias_to_db / learn_from_feedback."""
            return self._save_ephemeral_json()
    
    def _save_ephemeral_json(self):
        """
        Save only the disposable learning state locally: word/phrase
        frequencies, skill/non-skill pattern counters, merge history,
        learned section names, and merge thresholds. None of this is a
        source of truth — if lost, it simply re-learns as more documents
        are processed. Facts (skills, aliases, feedback) live in Supabase.
        """
        try:
            existing_data = {}
            if os.path.exists(self.skill_db_path):
                try:
                    with open(self.skill_db_path, 'r', encoding='utf-8') as f:
                        existing_data = json.load(f)
                except Exception as e:
                    print(f"[NLP] Could not load existing ephemeral data: {e}")

            def merge_counter(existing, current, limit=1000):
                merged = dict(existing)
                for key, value in current.items():
                    merged[key] = merged.get(key, 0) + value
                sorted_items = sorted(merged.items(), key=lambda x: x[1], reverse=True)
                return dict(sorted_items[:limit])

            merged_word_freq = merge_counter(existing_data.get('word_frequency', {}), dict(self.word_frequency), 1000)
            merged_phrase_freq = merge_counter(existing_data.get('phrase_frequency', {}), dict(self.phrase_frequency), 500)
            merged_skill_candidates = merge_counter(existing_data.get('skill_candidates', {}), dict(self.skill_candidates), 100)
            merged_skill_patterns = merge_counter(existing_data.get('skill_patterns', {}), dict(self.skill_patterns), 50)
            merged_non_skill_patterns = merge_counter(existing_data.get('non_skill_patterns', {}), dict(self.non_skill_patterns), 50)

            existing_history = existing_data.get('merge_history', [])
            existing_entries = {(h.get('skill1'), h.get('skill2')): h for h in existing_history}
            merged_history = existing_history.copy()
            for entry in (self.merge_history or []):
                key = (entry.get('skill1'), entry.get('skill2'))
                if key not in existing_entries:
                    merged_history.append(entry)
                    existing_entries[key] = entry

            existing_sections = existing_data.get('learned_sections', {})
            merged_sections = {**existing_sections}
            for section, count in self.learned_sections.items():
                merged_sections[section] = merged_sections.get(section, 0) + count

            merged_thresholds = {**existing_data.get('type_thresholds', {}), **self.type_thresholds}

            data = {
                'word_frequency': merged_word_freq,
                'phrase_frequency': merged_phrase_freq,
                'skill_candidates': merged_skill_candidates,
                'skill_patterns': merged_skill_patterns,
                'non_skill_patterns': merged_non_skill_patterns,
                'merge_history': merged_history[-1000:] if merged_history else [],
                'learned_sections': merged_sections,
                'type_thresholds': merged_thresholds,
                'documents_analyzed': max(existing_data.get('documents_analyzed', 0), self.stats['documents_analyzed']),
                'last_updated': datetime.now().isoformat(),
            }

            if os.path.exists(self.skill_db_path):
                backup_path = f"{self.skill_db_path}.backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
                import shutil
                shutil.copy2(self.skill_db_path, backup_path)

                import glob
                backup_dir = os.path.dirname(self.skill_db_path)
                base_name = os.path.basename(self.skill_db_path)
                all_backups = sorted(
                    glob.glob(os.path.join(backup_dir, f"{base_name}.backup_*")),
                    key=os.path.getmtime, reverse=True
                )
                for old_backup in all_backups[5:]:
                    try:
                        os.remove(old_backup)
                    except Exception:
                        pass

            with open(self.skill_db_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)

            print(f"[NLP] Saved ephemeral state ({len(merged_word_freq)} words, "
                  f"{len(merged_history)} merge entries)")
            return True
        except Exception as e:
            print(f"[NLP] Error saving ephemeral state: {e}")
            import traceback
            traceback.print_exc()
            return False

    # ============ NEW: DB WRITE HELPERS ============

    def _get_or_create_skill_id(self, skill_name, category='Other'):
        """Upsert a skill into Supabase and return its id.
        NOTE: the live `skills` table has no `category` column (confirmed via
        a live Postgrest 42703 error), so `category` is NOT sent to Supabase
        here — it's accepted as a param only so callers don't need to change,
        and is tracked purely in-memory (self.skill_dictionary) instead."""
        client = supabase.get_client()
        if not client:
            return None
        try:
            result = client.table('skills').upsert(
                {'skill_name': skill_name},
                on_conflict='skill_name'
            ).execute()
            return result.data[0]['id'] if result.data else None
        except Exception as e:
            print(f"[NLP] Error upserting skill '{skill_name}': {e}")
            return None

    def _save_skill_to_db(self, skill_name, category='Other'):
        """Persist a single skill fact to Supabase."""
        try:
            result = self._get_or_create_skill_id(skill_name, category)
            self._invalidate_facts_cache()
            return result
        except Exception as e:
            print(f"[NLP] Error saving skill '{skill_name}' to DB: {e}")
            return None

    def _save_alias_to_db(self, master_name, alias_name, similarity=None, verified_equivalent_masters=False):
        """Persist a master/alias relationship to Supabase.

        NOTE (alias/synonym fix): one alias phrase must not silently end up
        pointing at two different masters — that's how alias_lookup[alias]
        used to get clobbered by whichever merge ran last. Before writing,
        we check Supabase directly for any *other* master already mapped to
        this alias. If one exists and the caller hasn't already verified
        (via is_true_alias) that the two masters are themselves equivalent,
        we log the conflict and refuse the write rather than overwrite it.
        Callers that HAVE verified the masters are equivalent (see
        merge_synonyms_dynamically) pass verified_equivalent_masters=True.
        """
        try:
            client = supabase.get_client()
            if not client:
                return
            master_id = self._get_or_create_skill_id(master_name)
            alias_id = self._get_or_create_skill_id(alias_name)
            if not (master_id and alias_id):
                return

            existing = client.table('skill_aliases').select('master_skill_id').eq('alias_skill_id', alias_id).execute()
            conflicting_masters = {row['master_skill_id'] for row in (existing.data or []) if row['master_skill_id'] != master_id}
            if conflicting_masters and not verified_equivalent_masters:
                print(f"[ALIAS] DB CONFLICT — rejected:\n"
                      f"  \"{alias_name}\" already has a different master in Supabase "
                      f"(master_skill_id(s)={conflicting_masters})\n"
                      f"  refusing to also map it to master_skill_id={master_id} (\"{master_name}\") "
                      f"without verified master equivalence")
                return

            client.table('skill_aliases').upsert(
                {'master_skill_id': master_id, 'alias_skill_id': alias_id, 'similarity': similarity},
                on_conflict='master_skill_id,alias_skill_id'
            ).execute()
            self._invalidate_facts_cache()
        except Exception as e:
            print(f"[NLP] Error saving alias '{alias_name}' -> '{master_name}': {e}")

    def _split_into_atomic_skills(self, compound_skill):
        """
        Split a compound skill phrase joined by 'and' into atomic components,
        re-attaching a shared trailing noun to each half when present.

        Examples:
          "Manufacturing And Quality Systems Support"
            -> ["Manufacturing Support", "Quality Systems Support"]
          "UPS Service And Maintenance Coordination"
            -> ["UPS Service Coordination", "Maintenance Coordination"]
          "Technical Sales And Engineering Support"
            -> ["Technical Sales Support", "Engineering Support"]

        Returns an empty list if the phrase doesn't contain " and " (i.e. it's
        already atomic - nothing to split).
        """
        if not compound_skill:
            return []

        # Only split on a standalone "and" (word-boundary, case-insensitive).
        # This avoids false positives on words that merely contain "and"
        # (e.g. "Brand Management", "Standards Compliance").
        parts = re.split(r'\s+and\s+', compound_skill.strip(), flags=re.IGNORECASE)
        if len(parts) != 2:
            # Either no "and" found (already atomic), or more than one "and"
            # (ambiguous compound) - don't guess, leave it as a single skill.
            return []

        left, right = parts[0].strip(), parts[1].strip()
        if not left or not right:
            return []

        left_words = left.split()
        right_words = right.split()

        # If the right side ends in a noun that reads like a shared suffix
        # (e.g. "Quality Systems Support"), and the left side is missing
        # that same trailing word (e.g. "Manufacturing"), re-attach it so
        # both halves stand on their own as valid skill phrases.
        trailing_word = right_words[-1] if right_words else None
        left_last_word = left_words[-1] if left_words else None

        if trailing_word and left_last_word and left_last_word.lower() != trailing_word.lower():
            left_component = f"{left} {trailing_word}"
        else:
            left_component = left

        right_component = right

        components = [
            self._clean_candidate_text(left_component),
            self._clean_candidate_text(right_component),
        ]
        # Drop empties/dupes, preserve order
        seen = set()
        result = []
        for c in components:
            if c and c.lower() not in seen:
                seen.add(c.lower())
                result.append(c)

        # ============ SAFETY: bail out on single-word components ============
        # If either resulting component is a single word (e.g. "coordination",
        # "management"), the compound actually follows a shared-PREFIX pattern
        # ("Ups Service Support And Coordination" = "Ups Service Support" +
        # "[Ups Service] Coordination") rather than the shared-SUFFIX pattern
        # this splitter targets ("X Support And Y Support" -> "X Support" +
        # "Y Support"). A lone generic word is too vague to be a useful
        # standalone skill for matching and just duplicates what's already in
        # the other half - better to leave the compound unsplit than emit it.
        if any(len(c.split()) < 2 for c in result):
            return []
        # =======================================================================

        return result

    def _save_component_to_db(self, skill_name, components, category='Other',
                               document_id=None, employee_id=None, reviewed_by=None):
        """
        Persist a compound skill's atomic components to Supabase, AND
        auto-feed each component into feedback_training labeled 'Skill' so
        it's usable as a training example immediately - no separate backfill
        script needed going forward (see fix_existing_data.py STEP 3, which
        was a one-time catch-up for components saved before this existed).
        skill_name is the full compound phrase (kept as-is in `skills`);
        components are the split-out atomic phrases stored in
        `skill_components`, each linked back to skill_name's skill_id.
        """
        if not components:
            return
        try:
            client = supabase.get_client()
            if not client:
                return
            skill_id = self._get_or_create_skill_id(skill_name, category)
            if not skill_id:
                return
            for component_name in components:
                client.table('skill_components').upsert(
                    {'skill_id': skill_id, 'component_name': component_name},
                    on_conflict='skill_id,component_name'
                ).execute()
            self._invalidate_facts_cache()
            print(f"[NLP] Saved {len(components)} atomic components for '{skill_name}': {components}")

            # ============ NEW: auto-feed components into feedback_training ============
            self._sync_components_to_feedback(components, document_id, employee_id, reviewed_by)
            # ================================================================================
        except Exception as e:
            print(f"[NLP] Error saving components for '{skill_name}': {e}")

    def _sync_components_to_feedback(self, components, document_id=None,
                                      employee_id=None, reviewed_by=None):
        """
        Insert each atomic component into feedback_training with
        label='Skill', skipping any phrase already present there
        (case-insensitive) so re-processing the same compound skill never
        creates duplicate feedback rows. Mirrors fix_existing_data.py's
        STEP 3 logic, but runs live at split-time instead of as a one-time
        batch job.
        """
        if not components:
            return
        try:
            client = supabase.get_client()
            if not client:
                return

            existing_resp = client.table('feedback_training').select('phrase').execute()
            existing_lower = {row['phrase'].strip().lower() for row in (existing_resp.data or [])}
            existing_lower.update(p.strip().lower() for p in self.feedback_log.get('approved', []))

            for component_name in components:
                component_lower = component_name.strip().lower()
                if component_lower in existing_lower:
                    continue

                self._save_feedback_to_db(component_name, 'Skill', document_id, employee_id, reviewed_by)
                existing_lower.add(component_lower)

                self.feedback_log.setdefault('approved', [])
                if component_name not in self.feedback_log['approved']:
                    self.feedback_log['approved'].append(component_name)
                self.learned_skills.add(component_lower)
                self.skill_dictionary.setdefault(component_lower, 'Other')
                for w in component_lower.split():
                    if len(w) > 3:
                        self.learned_skill_keywords.add(w)

                print(f"[NLP] Auto-fed component into feedback_training: '{component_name}' (label=Skill)")
        except Exception as e:
            print(f"[NLP] Error syncing components to feedback_training: {e}")

    def _save_feedback_to_db(self, phrase, label, document_id=None, employee_id=None, reviewed_by=None):
        """Insert one approve/reject decision into feedback_training."""
        try:
            client = supabase.get_client()
            if not client:
                return
            client.table('feedback_training').insert({
                'phrase': phrase,
                'label': label,
                'document_id': document_id,
                'employee_id': employee_id,
                'reviewed_by': reviewed_by,
            }).execute()
            self._invalidate_facts_cache()
        except Exception as e:
            print(f"[NLP] Error saving feedback for '{phrase}': {e}")
        """
        Save learned_skills.json with alias structure - MERGE instead of OVERWRITE!
        """
        try:
            # ============ LOAD EXISTING DATA FIRST ============
            existing_data = {}
            if os.path.exists(self.skill_db_path):
                try:
                    with open(self.skill_db_path, 'r', encoding='utf-8') as f:
                        existing_data = json.load(f)
                    print(f"[NLP] Loaded existing data with {len(existing_data.get('learned_skills', []))} skills")
                except Exception as e:
                    print(f"[NLP] Could not load existing data: {e}")
            
            # Build alias structure from merge history if not already built
            if not self.skill_aliases and self.merge_history:
                self._build_alias_structure_from_history()
            
            # ============ MERGE: Combine existing + new ============
            # 1. Merge learned_skills (UNION - keeps all!)
            existing_skills = set(existing_data.get('learned_skills', []))
            current_skills = set(self.learned_skills)
            merged_skills = existing_skills | current_skills  # UNION operation
            print(f"[NLP] Merging: {len(existing_skills)} existing + {len(current_skills)} current = {len(merged_skills)} total")
            
            # 2. Merge dictionary
            existing_dict = existing_data.get('dictionary', {})
            current_dict = self.skill_dictionary
            merged_dict = {**existing_dict, **current_dict}
            
            # 3. Merge categories
            existing_categories = existing_data.get('categories', {})
            current_categories = self.skill_categories
            merged_categories = {**existing_categories}
            for category, skills in current_categories.items():
                if category not in merged_categories:
                    merged_categories[category] = []
                for skill in skills:
                    if skill not in merged_categories[category]:
                        merged_categories[category].append(skill)
            
            # 4. Merge aliases
            existing_aliases = existing_data.get('skill_aliases', {})
            current_aliases = self.skill_aliases
            merged_aliases = {**existing_aliases}
            for master, aliases in current_aliases.items():
                if master not in merged_aliases:
                    merged_aliases[master] = []
                for alias in aliases:
                    if alias not in merged_aliases[master]:
                        merged_aliases[master].append(alias)
            
            # 5. Merge alias_lookup
            existing_lookup = existing_data.get('alias_lookup', {})
            current_lookup = self.alias_lookup
            merged_lookup = {**existing_lookup, **current_lookup}
            
            # 6. Merge rejection patterns
            existing_rejected_phrases = existing_data.get('rejected_phrases', {})
            current_rejected_phrases = dict(self.rejected_phrases)
            merged_rejected_phrases = {**existing_rejected_phrases}
            for phrase, count in current_rejected_phrases.items():
                merged_rejected_phrases[phrase] = merged_rejected_phrases.get(phrase, 0) + count
            
            # 7. Merge feedback_log
            existing_feedback = existing_data.get('feedback_log', {})
            current_feedback = self.feedback_log
            merged_feedback = {**existing_feedback}
            for key in ['approved', 'rejected']:
                if key in current_feedback:
                    if key not in merged_feedback:
                        merged_feedback[key] = []
                    for item in current_feedback[key]:
                        if item not in merged_feedback[key]:
                            merged_feedback[key].append(item)
            
            # 8. Merge skill_importance
            existing_importance = existing_data.get('skill_importance', {})
            current_importance = self.skill_importance
            merged_importance = {**existing_importance}
            for skill, importance in current_importance.items():
                merged_importance[skill] = merged_importance.get(skill, 0) + importance
            
            # 9. Merge merge_history
            existing_history = existing_data.get('merge_history', [])
            current_history = self.merge_history if hasattr(self, 'merge_history') else []
            existing_entries = {(h.get('skill1'), h.get('skill2')): h for h in existing_history}
            merged_history = existing_history.copy()
            for entry in current_history:
                key = (entry.get('skill1'), entry.get('skill2'))
                if key not in existing_entries:
                    merged_history.append(entry)
                    existing_entries[key] = entry
            
            # 10. Merge other dictionaries
            def merge_counter(existing, current, limit=1000):
                merged = dict(existing)
                for key, value in current.items():
                    merged[key] = merged.get(key, 0) + value
                # Sort and limit
                sorted_items = sorted(merged.items(), key=lambda x: x[1], reverse=True)
                return dict(sorted_items[:limit])
            
            merged_word_freq = merge_counter(
                existing_data.get('word_frequency', {}),
                dict(self.word_frequency),
                1000
            )
            merged_phrase_freq = merge_counter(
                existing_data.get('phrase_frequency', {}),
                dict(self.phrase_frequency),
                500
            )
            merged_skill_candidates = merge_counter(
                existing_data.get('skill_candidates', {}),
                dict(self.skill_candidates),
                100
            )
            merged_skill_patterns = merge_counter(
                existing_data.get('skill_patterns', {}),
                dict(self.skill_patterns),
                50
            )
            merged_non_skill_patterns = merge_counter(
                existing_data.get('non_skill_patterns', {}),
                dict(self.non_skill_patterns),
                50
            )
            
            # 11. Merge learned_sections
            existing_sections = existing_data.get('learned_sections', {})
            current_sections = self.learned_sections
            merged_sections = {**existing_sections}
            for section, count in current_sections.items():
                merged_sections[section] = merged_sections.get(section, 0) + count
            
            # 12. Merge type_thresholds
            existing_thresholds = existing_data.get('type_thresholds', {})
            current_thresholds = self.type_thresholds
            merged_thresholds = {**existing_thresholds, **current_thresholds}
            
            # 13. Merge learned_skill_keywords
            existing_keywords = set(existing_data.get('learned_skill_keywords', []))
            current_keywords = set(self.learned_skill_keywords)
            merged_keywords = existing_keywords | current_keywords
            
            # ============ BUILD FINAL DATA ============
            data = {
                'learned_skills': list(merged_skills),  # ALL skills!
                'dictionary': merged_dict,
                'categories': merged_categories,
                'skill_aliases': merged_aliases,
                'alias_lookup': merged_lookup,
                'rejected_phrases': merged_rejected_phrases,
                'rejected_single_words': dict(self.rejected_single_words),
                'rejected_names': dict(self.rejected_names),
                'rejected_fragments': dict(self.rejected_fragments),
                'learned_skill_keywords': list(merged_keywords),
                'word_frequency': merged_word_freq,
                'phrase_frequency': merged_phrase_freq,
                'skill_candidates': merged_skill_candidates,
                'skill_patterns': merged_skill_patterns,
                'non_skill_patterns': merged_non_skill_patterns,
                'documents_analyzed': max(
                    existing_data.get('documents_analyzed', 0),
                    self.stats['documents_analyzed']
                ),
                'last_updated': datetime.now().isoformat(),
                'learned_sections': merged_sections,
                'type_thresholds': merged_thresholds,
                'skill_importance': merged_importance,
                'feedback_log': merged_feedback,
                'merge_history': merged_history[-1000:] if merged_history else []
            }
            
            # ============ CREATE BACKUP BEFORE SAVING ============
            if os.path.exists(self.skill_db_path):
                backup_path = f"{self.skill_db_path}.backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
                import shutil
                shutil.copy2(self.skill_db_path, backup_path)
                print(f"[BACKUP] Created: {backup_path}")

                # ============ KEEP ONLY THE 5 MOST RECENT BACKUPS ============
                import glob
                backup_dir = os.path.dirname(self.skill_db_path)
                base_name = os.path.basename(self.skill_db_path)
                all_backups = sorted(
                    glob.glob(os.path.join(backup_dir, f"{base_name}.backup_*")),
                    key=os.path.getmtime,
                    reverse=True
                )
                for old_backup in all_backups[5:]:
                    try:
                        os.remove(old_backup)
                        print(f"[BACKUP] Removed old backup: {old_backup}")
                    except Exception as e:
                        print(f"[BACKUP] Could not remove {old_backup}: {e}")
            
            # ============ SAVE WITH MERGED DATA ============
            with open(self.skill_db_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            
            print(f"[NLP] ✅ Saved knowledge base: {len(merged_skills)} skills")
            print(f"[NLP]    Categories: {len(merged_categories)}")
            print(f"[NLP]    Alias groups: {len(merged_aliases)}")
            print(f"[NLP]    Rejected patterns: {len(merged_rejected_phrases)}")
            print(f"[NLP]    Keywords: {len(merged_keywords)}")
            return True
            
        except Exception as e:
            print(f"[NLP] Error saving: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def _build_alias_structure_from_history(self):
        """Build alias structures from merge history.

        NOTE (alias/synonym fix): merge_history can contain entries written
        under the OLD, looser merge logic (before is_true_alias existed).
        Trusting merge['decision'] blindly would silently resurrect those
        bad aliases. So every entry is re-validated with is_true_alias()
        under the CURRENT rules before it's allowed back into
        skill_aliases/alias_lookup — an entry that was accepted historically
        but fails the new equivalence check is skipped and logged, not
        rebuilt. This also enforces the one-master-per-alias rule (never
        silently overwrite alias_lookup[alias] with a conflicting master).
        """
        self.skill_aliases = {}
        self.alias_lookup = {}
        
        for merge in self.merge_history:
            if merge.get('decision'):
                skill1 = merge['skill1']
                skill2 = merge['skill2']
                
                # Determine which is the master
                if skill1 in self.learned_skills and skill2 in self.learned_skills:
                    # Both exist - check merge history for which was kept
                    master = self._choose_master(skill1, skill2)
                    alias = skill2 if master == skill1 else skill1
                elif skill1 in self.learned_skills:
                    master, alias = skill1, skill2
                elif skill2 in self.learned_skills:
                    master, alias = skill2, skill1
                else:
                    continue

                accepted, category, reasons, sig = self._evaluate_equivalence(master, alias)
                if not accepted:
                    print(f"[ALIAS] Skipped rebuilding stale merge-history entry:\n"
                          f"  \"{alias}\" <-> \"{master}\"\n"
                          f"  reason={'; '.join(reasons) if reasons else 'fails current equivalence rules'}")
                    continue

                existing_master = self.alias_lookup.get(alias)
                if existing_master and existing_master != master:
                    masters_equivalent, _, equiv_reasons, _ = self._evaluate_equivalence(existing_master, master)
                    if not masters_equivalent:
                        print(f"[ALIAS] CONFLICT while rebuilding — kept \"{existing_master}\" as master for "
                              f"\"{alias}\", refused reassigning to \"{master}\" "
                              f"(reason={'; '.join(equiv_reasons)})")
                        continue
                    master = existing_master  # masters verified equivalent — keep the one already chosen

                self.skill_aliases.setdefault(master, [])
                if alias not in self.skill_aliases[master]:
                    self.skill_aliases[master].append(alias)
                self.alias_lookup[alias] = master
    
    def get_master_skill(self, skill):
        """
        Get the master skill for a given skill.
        Useful for recommendation phase.
        
        Args:
            skill: The skill phrase to lookup
        
        Returns:
            The master skill name, or the original if not an alias
        """
        if skill in self.alias_lookup:
            return self.alias_lookup[skill]
        return skill
    
    def get_aliases(self, master):
        """Get all aliases for a master skill"""
        return self.skill_aliases.get(master, [])
    
    def is_alias(self, skill):
        """Check if a skill is an alias"""
        return skill in self.alias_lookup
    
    # ============ DYNAMIC SECTION LEARNING ============
    
    def _learn_section_names(self):
        """
        Learn section names from documents dynamically.
        No hardcoded section names.
        """
        if not hasattr(self, 'learned_sections'):
            self.learned_sections = {}
        
        # Common patterns that indicate section headers (learned, not hardcoded)section_name
        header_patterns = re.compile(
            r'^([A-Z][A-Z\s&]+|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*[:.]?\s*$',
            re.MULTILINE
        )
        
        for doc in self.doc_texts:
            lines = doc.split('\n')
            for line in lines:
                line = line.strip()
                if not line:
                    continue
            
            # ============ FIX: real headers in this doc are short (<=3 words). ============
            # A 4+ word all-title-case line (e.g. "Basic Project Coordination Support")
            # was being misread as a new header, silently dropping it as content.
            is_short_enough_for_header = len(line.split()) <= 3
            
            # Check if this is a section header
            if is_short_enough_for_header and header_pattern.match(line):
                    # Clean the section name
                    section = line.rstrip(':.').strip()
                    if len(section) > 2 and len(section) < 50:
                        self.learned_sections[section.lower()] = self.learned_sections.get(section.lower(), 0) + 1
        
        # Keep only sections that appear multiple times
        self.learned_sections = {
            name: count for name, count in self.learned_sections.items()
            if count > 1
        }
        
        if self.learned_sections:
            print(f"[LEARN] Found {len(self.learned_sections)} section names")
    
    # ============ COMPLETELY DYNAMIC SKILL TYPING ============
    
    def _get_context_variety(self, skill):
        """
        How many different contexts does this skill appear in?
        Learns section names dynamically from documents.
        """
        # Learn section names if we haven't yet
        if not hasattr(self, 'learned_sections') or not self.learned_sections:
            self._learn_section_names()
        
        contexts = set()
        skill_lower = skill.lower()
        
        for doc in self.doc_texts:
            if skill_lower not in doc.lower():
                continue
            
            doc_lower = doc.lower()
            idx = doc_lower.find(skill_lower)
            if idx == -1:
                continue
            
            # Look for section headers (learned from documents)
            lines = doc.split('\n')
            for i, line in enumerate(lines):
                line_lower = line.lower().strip()
                
                # Check if this line is a section header (learned)
                for section_name in self.learned_sections.keys():
                    if section_name in line_lower:
                        # Check if the skill appears in this section
                        # Look at the next 15 lines for the skill
                        for j in range(i + 1, min(i + 15, len(lines))):
                            if skill_lower in lines[j].lower():
                                contexts.add(section_name)
                                break
        
        return len(contexts)
    
    def _get_skill_type(self, skill):
        """
        Dynamically determine skill type from document context.
        ZERO hardcoded values - learns everything from documents.
        """
        skill_lower = skill.lower()
        
        # Learn section names if needed
        if not hasattr(self, 'learned_sections') or not self.learned_sections:
            self._learn_section_names()
        
        # Scores for each type - learned dynamically
        scores = {
            'tool': 0.0,
            'technique': 0.0,
            'generic': 0.0
        }
        
        for doc in self.doc_texts:
            if skill_lower not in doc.lower():
                continue
            
            doc_lower = doc.lower()
            
            # Find where the skill appears
            idx = doc_lower.find(skill_lower)
            if idx == -1:
                continue
            
            # Look at surrounding context (window)
            start = max(0, idx - 100)
            end = min(len(doc_lower), idx + len(skill_lower) + 100)
            context = doc_lower[start:end]
            
            # Check what section this is in (learned from documents)
            for section_name, count in self.learned_sections.items():
                if section_name in context:
                    # Analyze section name patterns (learned from data)
                    if 'software' in section_name or 'proficiency' in section_name or 'tool' in section_name:
                        scores['tool'] += 2.0 * (count / max(self.learned_sections.values(), default=1))
                    elif 'technical' in section_name or 'competency' in section_name or 'skill' in section_name:
                        scores['technique'] += 1.5 * (count / max(self.learned_sections.values(), default=1))
                    elif 'general' in section_name or 'summary' in section_name or 'overview' in section_name:
                        scores['generic'] += 1.0 * (count / max(self.learned_sections.values(), default=1))
            
            # Analyze the skill name structure (data-driven)
            word_count = len(skill.split())
            if word_count <= 2:
                scores['tool'] += 0.5
            elif word_count >= 3:
                scores['technique'] += 0.5
            
            # Check for capitalization (common in proper nouns/tools)
            for word in skill.split():
                if word and word[0].isupper():
                    scores['tool'] += 0.3
        
        # Determine type based on highest score
        max_score = max(scores.values()) if scores else 0
        if max_score == 0:
            return 'technique'  # Default if no data
        
        if scores['tool'] > scores['technique'] and scores['tool'] > scores['generic']:
            return 'tool'
        elif scores['technique'] > scores['generic']:
            return 'technique'
        else:
            return 'generic'
    
    def _get_skill_importance(self, skill):
        """How important is this skill? (100% learned from data)"""
        if not self.doc_texts:
            return 0.0
        
        doc_count = 0
        skill_lower = skill.lower()
        
        for doc in self.doc_texts:
            if skill_lower in doc.lower():
                doc_count += 1
        
        base_importance = doc_count / len(self.doc_texts)
        
        # Boost if skill was approved by user (feedback)
        if hasattr(self, 'skill_importance'):
            base_importance += self.skill_importance.get(skill, 0) * 0.1
        
        return min(base_importance, 1.0)

    # ============ MERGE-RUN PERFORMANCE CACHE HELPERS ============
    # See the cache attributes set up in __init__. Every helper here is a
    # memoized wrapper around an existing (expensive, per-skill) computation
    # — none of them change what gets computed or the values returned, they
    # just make sure it only happens once per unique skill string.

    def _get_skill_lexical_cache(self, skill):
        """Cheap, pure-string-processing facts about a skill phrase
        (normalized text, whitespace-stripped text, meaningful tokens).
        Computed once per skill and reused across every pair it appears in."""
        cached = self._skill_cache.get(skill)
        if cached is not None:
            return cached
        norm = self._normalize_skill_text(skill)
        nospace = re.sub(r'\s+', '', norm)
        tokens = self._meaningful_tokens(skill)
        cached = {
            'norm': norm,
            'nospace': nospace,
            'tokens': tokens,
            'token_set': set(tokens),
        }
        self._skill_cache[skill] = cached
        return cached

    def _get_cached_nlp_doc(self, skill):
        """The expensive part: running the spaCy pipeline on a skill phrase.
        Cached per skill so the all-pairs merge parses each unique skill
        string once instead of once per PAIR it's involved in (this was the
        actual cause of the 5-minute timeout: ~233 skills naively costs up
        to ~54k spaCy calls with no caching; with caching it costs ~233)."""
        if skill in self._nlp_doc_cache:
            return self._nlp_doc_cache[skill]
        try:
            doc = self.nlp(skill)
        except Exception:
            doc = None
        self._nlp_doc_cache[skill] = doc
        return doc

    def _get_cached_skill_type(self, skill):
        """_get_skill_type() scans every document in self.doc_texts looking
        for occurrences of `skill` — also O(n) per call, also wasteful to
        repeat per pair. Cached per skill per merge run."""
        if skill not in self._skill_type_cache:
            self._skill_type_cache[skill] = self._get_skill_type(skill)
        return self._skill_type_cache[skill]

    def _get_cached_skill_importance(self, skill):
        """Same rationale as _get_cached_skill_type: _get_skill_importance()
        scans self.doc_texts; cache per skill per merge run."""
        if skill not in self._skill_importance_cache:
            self._skill_importance_cache[skill] = self._get_skill_importance(skill)
        return self._skill_importance_cache[skill]

    def _clear_merge_run_caches(self):
        """Drop all merge-run caches. Call this if self.doc_texts or
        self.skill_dictionary changed since the caches were last populated
        (e.g. learn_from_data() ingested new documents) and you need
        guaranteed-fresh per-skill type/importance/lexical values."""
        self._skill_cache.clear()
        self._nlp_doc_cache.clear()
        self._skill_type_cache.clear()
        self._skill_importance_cache.clear()

    # ============ DYNAMIC MERGE THRESHOLDS ============
    
    def _get_merge_threshold(self, skill1, skill2):
        """
        Dynamically determine the SEMANTIC SIMILARITY floor required for two
        skills to be considered equivalent, learned from data.

        IMPORTANT (alias/synonym fix): this used to also LOWER the threshold
        when two phrases shared a lot of words ("high overlap -> easier to
        merge"). That's backwards for alias safety — high word overlap is
        exactly the situation that produces false aliases like
        'project management' vs 'project documentation management'. Word
        overlap is now handled as its own, separate signal inside
        is_true_alias()/_get_equivalence_signals(), never by loosening this
        semantic floor. This function may now only RAISE the threshold above
        ALIAS_MIN_SEMANTIC_SIMILARITY, never lower it below that floor.
        """
        type1 = self._get_cached_skill_type(skill1)
        type2 = self._get_cached_skill_type(skill2)
        
        # Get base threshold from learned data
        key = tuple(sorted([type1, type2]))
        base_threshold = self.type_thresholds.get(key, ALIAS_MIN_SEMANTIC_SIMILARITY)
        
        # Adjust based on skill importance (learned from documents)
        importance1 = self._get_cached_skill_importance(skill1)
        importance2 = self._get_cached_skill_importance(skill2)
        
        # Important skills (appear in many documents) should be harder to merge
        if importance1 + importance2 > 0.5:
            base_threshold += 0.08
        
        # Adjust based on word overlap (learned from data)
        words1 = set(skill1.lower().split())
        words2 = set(skill2.lower().split())
        if words1 and words2:
            overlap_ratio = len(words1 & words2) / max(len(words1), len(words2))
            
            # If they share no words, they're likely different - raise threshold.
            # NOTE: the old "share many words -> lower threshold" branch was
            # removed here — see docstring above.
            if overlap_ratio == 0:
                base_threshold += 0.15
        
        # Adjust based on feedback (learned)
        if hasattr(self, 'feedback_log') and self.feedback_log:
            for skill in [skill1, skill2]:
                if skill in self.feedback_log.get('rejected', []):
                    base_threshold += 0.10  # Rejected skills are harder to merge
        
        # Cap at a reasonable range. The floor is ALIAS_MIN_SEMANTIC_SIMILARITY,
        # not a low generic number — dynamic learning can only push this up
        # from there, never down.
        return min(max(base_threshold, ALIAS_MIN_SEMANTIC_SIMILARITY), 0.97)

    # ============ TRUE-SYNONYM / EQUIVALENCE DETECTION ============
    # This is the core of the alias/synonym fix. The old system treated
    # "semantically related" as sufficient evidence for an alias. These
    # methods separate three concepts explicitly:
    #   EXACT / EQUIVALENT   -> safe alias candidate (is_true_alias == True)
    #   SEMANTICALLY RELATED -> NOT an alias (same domain, different skill)
    #   DIFFERENT            -> NOT an alias
    # Only EXACT/EQUIVALENT may ever reach _save_alias_to_db().

    def _fuzzy_ratio(self, a, b):
        """Character-level similarity between two tokens (0..1). Used to
        catch morphological/format variants (report/reporting, plural/
        singular, minor typos) without any hardcoded word list."""
        if a == b:
            return 1.0
        return SequenceMatcher(None, a, b).ratio()

    def _meaningful_tokens(self, phrase):
        """Normalize a phrase and strip connector/stopwords, returning the
        tokens that actually carry meaning."""
        norm = self._normalize_skill_text(phrase)
        stop = set(LEADING_CONNECTORS) | {'the', 'a', 'an'}
        return [t for t in norm.split() if t not in stop]

    def _best_fuzzy_token_match(self, tokens_a, tokens_b, threshold=ALIAS_FUZZY_TOKEN_MATCH_THRESHOLD):
        """Greedy best-first bipartite matching between two token lists using
        _fuzzy_ratio. Returns (matched_pairs, unmatched_a, unmatched_b)."""
        candidates = []
        for ia, a in enumerate(tokens_a):
            for ib, b in enumerate(tokens_b):
                ratio = self._fuzzy_ratio(a, b)
                if ratio >= threshold:
                    candidates.append((ratio, ia, ib))
        candidates.sort(key=lambda x: x[0], reverse=True)

        used_a, used_b = set(), set()
        matched = []
        for ratio, ia, ib in candidates:
            if ia in used_a or ib in used_b:
                continue
            used_a.add(ia)
            used_b.add(ib)
            matched.append((tokens_a[ia], tokens_b[ib], ratio))

        unmatched_a = [t for i, t in enumerate(tokens_a) if i not in used_a]
        unmatched_b = [t for i, t in enumerate(tokens_b) if i not in used_b]
        return matched, unmatched_a, unmatched_b

    def _get_generic_terms(self):
        """Dynamically identify tokens that show up across many different
        learned skills ("management", "support", "technical", ...) and
        therefore carry little distinguishing meaning on their own. This is
        computed from self.learned_skills at runtime — NOT a hardcoded word
        list — so a term like "documentation" only becomes "generic" if the
        user's own corpus actually shows it that way.

        Requires a minimum corpus size (GENERIC_TERM_MIN_SKILLS) before it
        trusts itself; below that it returns an empty set and the other
        equivalence signals (fuzzy overlap, extra-token relatedness) carry
        the full safety burden instead.
        """
        total = len(self.learned_skills)
        if total < GENERIC_TERM_MIN_SKILLS:
            return set()

        if getattr(self, '_generic_terms_cache_size', None) == total and hasattr(self, '_generic_terms_cache'):
            return self._generic_terms_cache

        doc_freq = Counter()
        for sk in self.learned_skills:
            for tok in set(self._get_skill_lexical_cache(sk)['tokens']):
                doc_freq[tok] += 1

        generic = {
            tok for tok, cnt in doc_freq.items()
            if cnt >= GENERIC_TERM_MIN_COUNT and (cnt / total) >= GENERIC_TERM_DOC_FREQ_RATIO
        }
        self._generic_terms_cache = generic
        self._generic_terms_cache_size = total
        return generic

    def _get_equivalence_signals(self, skill1, skill2, compute_similarity=True):
        """Compute every signal is_true_alias() needs: normalized token
        overlap, meaningful (fuzzy) token overlap, phrase containment, token
        count difference, shared core terms, semantic similarity, and
        whether the difference is purely grammatical/formatting.

        PERFORMANCE: every field except 'similarity' is a cheap, pure
        string/token computation pulled from the per-skill lexical cache
        (see _get_skill_lexical_cache) — it costs nothing extra to recompute
        for a skill that's already been seen elsewhere in this merge run.
        'similarity' is the one field that runs the spaCy pipeline; pass
        compute_similarity=False to skip it (the field is then None) when
        the cheap fields already conclusively decide the outcome. Only
        _evaluate_equivalence() should pass False — everything else should
        leave the default so the returned signals are always complete.
        """
        cache1 = self._get_skill_lexical_cache(skill1)
        cache2 = self._get_skill_lexical_cache(skill2)

        norm1 = cache1['norm']
        norm2 = cache2['norm']
        nospace1 = cache1['nospace']
        nospace2 = cache2['nospace']
        format_only_variation = bool(norm1) and bool(norm2) and nospace1 == nospace2

        raw_tokens1 = norm1.split()
        raw_tokens2 = norm2.split()
        raw_union = set(raw_tokens1) | set(raw_tokens2)
        normalized_token_overlap = (
            len(set(raw_tokens1) & set(raw_tokens2)) / len(raw_union) if raw_union else 0.0
        )

        tokens1 = cache1['tokens']
        tokens2 = cache2['tokens']

        matched, unmatched1, unmatched2 = self._best_fuzzy_token_match(tokens1, tokens2)
        meaningful_token_overlap = len(matched) / max(len(tokens1), len(tokens2), 1)
        shorter_len = min(len(tokens1), len(tokens2))
        shorter_fully_matched = (len(matched) == shorter_len) if shorter_len > 0 else False
        token_count_diff = abs(len(tokens1) - len(tokens2))

        shorter_tokens, longer_tokens = (tokens1, tokens2) if len(tokens1) <= len(tokens2) else (tokens2, tokens1)
        phrase_containment = bool(shorter_tokens) and (' '.join(shorter_tokens) in ' '.join(longer_tokens))

        generic_terms = self._get_generic_terms()
        core1 = [t for t in tokens1 if t not in generic_terms]
        core2 = [t for t in tokens2 if t not in generic_terms]
        core_matched, core_unmatched1, core_unmatched2 = self._best_fuzzy_token_match(core1, core2)
        if core1 or core2:
            core_overlap = len(core_matched) / max(len(core1), len(core2), 1)
        else:
            # Both phrases are entirely generic filler words once the corpus-
            # wide generic terms are stripped out -> zero distinguishing
            # evidence they mean the same specific thing. Treat as no
            # evidence, not as a free pass.
            core_overlap = 0.0

        # How related is the single leftover/unmatched token (when phrases
        # differ by exactly one meaningful token) to the rest of the phrase
        # pair? High relatedness ("writing" next to a matched report/
        # reporting pair) suggests a wording compression, not a new concept.
        # Low relatedness ("documentation" next to project/management)
        # suggests a genuinely distinct concept was added.
        extra_token_relatedness = None
        if token_count_diff == 1 and shorter_fully_matched:
            extra = unmatched1 if len(tokens1) > len(tokens2) else unmatched2
            if extra:
                pool = [t for t in (tokens1 + tokens2) if t != extra[0]]
                ratios = [self._fuzzy_ratio(extra[0], t) for t in pool]
                extra_token_relatedness = max(ratios) if ratios else 0.0

        similarity = self._calculate_similarity(skill1, skill2) if compute_similarity else None

        return {
            'tokens1': tokens1,
            'tokens2': tokens2,
            'format_only_variation': format_only_variation,
            'normalized_token_overlap': normalized_token_overlap,
            'meaningful_token_overlap': meaningful_token_overlap,
            'shorter_fully_matched': shorter_fully_matched,
            'token_count_diff': token_count_diff,
            'phrase_containment': phrase_containment,
            'core_overlap': core_overlap,
            'unique_core1': [t for t in core1 if t not in [m[0] for m in core_matched]],
            'unique_core2': [t for t in core2 if t not in [m[1] for m in core_matched]],
            'extra_token_relatedness': extra_token_relatedness,
            'similarity': similarity,
        }

    def _is_lexically_plausible_alias(self, sig):
        """Cheap (no spaCy) NECESSARY condition for two skills to possibly be
        true aliases. This is exactly the non-similarity portion of the
        accept branches in _evaluate_equivalence() below, so it can never
        reject a pair that the full check would have accepted (no false
        negatives, no loosening of alias safety) — it can only reject pairs
        that the full check would reject too, letting callers skip the
        expensive semantic-similarity computation (and the rest of
        _evaluate_equivalence) entirely for those pairs. This is the "cheap
        pre-filter" that _should_merge()/merge_synonyms_dynamically() run
        before ever calling _evaluate_equivalence().
        """
        if sig['format_only_variation']:
            return True
        if sig['tokens1'] and set(sig['tokens1']) == set(sig['tokens2']):
            return True
        return (
            sig['token_count_diff'] <= 1
            and sig['shorter_fully_matched']
            and sig['meaningful_token_overlap'] >= ALIAS_MEANINGFUL_OVERLAP_THRESHOLD
            and sig['core_overlap'] >= ALIAS_CORE_OVERLAP_THRESHOLD
            and (
                sig['token_count_diff'] == 0
                or (sig['extra_token_relatedness'] or 0.0) >= ALIAS_EXTRA_TOKEN_RELATEDNESS_THRESHOLD
            )
        )

    def _cheap_rejection_reasons(self, sig):
        """Shared reason-building for pairs rejected without ever computing
        semantic similarity (either by the standalone pre-filter or by
        _evaluate_equivalence's own fast path)."""
        reasons = []
        if sig['token_count_diff'] > 1:
            reasons.append(f"phrase length differs by {sig['token_count_diff']} meaningful tokens")
        if not sig['shorter_fully_matched']:
            reasons.append('not every meaningful token in the shorter phrase has an equivalent in the other phrase')
        if sig['meaningful_token_overlap'] < ALIAS_MEANINGFUL_OVERLAP_THRESHOLD:
            reasons.append(f"insufficient lexical evidence (meaningful_token_overlap={sig['meaningful_token_overlap']:.2f} "
                            f"< {ALIAS_MEANINGFUL_OVERLAP_THRESHOLD})")
        if sig['core_overlap'] < ALIAS_CORE_OVERLAP_THRESHOLD:
            reasons.append(f"different core terms (core_overlap={sig['core_overlap']:.2f} < {ALIAS_CORE_OVERLAP_THRESHOLD})")
        if sig['token_count_diff'] == 1 and (sig['extra_token_relatedness'] or 0.0) < ALIAS_EXTRA_TOKEN_RELATEDNESS_THRESHOLD:
            reasons.append('extra word introduces a distinct concept not present in the other phrase')
        if not reasons:
            reasons.append('insufficient lexical/structural overlap for equivalence')
        reasons.append('rejected by cheap lexical pre-filter (no spaCy semantic check needed)')
        return reasons

    def _evaluate_equivalence(self, skill1, skill2):
        """
        The single source of truth for "are these two skill phrases the SAME
        skill?" Returns (accepted: bool, category: str, reasons: list[str],
        signals: dict). category is one of 'EXACT', 'RELATED', 'DIFFERENT'.

        Only 'EXACT' is accepted. This deliberately requires MORE than
        semantic similarity: a phrase pair must show strong, specific
        lexical/structural evidence of being the same skill (identical once
        formatting is stripped, identical token set, or near-identical
        wording with full coverage of the shorter phrase's tokens and no
        unrelated concept introduced) — semantic similarity is then used as
        a floor on top of that, not as the deciding signal by itself.

        PERFORMANCE: the decision logic and thresholds here are UNCHANGED
        from before — same inputs always produce the same accept/reject
        outcome. The only change is *when* the expensive spaCy similarity
        computation runs: it's computed lazily, only for pairs that already
        satisfy every cheap/lexical necessary condition
        (_is_lexically_plausible_alias). Pairs that fail those cheap checks
        are guaranteed to be rejected regardless of similarity (the original
        near-equivalent branch required all of those checks to pass too), so
        skipping the spaCy call for them changes nothing about the result.
        """
        if not skill1 or not skill2 or skill1 == skill2:
            return False, 'DIFFERENT', ['identical or empty input'], {}

        # ---- Cheap pass: zero spaCy calls. ----
        sig = self._get_equivalence_signals(skill1, skill2, compute_similarity=False)

        if not self._is_lexically_plausible_alias(sig):
            reasons = self._cheap_rejection_reasons(sig)
            category = 'RELATED' if sig['meaningful_token_overlap'] > 0 else 'DIFFERENT'
            return False, category, reasons, sig

        # 1) Pure formatting/spacing/punctuation/case variation ("AutoCAD" / "Auto CAD")
        #    — no spaCy call needed, this is a lexical-only decision. The
        #    similarity is set to a sentinel 1.0 (not computed via spaCy) —
        #    formatting variants of the same text are equivalent by
        #    definition, so this is accurate, not a placeholder guess.
        if sig['format_only_variation']:
            sig['similarity'] = 1.0
            return True, 'EXACT', ['formatting-only variation (identical once spacing/punctuation/case removed)'], sig

        # 2) Identical meaningful token set — reordering, duplication, or
        #    simple singular/plural-style variation that normalization alone
        #    already collapses to the same words. Also no spaCy call needed;
        #    same sentinel rationale as above.
        if sig['tokens1'] and set(sig['tokens1']) == set(sig['tokens2']):
            sig['similarity'] = 1.0
            return True, 'EXACT', ['identical meaningful token set'], sig

        # 3) Near-equivalent wording: every meaningful token in the shorter
        #    phrase has a close counterpart in the other phrase, the phrases
        #    differ by at most one token, the shared vocabulary isn't just
        #    generic filler, and — if there IS one leftover token — it's
        #    closely related to the matched material rather than a distinct
        #    new concept. All of that already passed above via
        #    _is_lexically_plausible_alias(); the only thing left to check
        #    is the semantic-similarity floor, so this is the ONLY branch
        #    that ever touches spaCy.
        required_similarity = self._get_merge_threshold(skill1, skill2)  # dynamic, but floor-clamped, see _get_merge_threshold
        sig['similarity'] = self._calculate_similarity(skill1, skill2)

        near_equivalent = sig['similarity'] >= required_similarity
        if near_equivalent:
            reasons = ['near-equivalent wording: full coverage of the shorter phrase, high lexical + '
                       'semantic overlap, no unrelated concept introduced']
            return True, 'EXACT', reasons, sig

        # ---- Not accepted. Classify + explain for logging/diagnostics. ----
        reasons = [f"semantic similarity insufficient for equivalence (sim={sig['similarity']:.2f} < {required_similarity:.2f})"]
        category = 'RELATED' if (sig['meaningful_token_overlap'] > 0 or sig['similarity'] >= 0.5) else 'DIFFERENT'
        return False, category, reasons, sig

    def is_true_alias(self, skill1, skill2):
        """
        Public validation gate: True only if skill1 and skill2 represent the
        SAME skill (safe alias candidate). This is the final check that must
        pass before anything is written to skill_aliases / Supabase — see
        _evaluate_equivalence() for the full reasoning and signal breakdown.
        """
        accepted, _category, _reasons, _sig = self._evaluate_equivalence(skill1, skill2)
        return accepted

    def _should_merge(self, skill1, skill2, stats=None):
        """
        Decide whether two learned skill phrases should become ALIASES of
        the same underlying skill.

        IMPORTANT (alias/synonym fix): this used to ask "are these
        semantically similar?" (plain spaCy vector similarity above a
        ~0.65-0.75 threshold), which is why merely-related phrases like
        'client technical communication and support' and 'client
        relationship management' were being merged as if they were the same
        skill. It now asks the narrower question "are these the SAME skill,
        described differently?" via _evaluate_equivalence()/is_true_alias(),
        which requires strong lexical/structural evidence in addition to
        semantic similarity. Cheap category-based and lexical pre-filters
        still run first purely to avoid wasted computation — see the
        PERFORMANCE note below.

        PERFORMANCE: `stats`, when given a dict (see merge_synonyms_dynamically),
        gets incremented with pair-level counters so callers can report how
        many pairs were disposed of cheaply vs. how many needed the full
        (spaCy-backed) equivalence check.
        """
        if not skill1 or not skill2 or skill1 == skill2:
            return False

        if stats is not None:
            stats['total_possible_pairs'] = stats.get('total_possible_pairs', 0) + 1

        # ============ LOAD EXISTING MERGE HISTORY (once) ============
        # PERFORMANCE: previously this re-checked `len(self.merge_history) == 0`
        # on every single call, so if there was genuinely no history yet
        # (e.g. a fresh skill DB) it would open + JSON-parse skill_db_path on
        # EVERY one of the ~27k pairs. A one-time flag makes the "no history
        # yet" case cost exactly one failed/empty load instead of thousands.
        if not getattr(self, '_merge_history_load_attempted', False):
            self._merge_history_load_attempted = True
            if not self.merge_history and os.path.exists(self.skill_db_path):
                try:
                    with open(self.skill_db_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        existing = data.get('merge_history', [])
                        if existing:
                            self.merge_history = existing
                            print(f"[MERGE] Loaded {len(existing)} existing merge history entries")
                except Exception as e:
                    print(f"[MERGE] Error loading: {e}")
        # =====================================================

        STOPWORDS_FOR_OVERLAP = set(LEADING_CONNECTORS)  # and, of, for, with, to, in, on, at
        words1 = set(skill1.lower().split()) - STOPWORDS_FOR_OVERLAP
        words2 = set(skill2.lower().split()) - STOPWORDS_FOR_OVERLAP
        overlap = len(words1 & words2)

        # ============ CATEGORY PROTECTION (cheap pre-filter #1) ============
        cat1 = self.skill_dictionary.get(skill1, 'Other')
        cat2 = self.skill_dictionary.get(skill2, 'Other')

        if cat1 != cat2 and cat1 != 'Other' and cat2 != 'Other':
            reason = f"different known categories ({cat1} vs {cat2})"
            print(f"[ALIAS] REJECTED:\n  \"{skill1}\" <-> \"{skill2}\"\n  reason={reason}")
            self._record_merge_decision(skill1, skill2, False, reason=reason)
            if stats is not None:
                stats['prefilter_rejected'] = stats.get('prefilter_rejected', 0) + 1
            return False

        if (cat1 == 'Other' or cat2 == 'Other') and overlap == 0:
            reason = 'uncategorized + zero raw word overlap — insufficient evidence'
            print(f"[ALIAS] REJECTED:\n  \"{skill1}\" <-> \"{skill2}\"\n  reason={reason}")
            self._record_merge_decision(skill1, skill2, False, reason=reason)
            if stats is not None:
                stats['prefilter_rejected'] = stats.get('prefilter_rejected', 0) + 1
            return False
        # ===================================================

        # ============ LEXICAL PRE-FILTER (cheap pre-filter #2, no spaCy) ====
        # Requirement: only pairs with plausible lexical/structural overlap
        # ever reach _evaluate_equivalence() (and therefore ever risk a
        # spaCy call). This is a strict subset check of _evaluate_equivalence's
        # own accept branches (see _is_lexically_plausible_alias docstring),
        # so it can reject a pair here only if the full check would have
        # rejected it too — alias safety is unchanged, only wasted work is
        # skipped. Pairs like "service teams" <-> "electrical construction
        # project sales support" (zero token overlap) are already caught by
        # the category filter above; pairs like "client technical
        # communication and support" <-> "client relationship management"
        # (share one word but fail full-coverage/core-overlap) are caught
        # here, before any spaCy call.
        cheap_sig = self._get_equivalence_signals(skill1, skill2, compute_similarity=False)
        if not self._is_lexically_plausible_alias(cheap_sig):
            reasons = self._cheap_rejection_reasons(cheap_sig)
            reason_text = '; '.join(reasons)
            print(f"[ALIAS] REJECTED:\n  \"{skill1}\" <-> \"{skill2}\"\n  reason={reason_text}")
            self._record_merge_decision(skill1, skill2, False, similarity=None, reason=reason_text)
            if stats is not None:
                stats['prefilter_rejected'] = stats.get('prefilter_rejected', 0) + 1
            return False
        # ===================================================

        # ============ AUTHORITATIVE DECISION ============
        if stats is not None:
            stats['sent_to_equivalence_check'] = stats.get('sent_to_equivalence_check', 0) + 1

        accepted, category, reasons, sig = self._evaluate_equivalence(skill1, skill2)
        reason_text = '; '.join(reasons)
        similarity_val = sig.get('similarity')

        self._record_merge_decision(
            skill1, skill2, accepted,
            similarity=similarity_val,
            threshold=self._get_merge_threshold(skill1, skill2),
            reason=reason_text,
        )

        similarity_display = f"{similarity_val:.2f}" if similarity_val is not None else "N/A"
        if accepted:
            print(f"[ALIAS] ACCEPTED:\n"
                  f"  \"{skill1}\" <-> \"{skill2}\"\n"
                  f"  semantic_similarity={similarity_display}\n"
                  f"  lexical_similarity={sig.get('meaningful_token_overlap', 0):.2f}\n"
                  f"  reason={reason_text}")
        else:
            print(f"[ALIAS] REJECTED:\n"
                  f"  \"{skill1}\" <-> \"{skill2}\"\n"
                  f"  semantic_similarity={similarity_display}\n"
                  f"  category={category}\n"
                  f"  reason={reason_text}")

        return accepted

    def _record_merge_decision(self, skill1, skill2, decision, similarity=None, threshold=None, is_alias=False, reason=None):
        """Shared merge_history append logic (previously duplicated between
        _should_merge and merge_synonyms_dynamically).

        PERFORMANCE: this used to silently fall back to recomputing
        similarity (a spaCy call) and threshold for EVERY pair that didn't
        already have them handy — including pairs rejected by a cheap
        pre-filter specifically to avoid that spaCy call. It no longer
        recomputes 'similarity' as a fallback (a cheaply-rejected pair
        legitimately has no similarity score — it was never computed, and
        that's the point); it's recorded as None instead. 'threshold' is
        still safe to fall back on since _get_merge_threshold is cached
        per-skill (see _get_cached_skill_type/_get_cached_skill_importance)
        and doesn't touch spaCy.
        """
        entry = {
            'skill1': skill1,
            'skill2': skill2,
            'similarity': similarity,
            'threshold': threshold if threshold is not None else self._get_merge_threshold(skill1, skill2),
            'decision': decision,
            'timestamp': datetime.now().isoformat(),
        }
        if is_alias:
            entry['is_alias'] = True
        if reason:
            entry['reason'] = reason
        self.merge_history.append(entry)
        if len(self.merge_history) > 1000:
            self.merge_history = self.merge_history[-500:]
    
    def _choose_master(self, skill1, skill2):
        """
        Choose which skill to keep.
        Learns what makes a good master from data.
        """
        # 1. Get scores for each skill
        score1 = self._get_skill_master_score(skill1)
        score2 = self._get_skill_master_score(skill2)
        
        # 2. Choose higher score
        if score1 >= score2:
            return skill1
        else:
            return skill2
    
    def _get_skill_master_score(self, skill):
        """
        Score a skill as a potential master.
        Entirely data-driven, no hardcoding.
        """
        score = 0.0
        
        # Factor 1: Appears in more documents (more common = better master)
        doc_count = 0
        for doc in self.doc_texts:
            if skill.lower() in doc.lower():
                doc_count += 1
        score += doc_count * 0.3
        
        # Factor 2: Has more words (more specific)
        score += len(skill.split()) * 0.2
        
        # Factor 3: Already in dictionary
        if skill in self.skill_dictionary:
            score += 1.0
        
        # Factor 4: Approved by users (feedback)
        if hasattr(self, 'skill_importance'):
            score += self.skill_importance.get(skill, 0) * 0.5
        
        # Factor 5: Context variety (appears in multiple sections)
        score += self._get_context_variety(skill) * 0.1
        
        return score
    
    def learn_from_data(self):
        """
        Learn thresholds and patterns from existing data.
        Called automatically, no manual tuning needed.

        IMPORTANT (alias/synonym fix): this used to LOWER type_thresholds
        when a lot of merges were failing ("too many failed merges, make it
        easier"). That directly weakens synonym safety — a high rejection
        rate is not evidence the system is too strict, it's often evidence
        it's working as intended (most skill pairs genuinely are NOT
        aliases). Learning may now only ever RAISE thresholds in response to
        merge history (e.g. after a lot of accepted merges, to be more
        conservative going forward); it may never lower them below
        ALIAS_MIN_SEMANTIC_SIMILARITY.
        """
        if len(self.learned_skills) < 5:
            return
        
        # Analyze merge history to learn thresholds
        if hasattr(self, 'merge_history') and self.merge_history:
            successful_merges = [m for m in self.merge_history if m.get('decision')]
            failed_merges = [m for m in self.merge_history if not m.get('decision')]

            # If merges are too aggressive (a lot of accepted merges relative
            # to rejections), raise thresholds to be more conservative.
            # Thresholds are never lowered here — see docstring above.
            if len(successful_merges) > len(failed_merges) * 1.5:
                for key in list(self.type_thresholds.keys()):
                    self.type_thresholds[key] = min(
                        0.97,
                        max(ALIAS_MIN_SEMANTIC_SIMILARITY, self.type_thresholds.get(key, ALIAS_MIN_SEMANTIC_SIMILARITY) + 0.05)
                    )
                print(f"[LEARN] Raised thresholds (too many successful merges)")
    
    # ============ EXTRACT CANDIDATES ============
    
    def _extract_candidates(self, text):
        """Extract potential skill candidates - learns from data dynamically"""
        candidates = set()
        whole_phrase_candidates = set()

        # ============ FIX: detect flat skill-list / CSV-style documents ============
        # If most non-empty lines look like "Skill Name<sep>Category Label" (short,
        # no terminal period, no prose), treat every line's first column as a
        # whole skill candidate and skip resume-style section/bullet/NLP parsing
        # entirely. This preserves every row instead of shredding it.
        raw_lines = [ln.strip() for ln in text.split('\n') if ln.strip()]
        if raw_lines:
            def _split_row(ln):
                # Prefer tab or comma as the column separator; fall back to
                # splitting on 2+ spaces (common in copy-pasted table text).
                if '\t' in ln:
                    return [p.strip() for p in ln.split('\t') if p.strip()]
                if ',' in ln:
                    return [p.strip() for p in ln.split(',') if p.strip()]
                parts = re.split(r'\s{2,}', ln)
                return [p.strip() for p in parts if p.strip()]

            sample = raw_lines[:30]
            row_like = sum(1 for ln in sample if len(_split_row(ln)) >= 2)
            prose_like = sum(1 for ln in sample if ln.endswith('.') and len(ln.split()) > 8)
            is_flat_skill_list = (
                len(raw_lines) >= 10
                and row_like / len(sample) >= 0.6
                and prose_like == 0
            )

            if is_flat_skill_list:
                for ln in raw_lines:
                    cols = _split_row(ln)
                    if not cols:
                        continue
                    skill_name = cols[0]
                    cleaned = self._clean_candidate_text(skill_name)
                    if cleaned and 2 < len(cleaned) < 100:
                        whole_phrase_candidates.add(cleaned)
                # Return immediately — every row captured whole, nothing shredded.
                final_candidates = set()
                for c in whole_phrase_candidates:
                    words = c.split()
                    if words and words[0].lower() in LEADING_CONNECTORS:
                        continue
                    final_candidates.add(c)
                return final_candidates
        # ==================================================================================
        
        # ============ STEP 1: Learn section names from this document ============
        # First, extract all section headers
        header_pattern = re.compile(r'^([A-Z][A-Z\s&]+|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*[:.]?\s*$', re.MULTILINE)
        
        sections = {}
        lines = text.split('\n')
        current_section = None
        current_content = []
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # Check if this is a section header
            if header_pattern.match(line):
                # Save previous section
                if current_section and current_content:
                    sections[current_section] = '\n'.join(current_content)
                current_section = line.rstrip(':.').strip().lower()
                current_content = []
            elif current_section:
                current_content.append(line)
        
        # Save last section
        if current_section and current_content:
            sections[current_section] = '\n'.join(current_content)
        
        # ============ STEP 2: Score sections for skill relevance ============
        # Skill indicators (learned patterns, not hardcoded)
        skill_indicators = [
            'skill', 'competenc', 'proficien', 'specializ', 
            'knowledge', 'expertise', 'qualif', 'ability',
            'technical', 'software', 'tool', 'platform',
            'experience', 'project', 'coordination', 'management',
            'control', 'tracking', 'document', 'filing', 'version'
        ]
        
        # Non-skill indicators (things that are NOT skills)
        non_skill_indicators = [
            'photo', 'picture', 'logo', 'confidential', 'internal',
            'employee id', 'full name', 'position', 'department',
            'date hired', 'employment status', 'supervisor', 'manager remarks',
            'educational background', 'degree', 'course', 'institution', 
            'year completed', 'professional license', 'license number'
        ]
        
        # Score each section
        scored_sections = {}
        for section_name, content in sections.items():
            section_lower = section_name.lower()
            content_lower = content.lower()
            
            score = 0
            
            # Check section name for skill indicators
            for indicator in skill_indicators:
                if indicator in section_lower:
                    score += 3
                    break
            
            # Check content for skill indicators
            for indicator in skill_indicators:
                if indicator in content_lower:
                    score += 1
            
            # Check for bullet points (often skills)
            bullet_count = len(re.findall(r'[•\-\*]\s*[A-Za-z]', content))
            if bullet_count > 2:
                score += 2
            elif bullet_count > 0:
                score += 1
            
            # Check for common skill patterns
            if re.search(r'\b(?:proficient|experienced|skilled|expert)\b', content_lower):
                score += 2
            
            # Penalize non-skill sections
            for indicator in non_skill_indicators:
                if indicator in section_lower or indicator in content_lower:
                    score -= 2
                    break
            
            # ============ FIX: hard-exclude known metadata/table sections ============
            # These sections describe classification metadata or project tables,
            # not skills — but generic substrings like 'competenc', 'document',
            # 'management', 'control', 'experience', 'project' cause them to
            # incorrectly score as skill sections.
            METADATA_SECTION_MARKERS = (
                'classification', 'primary role', 'functional area',
                'specialization category', 'experience category',
                'relevant project experience', 'project name'
            )
            if any(marker in section_lower for marker in METADATA_SECTION_MARKERS):
                score -= 10
            # ============================================================================

            scored_sections[section_name] = {
                'content': content,
                'score': score,
                'is_skill_section': score >= 3  # Threshold learned from data
            }
        
        # ============ STEP 3: Extract from skill sections ============
        for section_name, section_data in scored_sections.items():
            if not section_data['is_skill_section']:
                continue
            
            content = section_data['content']
            
            # Extract bullet points
            bullet_items = re.findall(r'[•\-\*]\s*([^\n•\-\*]+)', content)

            # ============ FIX: only fall back to plain lines for list-style sections ============
            # A section is "list-style" if it's short, punchy lines (skills/tools),
            # not flowing prose (Professional Summary). Guard on: no sentence-ending
            # periods mid-content, and average line length typical of a skill label
            # rather than a full sentence.
            content_lines = [ln.strip() for ln in content.split('\n') if ln.strip()]
            is_list_style = (
                bool(content_lines)
                and sum(1 for ln in content_lines if ln.endswith('.')) == 0
                and sum(len(ln.split()) for ln in content_lines) / len(content_lines) <= 8
            )

            if is_list_style:
                plain_lines = [
                    ln for ln in content_lines
                    if ln not in bullet_items and ln.lower() != section_name.lower()
                ]
                for clean in plain_lines:
                    if 3 < len(clean) < 100 and not self._is_non_skill(clean):
                        whole_phrase_candidates.add(clean)
            # ==============================================================================================
            
            if bullet_items:
                for item in bullet_items:
                    clean = item.strip()
                    if 3 < len(clean) < 100 and clean:
                        # Filter out non-skills
                        if not self._is_non_skill(clean):
                            whole_phrase_candidates.add(clean)  # ← was candidates.add(clean)
            else:
                # If no bullet points, split by newlines or commas
                items = re.split(r'\n|,', content)
                for item in items:
                    clean = item.strip()
                    if 3 < len(clean) < 100 and clean:
                        if not self._is_non_skill(clean):
                            whole_phrase_candidates.add(clean)  # ← was candidates.add(clean)
        
        # ============ STEP 4: Extract from bullet points anywhere ============
        # ============ FIX: bullet marker must be at LINE START only ============
        # The old pattern `[•\-\*][ \t]*(...)` treated ANY hyphen as a bullet
        # marker, including hyphens inside compound words like "After-Sales"
        # or "Why-Why". That mid-word hyphen would end one match early and
        # immediately start a new "bullet" match right after it, shredding a
        # single skill into two fragments (e.g. "Customer Service and After"
        # + "Sales Support Systems"). Anchoring to line start (optional
        # leading whitespace) via MULTILINE fixes this.
        # The capture class also now includes ()- so a phrase isn't truncated
        # right before a parenthetical, e.g. "Uninterruptible Power Supply
        # (UPS) Systems" no longer gets cut to "Uninterruptible Power Supply".
        bullet_matches = re.findall(
            r'^[ \t]*[•\-\*][ \t]+([A-Za-z0-9 \t,&()\-]+)',
            text,
            re.MULTILINE
        )
        # ========================================================================
        for match in bullet_matches:
            clean = match.strip()
            if 3 < len(clean) < 100 and clean:
                if not self._is_non_skill(clean):
                    whole_phrase_candidates.add(clean)  # ← was candidates.add(clean)
        
        # ============ STEP 5: Extract noun phrases (spaCy) ============
        # Exclude EVERY detected section (skill or not) from the remainder —
        # not just skill sections. Table sections like "Relevant Project
        # Experience" were leaking through because they were only excluded via
        # a substring .replace() that silently fails when the row text doesn't
        # match byte-for-byte. Rebuilding remainder_text from only the truly
        # unclassified lines is more reliable than subtracting known content.
        classified_content = set()
        for section_data in scored_sections.values():
            for line in section_data['content'].split('\n'):
                classified_content.add(line.strip())

        remainder_lines = [
            ln for ln in text.split('\n')
            if ln.strip() and ln.strip() not in classified_content
        ]
        remainder_text = '\n'.join(remainder_lines)
        # ================================================================================

        doc = self.nlp(remainder_text)
        for chunk in doc.noun_chunks:
            chunk_text = chunk.text.strip()
            if 3 < len(chunk_text) < 50:
                if not self._is_non_skill(chunk_text): 
                    candidates.add(chunk_text)
        
        # ============ STEP 6: Extract from colon-separated lists ============
        colon_pattern = re.compile(r'([A-Z][a-z]+[ \t]+[A-Z][a-z]+(?:[ \t]+[A-Z][a-z]+)*)[ \t]*[:][ \t]*([A-Za-z0-9 \t,&]+)')

        # ============ FIX: structural PII guard ============
        # These are field labels, not skills — reject regardless of learned
        # feedback, since PII shouldn't require the model to be corrected first.
        PII_LABELS = {
            'full name', 'first name', 'last name', 'employee id',
            'employee number', 'date hired', 'contact number',
            'phone number', 'email address', 'immediate supervisor',
            'position', 'department', 'employment status',
            'primary role', 'functional area', 'experience category',
            'specialization category', 'employment date'
        }
        for match in colon_pattern.finditer(text):
            label = match.group(1).strip().lower()
            if label in PII_LABELS:
                continue
            value = match.group(2).strip()
            if 3 < len(value) < 100 and value:
                if not self._is_non_skill(value):
                    candidates.add(value)

        # ============ NEW: whole_phrase_candidates get light cleaning only, NO splitting ============
        # These came from actual bullet/line items in the document, so the full
        # phrase — however many words — is the real skill. Do not shred it.
        for candidate in whole_phrase_candidates:
            cleaned = self._clean_candidate_text(candidate)
            if not cleaned or len(cleaned) < 3:
                continue

            words = cleaned.split()
            if words and words[0].lower() in LEADING_CONNECTORS:
                continue
            if '/' in cleaned:
                continue

            candidates.add(cleaned)  # kept whole, regardless of word count
        # ================================================================================================

        # ============ FIX: final pass - drop anything still starting with a connector ============
        final_candidates = set()
        for c in candidates:
            words = c.split()
            if not words:
                continue
            if words[0].lower() in LEADING_CONNECTORS:
                continue
            if '/' in c:  # ← NEW: table/list separator artifact, never a real skill
                continue
            final_candidates.add(c)

        # ============ NEW: drop truncated-prefix duplicates ============
        # If two candidates are the same skill at different lengths — e.g.
        # "Uninterruptible Power Supply" vs "Uninterruptible Power Supply
        # Systems" — keep only the longer, complete one. A candidate is
        # considered a truncated duplicate only when it is an exact,
        # word-for-word PREFIX of another (longer) candidate, so unrelated
        # skills that merely share a first word are never affected.
        sorted_by_len = sorted(final_candidates, key=lambda s: len(s.split()), reverse=True)
        deduped = []
        for cand in sorted_by_len:
            cand_words = cand.lower().split()
            is_prefix_of_existing = any(
                len(cand_words) < len(kept.lower().split())
                and kept.lower().split()[:len(cand_words)] == cand_words
                for kept in deduped
            )
            if not is_prefix_of_existing:
                deduped.append(cand)
        final_candidates = set(deduped)
        # ======================================================================

        return final_candidates  # ← ONLY cleaned candidates, NO long phrases, NO leading connectors, NO stray "/", NO truncated duplicates
    
    def _clean_candidate_text(self, text):
        """Clean extracted candidate text"""
        if not text:
            return ""

        # ============ NEW: remove parenthetical asides entirely, FIRST ============
        # "(DMS)", "(Tracking Logs and Registers)" etc. are clarifying asides, not
        # part of the skill name. Doing this before other cleanup prevents the
        # old bug where a trailing ")" got stripped separately from its leading
        # "(", leaving orphaned junk like "(Dms" after title-casing.
        text = re.sub(r'\([^)]*\)', '', text)
        text = re.sub(r'[()]', '', text)
        # ============================================================================

        # ============ FIX: strip ANY leading/trailing junk characters ============
        # Old version only stripped '•', '-', '*' from the start, which is why
        # things like "(Tracking Logs" and "- Engineering Drawings" got through.
        # Also strips '/' now — table-separator artifacts like "/ Type Role".
        text = re.sub(r'^[\s•\-\*\(\)\[\]/]+', '', text) 
        text = re.sub(r'[\s•\-\*\(\)\[\]/]+$', '', text)
        # ===========================================================================

        # Remove brackets
        if text.startswith('[') and text.endswith(']'):
            text = text[1:-1]

        # ============ FIX: strip a leading connector word ============
        # This is what turns "And Archiving Systems" into "Archiving Systems".
        text = re.sub(
            r'^(?:' + '|'.join(LEADING_CONNECTORS) + r')\s+',
            '',
            text,
            flags=re.IGNORECASE
        )
        # ================================================================

        # Strip again in case removing the connector exposed more junk
        text = re.sub(r'^[\s•\-\*\(\)\[\]]+', '', text)
        
        # Remove trailing punctuation
        text = re.sub(r'[,;:]$', '', text)
        
        # Normalize whitespace
        text = ' '.join(text.split())
        
        # Normalize case (title case for display)
        if len(text.split()) > 1:
            text = text.title()
        
        return text
    
    def _is_obvious_non_skill(self, text):
        """
        DYNAMICALLY determine if text is obviously NOT a skill.
        Learns from user feedback - NO hardcoded lists!
        """
        if not text:
            return True
        
        text_lower = text.lower()
        words = text_lower.split()
        
      # ============ DYNAMIC FILTERS (Learned from feedback) ============
        
        # 1. Check if this exact phrase was rejected (learned)
        if text_lower in self.rejected_phrases:
            rejection_count = self.rejected_phrases[text_lower]
            if rejection_count >= 1:  # Rejected at least once
                return True
        
        # 2. Check if it's a single word that was rejected (learned)
        if len(words) == 1:
            if text_lower in self.rejected_single_words:
                if self.rejected_single_words[text_lower] >= 1:
                    return True
        
        # 3. Check if it's a name pattern that was rejected (learned)
        if 2 <= len(words) <= 3 and all(w[0].isupper() for w in words if w):
            for pattern in self.rejected_names:
                if text_lower in pattern:
                    if self.rejected_names[pattern] >= 1:
                        return True
        
        # 4. Check if it's a fragment pattern that was rejected (learned)
        connectors = ['and', 'for', 'with', 'to', 'of']
        if any(text_lower.startswith(c) for c in connectors):
            for pattern in self.rejected_fragments:
                if text_lower in pattern:
                    if self.rejected_fragments[pattern] >= 1:
                        return True
        
        # 5. Check if it contains learned skill keywords (from approved skills)
        if self.learned_skill_keywords:
            for keyword in self.learned_skill_keywords:
                if keyword in text_lower:
                    return False  # Contains skill keyword, likely a skill
                
                
        # ============ SAFE STATIC FILTERS ============
        # These are safe because they're structural, not semantic
        # Months, dates, numbers - these never change
        months = {'january', 'february', 'march', 'april', 'may', 'june',
                  'july', 'august', 'september', 'october', 'november', 'december',
                  'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'}
        if text_lower in months or any(month in text_lower for month in months):
            return True
        
        # Education words (structural)
        education = {'bachelor', 'master', 'phd', 'doctorate', 'degree', 'diploma',
                     'certificate', 'certification', 'course', 'college', 'university'}
        if any(word in text_lower for word in education):
            return True
        
        # Length checks (structural)
        if len(text) < 3:
            return True
        
        # Date patterns (structural)
        date_patterns = [
            r'\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b',
            r'\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b',
            r'\b\d{4}[/-]\d{1,2}[/-]\d{1,2}\b'
        ]
        for pattern in date_patterns:
            if re.search(pattern, text, re.IGNORECASE):
                return True
        
        return False

    def _is_non_skill(self, text):
        """Dynamically determine if text is likely NOT a skill"""
        if not text:
            return True
        
        text_lower = text.lower()
        
        # Learned non-skill patterns (from feedback_log)
        non_skill_patterns = {
            'n/a', 'none', 'page', 'date', 'employee', 'id', 'photo', 
            'confidential', 'internal use', 'company logo', 'photo here',
            'insert', 'position', 'department', 'supervisor', 'manager',
            'remarks', 'classification', 'category', 'functional area',
            'degree', 'course', 'institution', 'university', 'college',
            'license', 'certificate', 'year', 'completed', 'obtained',
            # ============ NEW: structural/employment-status/geo fragments ============
            'regular', 'part-time', 'full-time', 'contractual', 'probationary',
            'form', 'the philippines', 'republic of', 'internal_cv',
            # =============================================================================
        }
        
        # Check against learned patterns
        if any(pattern in text_lower for pattern in non_skill_patterns):
            return True
        
        # Check length (too short or too long)
        if len(text) < 3 or len(text) > 100:
            return True
        
        # Check if it's a date or number
        if re.match(r'^\d', text) or re.search(r'\d{4}', text):
            return True
        
        # Check if it's all uppercase (often headers)
        if text.isupper() and len(text) > 5:
            return True
        
        return False
        
    def _normalize_skill_text(self, text):
        """
        Normalize text for KB/exact-match comparison only (display text is
        untouched). Collapses whitespace and strips punctuation so trivial
        formatting differences ("Microsoft Word." vs "microsoft word") don't
        cause a KB hit to be missed and fall through to Pending.
        """
        text = text.lower().strip()
        text = re.sub(r'[^\w\s]', '', text)
        return ' '.join(text.split())

    # In module2_nlp.py - Updated predict method

    def _is_likely_skill(self, candidate):
        """
        Determine if candidate is a skill using multi-layer decision.
        
        Layers:
        1. Knowledge Base -> Auto-approve if already known
        2. ML Classifier -> Predict confidence for NEW skills
        3. Fallback Rules -> Only when ML is OFF or fails. Conservative
           3-way decision (reject / approve / needs_review) - see
           _fragment_signal()/_looks_like_job_title() below. This layer
           never sees candidates when ML is active and predicts
           successfully; the ML thresholds (0.85/0.65/0.40) are untouched.
        """
        if not candidate or len(candidate) < 3:
            return False
        
        candidate_lower = self._normalize_skill_text(candidate)
        if self._is_obvious_non_skill(candidate):
            print(f"[REJECT-LEARNED] '{candidate}' -> previously rejected")
            return False
        words = candidate_lower.split()

        # ============ FIX: reject leading-connector fragments outright ============
        if words and words[0] in LEADING_CONNECTORS:
            return False
        # =============================================================================
        
        # ============================================================
        # LAYER 1: Knowledge Base - Auto-approve known skills
        # ============================================================
        normalized_kb = {self._normalize_skill_text(s) for s in self.learned_skills}
        if candidate_lower in normalized_kb:
            print(f"[KB] '{candidate}' -> Already in knowledge base (auto-approved)")
            return candidate_lower
        
        # ============================================================
        # LAYER 2: ML Classifier - Predict for NEW skills
        # ============================================================
        if self.use_ml:
            try:
                result = self.classifier.predict(candidate_lower)
                is_skill = result['prediction'] == 1
                confidence = result['confidence']
                # Carried through to callers for EVERY ML outcome (approve,
                # needs_review, and reject) so the original ML
                # prediction/confidence isn't discarded regardless of what
                # happens to the candidate next. Approved/needs_review
                # skills carry this through to
                # nlp.auto_approved_predictions / nlp.needs_review_predictions
                # -> skill_predictions -> feedback_training.prediction/
                # confidence. Rejected candidates have no downstream
                # table/UI to persist this to (they're discarded entirely,
                # same as before) - the print statements below remain the
                # only record, same as always.
                ml_meta = {
                    'prediction': result.get('label', 'Skill' if is_skill else 'Not Skill'),
                    'confidence': confidence
                }
                
                if is_skill and confidence >= 0.85:
                    print(f"[ML] '{candidate}' -> High confidence skill ({confidence:.2%})")
                    master = self.get_master_skill(candidate_lower)
                    if master != candidate_lower:
                        print(f"[ML] Normalized: '{candidate}' -> '{master}'")
                        return master, 'auto_approved', ml_meta
                    return candidate, 'auto_approved', ml_meta
                
                elif is_skill and confidence >= 0.65:
                    print(f"[ML] '{candidate}' -> Likely skill ({confidence:.2%}) - needs review")
                    return candidate, 'needs_review', ml_meta
                
                elif confidence < 0.40:
                    print(f"[ML]  '{candidate}' -> Not skill ({confidence:.2%}) - rejected")
                    return False
                
                else:
                    print(f"[ML]  '{candidate}' -> Uncertain ({confidence:.2%}) - show for review")
                    return candidate, 'needs_review', ml_meta
                    
            except Exception as e:
                print(f"[ML] Prediction failed: {e}. Using fallback.", file=sys.stderr)
        
        # ============================================================
        # LAYER 3: Fallback Rules (only when ML is OFF or fails)
        # Conservative reject / approve / needs_review decision. Never
        # blindly approves a candidate just because doc_count < 3 - that
        # only widens the length allowance for the auto-approve bucket
        # slightly (there's no word-frequency history yet to lean on for
        # the first few documents), everything else below still applies.
        # ============================================================
        doc_count = self.stats.get('documents_analyzed', 0) if hasattr(self, 'stats') else 0

        # ---- Step A: fragment / structured-artifact check FIRST, before
        # any word-frequency evidence is consulted - a sentence fragment or
        # a raw field-extraction artifact should never be approved just
        # because some of its individual words happen to look "skill-like"
        # in the learned word-frequency history. ----
        fragment_signal = self._fragment_signal(candidate, candidate_lower, words)
        if fragment_signal == 'reject':
            print(f"[FALLBACK] '{candidate}' -> Rejected (sentence-fragment/structured-artifact pattern)")
            return False
        if fragment_signal == 'ambiguous':
            print(f"[FALLBACK] '{candidate}' -> Needs review (fragment-like pattern, unconfirmed)")
            return candidate, 'needs_review', None

        # ---- Step B: job-title heuristic (flag only, doesn't decide alone) ----
        is_job_title_like = self._looks_like_job_title(words)

        non_skill_score = sum(1 for w in words if self.non_skill_patterns.get(w, 0) > 3)
        skill_score = sum(1 for w in words if self.skill_candidates.get(w, 0) > 2)
        
        if non_skill_score > 0 and skill_score == 0:
            print(f"[FALLBACK] '{candidate}' -> Rejected (matches known non-skill word pattern)")
            return False

        if is_job_title_like and skill_score == 0:
            # Reads like a role/title (e.g. "Senior CAD Drafter", "Lighting
            # Designer") and nothing in the learned word-frequency data
            # confirms it's actually a skill - let a human decide instead
            # of guessing either way.
            print(f"[FALLBACK] '{candidate}' -> Needs review (job-title-like, unconfirmed)")
            return candidate, 'needs_review', None

        if skill_score > 0:
            # Positive word-frequency evidence from real learned history
            # outweighs the generic job-title heuristic.
            print(f"[FALLBACK]  '{candidate}' -> Skill pattern matched")
            return candidate

        # Obvious administrative/form-field junk (unchanged from the
        # original doc_count<3 branch's skip list, now applied to every
        # fallback decision rather than only the first few documents).
        # Matched as whole words/phrases (word-boundary), not substrings -
        # a naive substring check would false-positive on ordinary words
        # like "candidate" (contains "id") or "provide" (contains "id").
        skip_words = ['n/a', 'none', 'page', 'date', 'employee', 'id', 'photo',
                      'confidential', 'internal use', 'company logo']
        if any(re.search(r'\b' + re.escape(skip) + r'\b', candidate_lower) for skip in skip_words):
            print(f"[FALLBACK] '{candidate}' -> Rejected (administrative/form-field term)")
            return False
        
        # Conservative default: only short, clean candidates with no
        # fragment/job-title signal and no negative evidence get approved
        # here. The word-count gate (2-5) plus the fragment/job-title
        # checks above already do the real filtering, so this length check
        # is just a loose secondary sanity net against pathological
        # candidates (e.g. a handful of unusually long tokens) rather than
        # the primary defense - it's wide enough to comfortably fit real
        # 5-word technical compound terms like "Industrial Electrical
        # Control System Design" (43 chars). doc_count < 3 widens it
        # slightly further (no word-frequency history yet to lean on).
        max_len = 60 if doc_count < 3 else 50
        if 2 <= len(words) <= 5 and len(candidate_lower) < max_len:
            print(f"[FALLBACK]  '{candidate}' -> Accepted (short, clean candidate)")
            return candidate
        
        if len(words) >= 2:
            print(f"[FALLBACK] '{candidate}' -> Needs review (ambiguous length/pattern)")
            return candidate, 'needs_review', None
        
        return False

    def _fragment_signal(self, candidate, candidate_lower, words):
        """
        Conservative sentence-fragment / structured-field-artifact
        detector for Layer 3 fallback only. Returns 'reject', 'ambiguous',
        or None (no signal). Deliberately generic (no hardcoded phrases) -
        catches things like a full resume bullet sentence or a raw
        "field_name field label: value" extraction artifact, while leaving
        legitimate multi-word technical skill names (e.g. "Industrial
        Electrical Control System Design") untouched.
        """
        n = len(words)
        if n == 0:
            return None

        # ---- Tier 1: near-certain structural artifacts -> reject ----
        if '_' in candidate_lower:
            return 'reject'

        # Self-repeating field-name + value pattern, e.g.
        # "primary_role primary role: ..." normalizes (underscore kept,
        # ':' stripped) to "primary_role primary role senior cad drafter
        # lighting designer" - expanding '_' back to a space and checking
        # for an immediate repeat catches this generically.
        collapsed_words = candidate_lower.replace('_', ' ').split()
        for k in (1, 2, 3):
            if len(collapsed_words) >= 2 * k and collapsed_words[:k] == collapsed_words[k:2 * k]:
                return 'reject'

        if n >= 10:
            return 'reject'

        connector_count = sum(1 for w in words if w in FRAGMENT_CONNECTORS)
        if n >= 6 and connector_count >= 2:
            return 'reject'

        # ---- Tier 2: softer signals -> ambiguous, let a human decide ----
        raw = candidate.strip()
        if raw.endswith('.') or ':' in candidate:
            return 'ambiguous'
        if n >= 6 and connector_count >= 1:
            return 'ambiguous'

        return None

    def _looks_like_job_title(self, words):
        """
        Heuristic only - flags candidates that read like a role/title
        (e.g. "Senior CAD Drafter", "Lighting Designer") for Layer 3
        fallback so they can be routed to needs_review instead of guessed
        at, rather than automatically becoming a skill. Deliberately
        narrow: only short phrases (<=4 words) ending in a common role
        noun trigger this, so legitimate technical phrases that merely
        contain (but don't end with) a similar word are unaffected, and
        this never overrides positive word-frequency evidence (skill_score)
        in the caller.
        """
        if not words or len(words) > 4:
            return False
        last_word = words[-1].rstrip('.,')
        return last_word in JOB_TITLE_ROLE_NOUNS
    
    # ============ ANALYZE STATISTICS ============
    
    def _analyze_statistics(self, text, skills):
        """Learn statistical patterns from text and skills"""
        words = re.findall(r'\b[a-z]{3,}\b', text.lower())
        self.word_frequency.update(words)
        
        phrases = self._extract_phrases(text)
        self.phrase_frequency.update(phrases)
        
        # Track which words appear in skills
        skill_words = set()
        for skill in skills:
            skill_words.update(skill.lower().split())
        
        # Update skill candidates (words that appear in skill contexts)
        for word in words:
            if word in skill_words:
                self.skill_candidates[word] += 1
        
        # Learn skill patterns - words that frequently appear with skills
        for skill in skills:
            # Find context around skill
            context_pattern = re.compile(r'.{0,30}' + re.escape(skill) + r'.{0,30}', re.IGNORECASE)
            for match in context_pattern.finditer(text.lower()):
                context = match.group()
                # Extract words around the skill
                for word in context.split():
                    if word not in skill_words and len(word) > 2:
                        # Words near skills might be skill indicators
                        self.skill_patterns[word] += 1
        
        # Learn non-skill patterns - words that appear often but never in skills
        common_words = [w for w, c in self.word_frequency.most_common(200) if c > 3]
        for word in common_words:
            if word not in skill_words and word not in self.skill_candidates:
                self.non_skill_patterns[word] += 1
    
    # ============ DYNAMIC MERGING (UPDATED - KEEPS ALL SKILLS) ============
    
    def merge_synonyms_dynamically(self, caller='unknown'):
        """
        100% dynamic merge - stores aliases, never deletes skills.
        All skills remain in learned_skills for employee records.

        PERFORMANCE: this is still an all-pairs comparison (O(n^2) pairs),
        but each pair is now cheap unless it's a genuinely plausible alias
        candidate. See _should_merge()'s pre-filters and _evaluate_equivalence()
        / _get_cached_nlp_doc() for the caching that makes this possible. At
        ~233 skills (~27k pairs) this used to time out because the same
        skill text was being re-parsed by spaCy up to n-1 times with no
        caching (~54k uncached spaCy calls); the same run now costs one
        spaCy parse per unique skill (~n) plus a cheap similarity lookup
        only for the small number of pairs that pass the lexical pre-filter.
        Timing/candidate-funnel stats are collected in `stats` and stored on
        self.last_merge_stats for diagnostics.

        `caller` is a free-text label identifying which code path triggered
        this run (e.g. '_learn_from_document', 'learn_from_feedback') -
        pure diagnostics, logged in [MERGE STATS] and self.last_merge_stats,
        does not affect the merge decision in any way.
        """
        if len(self.learned_skills) < 3:
            return 0

        NLPProcessor._merge_invocation_count += 1
        invocation_number = NLPProcessor._merge_invocation_count

        # ============ DIAGNOSTIC ONLY: is this the exact same skill set as last time? ============
        # Does NOT skip or alter the run - just reports it, so duplicate-work
        # investigations (like this one) don't have to guess from timing alone
        # whether two merge runs were genuinely redundant.
        current_signature = hashlib.md5('|'.join(sorted(self.learned_skills)).encode('utf-8')).hexdigest()
        skillset_unchanged = (current_signature == self._last_merge_skillset_signature)
        print(f"[MERGE-DIAG] Invocation #{invocation_number} called by '{caller}' "
              f"(pid={os.getpid()}) - skill set unchanged since last merge: {skillset_unchanged}",
              file=sys.stderr)
        # ============================================================================================

        start_time = time.perf_counter()

        # Fresh per-run caches: doc_texts/skill_dictionary can change inside
        # learn_from_data() below, so don't trust caches from a previous run.
        self._clear_merge_run_caches()

        # Learn from existing data first
        self.learn_from_data()

        skills_list = list(self.learned_skills)
        n = len(skills_list)
        merged_count = 0
        merged_details = []
        used = set()

        stats = {
            'skill_count': n,
            'caller': caller,
            'invocation_number': invocation_number,
            'skillset_unchanged_since_last_merge': skillset_unchanged,
            'total_possible_pairs': 0,       # incremented inside _should_merge
            'prefilter_rejected': 0,         # incremented inside _should_merge
            'sent_to_equivalence_check': 0,  # incremented inside _should_merge
            'aliases_accepted': 0,           # final-validation pass, below
            'aliases_rejected': 0,           # final-validation pass, below
            'duration_seconds': None,
        }

        for i in range(len(skills_list)):
            if skills_list[i] in used:
                continue
            
            master = skills_list[i]
            group = [master]
            used.add(master)
            
            for j in range(i + 1, len(skills_list)):
                if skills_list[j] in used:
                    continue
                
                if self._should_merge(master, skills_list[j], stats=stats):
                    group.append(skills_list[j])
                    used.add(skills_list[j])
            
            if len(group) > 1:
                # Choose best master dynamically
                for skill in group:
                    candidate = self._choose_master(master, skill)
                    if candidate != master:
                        master = candidate
                
                # ============ NEW: KEEP ALL SKILLS ============
                # Build alias list for this master
                aliases = []
                for skill in group:
                    if skill != master:
                        aliases.append(skill)
                        
                        # Update dictionary if master doesn't have category
                        if master not in self.skill_dictionary and skill in self.skill_dictionary:
                            self.skill_dictionary[master] = self.skill_dictionary[skill]
                
                # Store aliases in knowledge base (in-memory) and persist to
                # Supabase — but ONLY after a final is_true_alias() check
                # right before the write (requirement: validate immediately
                # before _save_alias_to_db, regardless of how the pair got
                # grouped together), and only if it doesn't create a
                # conflicting alias->master mapping.
                if aliases and master in self.learned_skills:
                    for alias in aliases:
                        accepted, category, reasons, sig = self._evaluate_equivalence(master, alias)
                        reason_text = '; '.join(reasons)
                        similarity_val = sig.get('similarity')
                        similarity_display = f"{similarity_val:.2f}" if similarity_val is not None else "N/A"

                        if not accepted:
                            stats['aliases_rejected'] += 1
                            print(f"[ALIAS] REJECTED at final validation before save:\n"
                                  f"  \"{alias}\" <-> \"{master}\"\n"
                                  f"  semantic_similarity={similarity_display}\n"
                                  f"  category={category}\n"
                                  f"  reason={reason_text}")
                            self._record_merge_decision(alias, master, False, similarity=similarity_val, reason=reason_text)
                            continue

                        # One alias must not silently belong to multiple
                        # unrelated masters — check the in-memory lookup too
                        # (the DB-level check happens again in
                        # _save_alias_to_db as a second line of defense).
                        final_master = master
                        verified_equivalent_masters = False
                        existing_master = self.alias_lookup.get(alias)
                        if existing_master and existing_master != master:
                            masters_equivalent, _, equiv_reasons, _ = self._evaluate_equivalence(existing_master, master)
                            if not masters_equivalent:
                                print(f"[ALIAS] CONFLICT — rejected:\n"
                                      f"  \"{alias}\" already belongs to master \"{existing_master}\"\n"
                                      f"  refusing to reassign to \"{master}\"\n"
                                      f"  reason=masters not verified equivalent ({'; '.join(equiv_reasons)})")
                                continue
                            final_master = existing_master  # masters verified equivalent — keep the existing canonical master
                            verified_equivalent_masters = True

                        self.skill_aliases.setdefault(final_master, [])
                        if alias not in self.skill_aliases[final_master]:
                            self.skill_aliases[final_master].append(alias)
                        self.alias_lookup[alias] = final_master

                        merged_count += 1
                        stats['aliases_accepted'] += 1
                        merged_details.append(f"{alias} -> {final_master} (alias)")
                        self._record_merge_decision(
                            alias, final_master, True,
                            similarity=similarity_val, is_alias=True, reason=reason_text
                        )

                        print(f"[ALIAS] ACCEPTED:\n"
                              f"  \"{alias}\" <-> \"{final_master}\"\n"
                              f"  semantic_similarity={similarity_display}\n"
                              f"  lexical_similarity={sig.get('meaningful_token_overlap', 0):.2f}\n"
                              f"  reason={reason_text}")

                        self._save_alias_to_db(
                            final_master, alias, similarity_val,
                            verified_equivalent_masters=verified_equivalent_masters
                        )
                
                # Ensure master is in dictionary
                if master not in self.skill_dictionary:
                    self.skill_dictionary[master] = 'Other'
        
        if merged_count > 0:
            self._discover_categories()
            self._save_ephemeral_json()
            print(f"[NLP] Dynamically merged {merged_count} skills (kept all as aliases)")
            for detail in merged_details[:5]:
                print(f"   {detail}")
            if len(merged_details) > 5:
                print(f"   ... and {len(merged_details) - 5} more")

        stats['duration_seconds'] = round(time.perf_counter() - start_time, 3)
        total_pairs_math = (n * (n - 1)) // 2
        pct_prefiltered = (
            100.0 * stats['prefilter_rejected'] / stats['total_possible_pairs']
            if stats['total_possible_pairs'] else 0.0
        )
        self.last_merge_stats = dict(stats)
        # Update the signature AFTER this run so the next invocation (in this
        # same process) can report whether anything actually changed.
        self._last_merge_skillset_signature = current_signature
        print(
            "[MERGE STATS] "
            f"caller={caller} "
            f"invocation={invocation_number} "
            f"skillset_unchanged_since_last_merge={skillset_unchanged} "
            f"skills={n} "
            f"possible_pairs={total_pairs_math} "
            f"pairs_evaluated={stats['total_possible_pairs']} "
            f"prefilter_rejected={stats['prefilter_rejected']} ({pct_prefiltered:.1f}%) "
            f"sent_to_equivalence_check={stats['sent_to_equivalence_check']} "
            f"aliases_accepted={stats['aliases_accepted']} "
            f"aliases_rejected={stats['aliases_rejected']} "
            f"duration_seconds={stats['duration_seconds']}"
        )

        return merged_count
    
    # ============ CATEGORY DISCOVERY ============
    
    def _discover_categories(self):
        """Dynamically discover categories from skills"""
        if len(self.learned_skills) < 5:
            return
        
        # Try to use existing categories first
        if self.skill_categories:
            # Check if skills fit existing categories
            categorized = defaultdict(list)
            for skill in self.learned_skills:
                if skill in self.skill_dictionary:
                    category = self.skill_dictionary[skill]
                    if category in self.skill_categories:
                        categorized[category].append(skill)
            
            # If most skills are categorized, keep existing
            total_categorized = sum(len(s) for s in categorized.values())
            if total_categorized / len(self.learned_skills) > 0.6:
                self.skill_categories = dict(categorized)
                return
        
        # Create vectors for skills
        skill_vectors = {}
        for skill in self.learned_skills:
            doc = self.nlp(skill)
            if doc.vector.any():
                skill_vectors[skill] = doc.vector
        
        if len(skill_vectors) < 5:
            return
        
        # Cluster skills
        vectors = np.array(list(skill_vectors.values()))
        n_clusters = min(len(vectors) // 3, 8)
        if n_clusters < 2:
            n_clusters = 2
        
        try:
            kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
            labels = kmeans.fit_predict(vectors)
            
            # Group by cluster
            clusters = defaultdict(list)
            skill_list = list(skill_vectors.keys())
            for i, label in enumerate(labels):
                clusters[label].append(skill_list[i])
            
            # Name clusters using most common meaningful words
            new_categories = {}
            for cluster_id, cluster_skills in clusters.items():
                # Get all words from skills in cluster
                words = []
                for skill in cluster_skills:
                    words.extend(skill.split())
                
                # Find most common words
                common_words = Counter(words).most_common(3)
                if common_words:
                    # Use the most distinctive word as category name
                    category_name = common_words[0][0].capitalize()
                    new_categories[category_name] = cluster_skills
                else:
                    new_categories[f"Category_{cluster_id + 1}"] = cluster_skills
            
            # Update categories
            self.skill_categories = new_categories
            for category, skills in new_categories.items():
                for skill in skills:
                    self.skill_dictionary[skill] = category
            
            self.stats['new_categories_created'] += 1
            
        except Exception as e:
            print(f"[NLP] Category discovery error: {e}")
    
    # ============ FEEDBACK LEARNING ============
    
    def learn_from_feedback(self, approved_skills, rejected_skills,
                             document_id=None, employee_id=None, reviewed_by=None):
        """Learn from user feedback - updates the LOCAL knowledge base
        (learned_skills / aliases / keyword learning / rejection patterns)
        in memory and in the ephemeral JSON cache.

        NOTE: this method intentionally does NOT insert rows into the
        Supabase `feedback_training` table for the approved/rejected
        skills themselves. feedbackController.js's saveSkillFeedback is
        the single source of truth for those rows (it has the real
        reviewed_by/reviewed_at/document_id/employee_id context plus the
        original ML prediction/confidence via skill_predictions) — writing
        them again here produced duplicate, context-less rows that could
        never satisfy the human-reviewed criteria. document_id/employee_id/
        reviewed_by are still accepted (and still forwarded to
        _save_component_to_db below) since atomic-component decomposition
        is a distinct, additive feedback_training write, not a duplicate
        of the approve/reject event.

        This method also intentionally does NOT retrain the ML classifier
        inline anymore — retraining now only happens through the gated
        ≥20-new-human-reviewed-rows mechanism (see skill_classifier.py's
        train_and_replace() and runner.py's retrain_if_needed), triggered
        from feedbackController.js after it writes to feedback_training."""

        # feedback_log is already populated in memory from _load_data()
        # (queried from Supabase on startup) — no file read needed here.
        
        # ============ APPEND NEW FEEDBACK (local knowledge base only) ============
        for skill in approved_skills:
            if skill not in self.feedback_log.get('approved', []):
                if 'approved' not in self.feedback_log:
                    self.feedback_log['approved'] = []
                self.feedback_log['approved'].append(skill)
                self.skill_importance[skill] = self.skill_importance.get(skill, 0) + 1

                words = skill.lower().split()
                for word in words:
                    if len(word) > 3 and word not in self.learned_skill_keywords:
                        self.learned_skill_keywords.add(word)
                        print(f"[LEARN] Learned skill keyword: '{word}' from '{skill}'")

                print(f"[FEEDBACK] Approved (local KB only, feedback_training already written by backend): {skill}")
        
        for skill in rejected_skills:
            if not skill:
                continue

            if skill not in self.feedback_log.get('rejected', []):
                if 'rejected' not in self.feedback_log:
                    self.feedback_log['rejected'] = []
                self.feedback_log['rejected'].append(skill)
                self.skill_importance[skill] = self.skill_importance.get(skill, 0) - 1

            # ============ LEARN FROM REJECTIONS ============
            skill_lower = skill.lower()
            words = skill_lower.split()

            self.rejected_phrases[skill_lower] = self.rejected_phrases.get(skill_lower, 0) + 1
            if len(words) == 1 and len(skill_lower) > 2:
                self.rejected_single_words[skill_lower] = self.rejected_single_words.get(skill_lower, 0) + 1
            if 2 <= len(words) <= 3 and all(w[0].isupper() for w in words if w):
                self.rejected_names[skill_lower] = self.rejected_names.get(skill_lower, 0) + 1
            connectors = ['and', 'for', 'with', 'to', 'of']
            if any(skill_lower.startswith(c) for c in connectors):
                self.rejected_fragments[skill_lower] = self.rejected_fragments.get(skill_lower, 0) + 1

            print(f"[FEEDBACK] Rejected (local KB only, feedback_training already written by backend): {skill}")
        
        # Don't overwrite categories for existing skills
        for skill in approved_skills:
            skill_key = skill.strip().lower() if skill else ''
            if skill_key:
                if skill_key not in self.learned_skills:
                    self.learned_skills.add(skill_key)
                    self.skill_dictionary[skill_key] = 'Other'
                    self._save_skill_to_db(skill_key, 'Other')
                    print(f"[NLP] Added new skill: {skill_key}")
                else:
                    if skill_key not in self.skill_dictionary:
                        self.skill_dictionary[skill_key] = 'Other'
                    print(f"[NLP] Skill already exists: {skill_key} (keeping category: {self.skill_dictionary.get(skill_key, 'Other')})")

                # ============ SPLIT COMPOUND SKILL INTO ATOMIC COMPONENTS ============
                # Runs on every approval (new or already-known skill) so
                # skill_components stays populated even for skills approved
                # before this feature existed. The original (non-lowercased)
                # skill text is used so components keep their display casing.
                components = self._split_into_atomic_skills(skill.strip())
                if components:
                    self._save_component_to_db(
                        skill_key, components, self.skill_dictionary.get(skill_key, 'Other'),
                        document_id=document_id, employee_id=employee_id, reviewed_by=reviewed_by
                    )
                # ========================================================================
                    
        # Re-run merge (this will create aliases, not delete)
        if len(self.learned_skills) > 5:
            merged = self.merge_synonyms_dynamically(caller='learn_from_feedback')
            if merged > 0:
                print(f"[NLP] Auto-merged {merged} duplicate skills (kept as aliases)")
        
        # ============ NOTE: ML retraining removed from here ============
        # Retraining used to fire inline on every feedback submission once
        # total_feedback >= 5, using in-memory feedback_log (not validated
        # against reviewed_by/reviewed_at, no threshold, no candidate/
        # evaluate/replace safety, and the trained model was never
        # persisted to skill_classifier.pkl). That's replaced by the gated
        # ≥20-new-human-reviewed-rows flow: see runner.py's
        # "retrain_if_needed" command and skill_classifier.py's
        # train_and_replace(), invoked by feedbackController.js after it
        # writes the reviewed row(s) to feedback_training.
        # =================================================================
        
        self._save_ephemeral_json()
        return len(approved_skills)
    
    # ============ SIMILARITY CALCULATION ============
    
    def _calculate_similarity(self, skill1, skill2):
        """Calculate semantic similarity between two skills using word vectors.

        PERFORMANCE: uses _get_cached_nlp_doc() so the same skill text is
        only ever run through the spaCy pipeline once per process, no
        matter how many pairs it's compared in. The actual similarity()
        call is a cheap vector op once both docs are cached."""
        try:
            doc1 = self._get_cached_nlp_doc(skill1)
            doc2 = self._get_cached_nlp_doc(skill2)

            if doc1 is None or doc2 is None:
                return 0.0
            if not doc1.vector.any() or not doc2.vector.any():
                return 0.0
            
            return doc1.similarity(doc2)
        except:
            return 0.0
    
    # ============ UTILITY METHODS ============
    
    def _extract_phrases(self, text):
        """Extract 2-3 word phrases"""
        words = text.split()
        phrases = []
        
        for i in range(len(words) - 1):
            phrase = f"{words[i]} {words[i+1]}"
            if 3 < len(phrase) < 30:
                phrases.append(phrase)
        
        for i in range(len(words) - 2):
            phrase = f"{words[i]} {words[i+1]} {words[i+2]}"
            if 4 < len(phrase) < 40:
                phrases.append(phrase)
        
        return phrases
    
    def clean_text(self, raw_text):
        """Clean text"""
        text = ' '.join(raw_text.split())
        text = re.sub(r'[^\w\s.,!?\-/]', ' ', text)
        return ' '.join(text.split())
    
    def _learn_from_document(self, text, skills):
        """Learn from a document"""
        # Update statistics
        self._analyze_statistics(text, skills)
        
        # Add to corpus
        self.doc_texts.append(text)
        self.doc_skills.append(skills)
        if len(self.doc_texts) > self.max_docs:
            self.doc_texts.pop(0)
            self.doc_skills.pop(0)
        
        # Learn section names from this document
        self._learn_section_names()
        
        # Learn new skills (if auto-learning enabled)
        new_skills = []
        # Auto-learning is disabled by default - enable if desired
        # for skill in skills:
        #     if skill not in self.learned_skills:
        #         self.learned_skills.add(skill)
        #         new_skills.append(skill)
        #         self.stats['new_skills_learned'] += 1
        
        # Re-discover categories periodically
        if len(new_skills) > 0 or len(self.learned_skills) % 10 == 0:
            self._discover_categories()
        
        # Run dynamic merge (keeps all skills, creates aliases)
        if self.stats['documents_analyzed'] > 0 and len(self.learned_skills) > 5:
            print(f"[NLP] Running dynamic merge after {self.stats['documents_analyzed']} documents...")
            merged = self.merge_synonyms_dynamically(caller='_learn_from_document')
            if merged > 0:
                print(f"[NLP] Dynamically merged {merged} skills (kept as aliases)!")
        
        self.stats['documents_analyzed'] += 1
        
        # Save ephemeral state periodically (facts already persisted at write-time)
        if self.stats['documents_analyzed'] % 5 == 0:
            self._save_ephemeral_json()
        
        return new_skills
    
    # ============ MAIN EXTRACTION METHODS ============
    
    def extract_entities(self, text, structured_text=None):
        """Extract entities using learned patterns"""
        # ============ DEBUG: confirm KB state at extraction time ============
        # Temporary — remove once you've confirmed the KB is actually populated.
        print(f"[DEBUG] learned_skills count in memory: {len(self.learned_skills)}")
        print(f"[DEBUG] sample: {list(self.learned_skills)[:10]}")
        # =======================================================================
        cleaned_text = self.clean_text(text)
        doc = self.nlp(cleaned_text)
        
        # Extract candidates — prefer structured (line-preserved) text so section
        # detection and noun-chunking don't span across unrelated fields.
        candidates = self._extract_candidates(structured_text or text)

        valid_skills = []
        auto_approved = []
        needs_review = []
        # skill name -> {'prediction': 'Skill'/'Not Skill', 'confidence': float}
        # Preserves the original ML prediction for each needs-review skill so
        # it can flow through to the frontend/feedback endpoint unchanged.
        needs_review_predictions = {}
        # Same idea, for skills the ML classifier auto-approved (>= 0.85
        # confidence) - previously discarded entirely; now preserved so
        # ML-approved skills also carry their original prediction/confidence
        # through to feedback_training instead of ending up NULL there.
        auto_approved_predictions = {}
        
        for candidate in candidates:
            result = self._is_likely_skill(candidate)
            
            if isinstance(result, tuple):
                # 3-tuple: (skill_name, status, {prediction, confidence} | None)
                # status is 'needs_review' or 'auto_approved'.
                # 2-tuple kept as a defensive fallback in case any other code
                # path still returns the older shape.
                if len(result) == 3:
                    skill_name, status, ml_meta = result
                else:
                    skill_name, status = result
                    ml_meta = None
                if status == 'needs_review':
                    needs_review.append(skill_name)
                    valid_skills.append(skill_name)
                    if ml_meta is not None and skill_name not in needs_review_predictions:
                        needs_review_predictions[skill_name] = {
                            'prediction': ml_meta.get('prediction'),
                            'confidence': ml_meta.get('confidence')
                        }
                elif status == 'auto_approved':
                    auto_approved.append(skill_name)
                    valid_skills.append(skill_name)
                    if ml_meta is not None and skill_name not in auto_approved_predictions:
                        auto_approved_predictions[skill_name] = {
                            'prediction': ml_meta.get('prediction'),
                            'confidence': ml_meta.get('confidence')
                        }
            elif result:
                auto_approved.append(result)
                valid_skills.append(result)
                # No ml_meta here - came from the Knowledge Base or a
                # non-ML fallback pattern match, not an ML prediction, so
                # there's nothing to preserve (stays NULL downstream,
                # which is correct - it never had a prediction).
        
        # Learn from this document
        self._learn_from_document(text, valid_skills)
        
        entities = {
            'persons': [],
            'organizations': [],
            'dates': [],
            'licenses': [],
            'emails': [],
            'phones': [],
            'skills': sorted(valid_skills),
            'auto_approved': auto_approved,      # ← New: skills auto-approved
            'needs_review': needs_review,
            'needs_review_predictions': needs_review_predictions,   # ← original ML prediction+confidence per needs-review skill
            'auto_approved_predictions': auto_approved_predictions  # ← original ML prediction+confidence per ML-auto-approved skill
        }
        
        # NER
        for ent in doc.ents:
            if ent.label_ == 'PERSON':
                entities['persons'].append(ent.text)
            elif ent.label_ == 'ORG':
                entities['organizations'].append(ent.text)
            elif ent.label_ == 'DATE':
                entities['dates'].append(ent.text)
        
        # Licenses
        license_matches = self.prc_pattern.findall(text)
        entities['licenses'].extend(license_matches)
        
        # Emails and phones
        entities['emails'] = self.email_pattern.findall(text)
        entities['phones'] = self.phone_pattern.findall(text)
        
        # Update stats
        self.stats['total_processed'] += 1
        self.stats['total_skills_extracted'] += len(valid_skills)
        self.stats['total_licenses_found'] += len(license_matches)
        
        return entities
    
    def extract_skills_with_categories(self, text, structured_text=None):
        """Extract skills with categories"""
        entities = self.extract_entities(text, structured_text)
        skills = entities['skills']
        
        # Build categorized dictionary
        categorized = {}
        for skill in skills:
            # Get category (check if it's an alias first)
            if skill in self.alias_lookup:
                master = self.alias_lookup[skill]
                category = self.skill_dictionary.get(master, 'Other')
            else:
                category = self.skill_dictionary.get(skill, 'Other')
            
            if category not in categorized:
                categorized[category] = []
            if skill not in categorized[category]:
                categorized[category].append(skill)
        
        return {
            'skills': skills,
            'categorized': categorized,
            'auto_approved': entities.get('auto_approved', []),    # ← KEY FIX
            'needs_review': entities.get('needs_review', []),      # ← KEY FIX
            'needs_review_predictions': entities.get('needs_review_predictions', {}),
            'auto_approved_predictions': entities.get('auto_approved_predictions', {}),
            'total_skills': len(skills),
            'licenses': entities['licenses'],
            'persons': entities['persons'],
            'organizations': entities['organizations'],
            'emails': entities['emails'],
            'phones': entities['phones'],
            'new_skills_learned': self.stats['new_skills_learned'],
            'total_categories': len(self.skill_categories),
            'total_skills_in_db': len(self.learned_skills),
            'documents_analyzed': self.stats['documents_analyzed']
        }
    
    def prepare_db_records(self, employee_id, text, structured_text=None, extracted=None):
        """Prepare database records.

        `extracted`, when supplied, is the ALREADY-COMPUTED return value of
        extract_skills_with_categories() for this same document/text. This
        avoids re-running the full extraction pipeline (candidate extraction,
        _learn_from_document(), and a second merge_synonyms_dynamically()
        pass) a second time on the same document — previously this method
        unconditionally recomputed it even when the caller already had the
        result (see module3_integration.py's process_document_complete),
        which was the actual cause of duplicate merge invocations per
        document. Default remains None so any other existing caller that
        doesn't pass it keeps today's exact behavior.
        """
        extracted = extracted if extracted is not None else self.extract_skills_with_categories(text, structured_text)
        
        employee_update = {
            'employee_id': employee_id,
            'prc_license_num': extracted['licenses'][0] if extracted['licenses'] else None,
            'prc_verified': bool(extracted['licenses']),
            'skills_extracted': extracted['skills'],
            'last_updated': datetime.now().isoformat()
        }
        
        skills_master = []
        for category, skill_list in extracted['categorized'].items():
            for skill in skill_list:
                if skill:
                    skill_id = hashlib.md5(f"{skill}_{category}".encode()).hexdigest()[:8]
                    skills_master.append({
                        'skill_id': skill_id,
                        'skill_tag': skill,
                        'category': category,
                        'created_at': datetime.now().isoformat()
                    })
        
        employee_skills = []
        for skill_data in skills_master:
            bridge_id = hashlib.md5(f"{employee_id}_{skill_data['skill_id']}".encode()).hexdigest()[:8]
            employee_skills.append({
                'bridge_id': bridge_id,
                'employee_id': employee_id,
                'skill_id': skill_data['skill_id'],
                'extracted_at': datetime.now().isoformat()
            })
        
        self._save_ephemeral_json()

        return {
            'employee_update': employee_update,
            'skills_master': skills_master,
            'employee_skills': employee_skills,
            'summary': {
                'total_skills_found': len(skills_master),
                'licenses_found': len(extracted['licenses']),
                'categories_found': [cat for cat, skills in extracted['categorized'].items() if skills],
                'new_skills_learned': self.stats['new_skills_learned'],
                'total_skills_in_db': len(self.learned_skills)
            }
        }
    
    def get_stats(self):
        """Get statistics"""
        return {
            'total_documents_processed': self.stats['total_processed'],
            'total_skills_extracted': self.stats['total_skills_extracted'],
            'avg_skills_per_document': (
                self.stats['total_skills_extracted'] / self.stats['total_processed']
                if self.stats['total_processed'] > 0 else 0
            ),
            'total_licenses_found': self.stats['total_licenses_found'],
            'new_skills_learned': self.stats['new_skills_learned'],
            'new_categories_created': self.stats['new_categories_created'],
            'total_skills_in_database': len(self.learned_skills),
            'total_categories': len(self.skill_categories),
            'documents_analyzed': self.stats['documents_analyzed'],
            'learned_sections': len(self.learned_sections),
            'type_thresholds': self.type_thresholds,
            'alias_groups': len(self.skill_aliases),
            'total_aliases': len(self.alias_lookup),
            'rejected_phrases_count': len(self.rejected_phrases),
            'learned_keywords_count': len(self.learned_skill_keywords)
        }


# Example usage
if __name__ == "__main__":
    nlp = NLPProcessor()
    
    test_text = """
    Mark Anthony Reyes
    RESUME
    Objective: Seeking a position as a Drafting Technician.
    Skills: AutoCAD 2D, AutoCAD 3D, Architectural Drafting
    """
    
    result = nlp.extract_skills_with_categories(test_text)
    print("=" * 60)
    print("Extracted Skills:")
    print("=" * 60)
    for skill in result['skills']:
        print(f"  • {skill}")
    
    print("\n" + "=" * 60)
    print("Categories:")
    print("=" * 60)
    for category, skills in result['categorized'].items():
        print(f"\n{category}:")
        for skill in skills:
            print(f"  • {skill}")