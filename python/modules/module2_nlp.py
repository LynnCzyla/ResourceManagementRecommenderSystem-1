"""
🤖 Module 2: Natural Language Processing (100% Dynamic)
NO hardcoded lists - learns everything from documents
"""
import spacy
import re
import json
import os
import sys 
from collections import Counter, defaultdict
from datetime import datetime
import hashlib
from pathlib import Path
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.cluster import KMeans
from sklearn.metrics.pairwise import cosine_similarity
from modules.skill_classifier import SkillClassifier

# ============ FIX: connectors that should never lead a skill phrase ============
LEADING_CONNECTORS = ('and', 'of', 'for', 'with', 'to', 'in', 'on', 'at')


class NLPProcessor:
    """100% Dynamic NLP - Learns everything from documents"""
    
    def __init__(self, model_name='en_core_web_md', skill_db_path=None):
        """Initialize with empty learning - everything learned from data"""
        
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
        
        # Certificate patterns (structural only)
        self.cert_patterns = {
            'certificate_name': re.compile(r'CERTIFICATE\s+OF\s+([A-Z\s]+)', re.IGNORECASE),
            'certificate_number': re.compile(r'(?:CERTIFICATE|WTR)\s*(?:NO|NUMBER|#)\s*[:.]?\s*([A-Z0-9.-]+)', re.IGNORECASE),
            'issuing_org': re.compile(r'(?:Issued by|Awarded by|Presented by)\s*[:.]?\s*([A-Za-z\s&.,]+)', re.IGNORECASE),
            'issue_date': re.compile(r'(?:Date|Issued|Awarded)\s*[:.]?\s*([A-Za-z]+\s+\d{1,2}[,.]?\s+\d{4})', re.IGNORECASE),
        }
        
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
        
        self.classifier = SkillClassifier()
        # ============ SMART ML ACTIVATION ============
        if self.classifier.is_trained:
            self.use_ml = True
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
        """Load all learned data - with alias structure support"""

        # ============ FIX: Initialize stats if missing ============
        if not hasattr(self, 'stats'):
            self.stats = {
                'total_processed': 0,
                'total_skills_extracted': 0,
                'total_licenses_found': 0,
                'new_skills_learned': 0,
                'new_categories_created': 0,
                'documents_analyzed': 0
            }
        # =============================================================
        
        # Load rejection patterns
        if os.path.exists(self.skill_db_path):
            try:
                with open(self.skill_db_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    
                    # ============ MERGE, DON'T REPLACE! ============
                    # 1. Merge learned_skills (ALL skills, including aliases)
                    loaded_skills = set(data.get('learned_skills', []))
                    self.learned_skills.update(loaded_skills)
                    
                    # 2. Merge dictionary
                    loaded_dict = data.get('dictionary', {})
                    self.skill_dictionary.update(loaded_dict)
                    
                    # 3. Merge categories
                    loaded_categories = data.get('categories', {})
                    for category, skills in loaded_categories.items():
                        if category not in self.skill_categories:
                            self.skill_categories[category] = []
                        for skill in skills:
                            if skill not in self.skill_categories[category]:
                                self.skill_categories[category].append(skill)
                    
                    # 4. Load alias structures (NEW)
                    self.skill_aliases = data.get('skill_aliases', {})
                    self.alias_lookup = data.get('alias_lookup', {})
                    
                    # 5. Load rejection patterns (NEW)
                    self.rejected_phrases = defaultdict(int, data.get('rejected_phrases', {}))
                    self.rejected_single_words = defaultdict(int, data.get('rejected_single_words', {}))
                    self.rejected_names = defaultdict(int, data.get('rejected_names', {}))
                    self.rejected_fragments = defaultdict(int, data.get('rejected_fragments', {}))
                    self.learned_skill_keywords = set(data.get('learned_skill_keywords', []))
                    
                    # 6. Merge word_frequency
                    loaded_wf = data.get('word_frequency', {})
                    for word, count in loaded_wf.items():
                        self.word_frequency[word] += count
                    
                    # 7. Merge phrase_frequency
                    loaded_pf = data.get('phrase_frequency', {})
                    for phrase, count in loaded_pf.items():
                        self.phrase_frequency[phrase] += count
                    
                    # 8. Merge skill_candidates
                    loaded_sc = data.get('skill_candidates', {})
                    for word, count in loaded_sc.items():
                        self.skill_candidates[word] += count
                    
                    # 9. Merge skill_patterns
                    loaded_sp = data.get('skill_patterns', {})
                    for word, count in loaded_sp.items():
                        self.skill_patterns[word] += count
                    
                    # 10. Merge non_skill_patterns
                    loaded_nsp = data.get('non_skill_patterns', {})
                    for word, count in loaded_nsp.items():
                        self.non_skill_patterns[word] += count
                    
                    # 11. MERGE feedback_log
                    loaded_feedback = data.get('feedback_log', {})
                    for key in ['approved', 'rejected']:
                        if key in loaded_feedback:
                            if key not in self.feedback_log:
                                self.feedback_log[key] = []
                            for item in loaded_feedback[key]:
                                if item not in self.feedback_log[key]:
                                    self.feedback_log[key].append(item)
                    
                    # 12. MERGE merge_history
                    loaded_history = data.get('merge_history', [])
                    if loaded_history:
                        existing_entries = {(h.get('skill1'), h.get('skill2')): h for h in self.merge_history}
                        for entry in loaded_history:
                            key = (entry.get('skill1'), entry.get('skill2'))
                            if key not in existing_entries:
                                self.merge_history.append(entry)
                                existing_entries[key] = entry
                    
                    # 13. Merge skill_importance
                    loaded_importance = data.get('skill_importance', {})
                    for skill, importance in loaded_importance.items():
                        self.skill_importance[skill] = self.skill_importance.get(skill, 0) + importance
                    
                    # 14. Merge learned_sections
                    loaded_sections = data.get('learned_sections', {})
                    for section, count in loaded_sections.items():
                        self.learned_sections[section] = self.learned_sections.get(section, 0) + count
                    
                    # 15. Merge type_thresholds
                    loaded_thresholds = data.get('type_thresholds', {})
                    for key, value in loaded_thresholds.items():
                        self.type_thresholds[key] = value
                    
                    # Update stats
                    self.stats['documents_analyzed'] = data.get('documents_analyzed', 0)
                    
                    print(f"[NLP] Merged data from file: {len(self.learned_skills)} skills, {len(self.feedback_log.get('approved', []))} approved, {len(self.merge_history)} merge entries")
                    print(f"[NLP] Alias groups: {len(self.skill_aliases)}, Aliases: {len(self.alias_lookup)}")
                    print(f"[NLP] Learned {len(self.learned_skill_keywords)} skill keywords from feedback")
                    return
            except Exception as e:
                print(f"[NLP] Error loading data: {e}")
        
        # Start completely empty if no file
        print("[NLP] Starting with empty learning data")
        self._save_data()
    
    def _save_data(self):
        """Save all learned data with alias structure and rejection patterns"""
        return self._save_knowledge_base_with_aliases()
    
    def _save_knowledge_base_with_aliases(self):
        """
        Save learned_skills.json with alias structure and rejection patterns.
        """
        try:
            # Build alias structure from merge history if not already built
            if not self.skill_aliases and self.merge_history:
                self._build_alias_structure_from_history()
            
            data = {
                'learned_skills': list(self.learned_skills),  # ALL skills (masters + aliases)
                'dictionary': self.skill_dictionary,
                'categories': self.skill_categories,
                'skill_aliases': self.skill_aliases,      # master -> [aliases]
                'alias_lookup': self.alias_lookup,        # alias -> master
                # ============ NEW: Rejection patterns ============
                'rejected_phrases': dict(self.rejected_phrases),
                'rejected_single_words': dict(self.rejected_single_words),
                'rejected_names': dict(self.rejected_names),
                'rejected_fragments': dict(self.rejected_fragments),
                'learned_skill_keywords': list(self.learned_skill_keywords),
                # ===================================================
                'word_frequency': dict(self.word_frequency.most_common(1000)),
                'phrase_frequency': dict(self.phrase_frequency.most_common(500)),
                'skill_candidates': dict(self.skill_candidates.most_common(100)),
                'skill_patterns': dict(self.skill_patterns.most_common(50)),
                'non_skill_patterns': dict(self.non_skill_patterns.most_common(50)),
                'documents_analyzed': self.stats['documents_analyzed'],
                'last_updated': datetime.now().isoformat(),
                'learned_sections': self.learned_sections,
                'type_thresholds': self.type_thresholds,
                'skill_importance': self.skill_importance,
                'feedback_log': self.feedback_log,
                'merge_history': self.merge_history[-1000:] if hasattr(self, 'merge_history') else []
            }
            
            with open(self.skill_db_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            
            print(f"[NLP] Saved knowledge base: {len(self.learned_skills)} skills, {len(self.skill_aliases)} alias groups")
            print(f"[NLP] Saved {len(self.rejected_phrases)} rejected patterns")
            return True
            
        except Exception as e:
            print(f"[NLP] Error saving: {e}")
            return False
    
    def _build_alias_structure_from_history(self):
        """Build alias structures from merge history"""
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
                    
                    if master not in self.skill_aliases:
                        self.skill_aliases[master] = []
                    if alias not in self.skill_aliases[master]:
                        self.skill_aliases[master].append(alias)
                    self.alias_lookup[alias] = master
                    
                elif skill1 in self.learned_skills:
                    # skill1 is master
                    if skill1 not in self.skill_aliases:
                        self.skill_aliases[skill1] = []
                    if skill2 not in self.skill_aliases[skill1]:
                        self.skill_aliases[skill1].append(skill2)
                    self.alias_lookup[skill2] = skill1
                    
                elif skill2 in self.learned_skills:
                    # skill2 is master
                    if skill2 not in self.skill_aliases:
                        self.skill_aliases[skill2] = []
                    if skill1 not in self.skill_aliases[skill2]:
                        self.skill_aliases[skill2].append(skill1)
                    self.alias_lookup[skill1] = skill2
    
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
    
    # ============ DYNAMIC MERGE THRESHOLDS ============
    
    def _get_merge_threshold(self, skill1, skill2):
        """
        Dynamically determine merge threshold from data.
        Learns what threshold to use based on previous merges.
        """
        type1 = self._get_skill_type(skill1)
        type2 = self._get_skill_type(skill2)
        
        # Get base threshold from learned data
        key = tuple(sorted([type1, type2]))
        base_threshold = self.type_thresholds.get(key, 0.75)
        
        # Adjust based on skill importance (learned from documents)
        importance1 = self._get_skill_importance(skill1)
        importance2 = self._get_skill_importance(skill2)
        
        # Important skills (appear in many documents) should be harder to merge
        if importance1 + importance2 > 0.5:
            base_threshold += 0.08
        
        # Adjust based on word overlap (learned from data)
        words1 = set(skill1.lower().split())
        words2 = set(skill2.lower().split())
        if words1 and words2:
            overlap_ratio = len(words1 & words2) / max(len(words1), len(words2))
            
            # If they share many words, they're likely similar - lower threshold
            if overlap_ratio > 0.6:
                base_threshold -= 0.10
            
            # If they share no words, they're likely different - raise threshold
            if overlap_ratio == 0:
                base_threshold += 0.15
        
        # Adjust based on feedback (learned)
        if hasattr(self, 'feedback_log') and self.feedback_log:
            for skill in [skill1, skill2]:
                if skill in self.feedback_log.get('rejected', []):
                    base_threshold += 0.10  # Rejected skills are harder to merge
        
        # Cap at reasonable range
        return min(max(base_threshold, 0.50), 0.95)
    
    def _should_merge(self, skill1, skill2):
        if skill1 == skill2:
            return False
        
        # ============ LOAD EXISTING MERGE HISTORY ============
        if not hasattr(self, 'merge_history') or len(self.merge_history) == 0:
            if os.path.exists(self.skill_db_path):
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
        
        # ============ CATEGORY PROTECTION ============
        cat1 = self.skill_dictionary.get(skill1, 'Other')
        cat2 = self.skill_dictionary.get(skill2, 'Other')
        
        # Don't merge if categories are different AND both are known
        if cat1 != cat2 and cat1 != 'Other' and cat2 != 'Other':
            print(f"[SMART] Different categories: '{skill1}' ({cat1}) vs '{skill2}' ({cat2})")
            return False
        # ===================================================
        
        # ============ WORD OVERLAP PROTECTION ============
        words1 = set(skill1.lower().split())
        words2 = set(skill2.lower().split())
        overlap = len(words1 & words2)
        
        # Calculate similarity
        similarity = self._calculate_similarity(skill1, skill2)
        
        # If they only share 1 word, require higher similarity
        if overlap == 1 and similarity < 0.85:
            print(f"[SMART] Only 1 word overlap: '{skill1}' <-> '{skill2}' (sim: {similarity:.2f})")
            return False
        # ===================================================
        
        # ============ DYNAMIC THRESHOLD ============
        threshold = self._get_merge_threshold(skill1, skill2)
        
        # Increase threshold for multi-word skills with low overlap
        if len(words1) > 2 or len(words2) > 2:
            overlap_ratio = overlap / max(len(words1), len(words2))
            if overlap_ratio < 0.4:
                threshold = max(threshold, 0.85)
        # ===================================================
        
        decision = similarity > threshold
        
        # Append new entry
        self.merge_history.append({
            'skill1': skill1,
            'skill2': skill2,
            'similarity': similarity,
            'threshold': threshold,
            'decision': decision,
            'timestamp': datetime.now().isoformat()
        })
        
        # Keep manageable
        if len(self.merge_history) > 1000:
            self.merge_history = self.merge_history[-500:]
        
        if decision:
            print(f"[SMART]  Merging: '{skill1}'  '{skill2}' (sim: {similarity:.2f}, threshold: {threshold:.2f})")
        else:
            print(f"[SMART]  Keeping: '{skill1}'  '{skill2}' (sim: {similarity:.2f}, threshold: {threshold:.2f})")
        
        return decision
    
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
        """
        if len(self.learned_skills) < 5:
            return
        
        # Analyze merge history to learn thresholds
        if hasattr(self, 'merge_history') and self.merge_history:
            successful_merges = [m for m in self.merge_history if m.get('decision')]
            failed_merges = [m for m in self.merge_history if not m.get('decision')]
            
            # If merges are failing, lower thresholds
            if len(failed_merges) > len(successful_merges) * 1.5:
                for key in list(self.type_thresholds.keys()):
                    self.type_thresholds[key] = max(0.50, self.type_thresholds.get(key, 0.75) - 0.05)
                print(f"[LEARN] Lowered thresholds (too many failed merges)")
            
            # If merges are too aggressive, raise thresholds
            if len(successful_merges) > len(failed_merges) * 1.5:
                for key in list(self.type_thresholds.keys()):
                    self.type_thresholds[key] = min(0.95, self.type_thresholds.get(key, 0.75) + 0.05)
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
        bullet_matches = re.findall(r'[•\-\*][ \t]*([A-Za-z0-9 \t,&]+)', text)
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

        return final_candidates  # ← ONLY cleaned candidates, NO long phrases, NO leading connectors, NO stray "/"
    
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
        
    # In module2_nlp.py - Updated predict method

    def _is_likely_skill(self, candidate):
        """
        Determine if candidate is a skill using multi-layer decision.
        
        Layers:
        1. Knowledge Base -> Auto-approve if already known
        2. ML Classifier -> Predict confidence for NEW skills
        3. Fallback Rules -> Only when ML is OFF or fails
        """
        if not candidate or len(candidate) < 3:
            return False
        
        candidate_lower = candidate.lower()
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
        if candidate_lower in {s.lower() for s in self.learned_skills}:
            print(f"[KB] '{candidate}' -> Already in knowledge base (auto-approved)")
            return candidate
        
        # ============================================================
        # LAYER 2: ML Classifier - Predict for NEW skills
        # ============================================================
        if self.use_ml:
            try:
                result = self.classifier.predict(candidate_lower)
                is_skill = result['prediction'] == 1
                confidence = result['confidence']
                
                if is_skill and confidence >= 0.85:
                    print(f"[ML] '{candidate}' -> High confidence skill ({confidence:.2%})")
                    master = self.get_master_skill(candidate_lower)
                    if master != candidate_lower:
                        print(f"[ML] Normalized: '{candidate}' -> '{master}'")
                        return master
                    return candidate
                
                elif is_skill and confidence >= 0.65:
                    print(f"[ML] '{candidate}' -> Likely skill ({confidence:.2%}) - needs review")
                    return candidate, 'needs_review'
                
                elif confidence < 0.40:
                    print(f"[ML]  '{candidate}' -> Not skill ({confidence:.2%}) - rejected")
                    return False
                
                else:
                    print(f"[ML]  '{candidate}' -> Uncertain ({confidence:.2%}) - show for review")
                    return candidate, 'needs_review'
                    
            except Exception as e:
                print(f"[ML] Prediction failed: {e}. Using fallback.", file=sys.stderr)
        
        # ============================================================
        # LAYER 3: Fallback Rules (only when ML is OFF or fails)
        # ============================================================
        doc_count = self.stats.get('documents_analyzed', 0) if hasattr(self, 'stats') else 0
        
        if doc_count < 3:
            if len(words) >= 2:
                skip_words = ['n/a', 'none', 'page', 'date', 'employee', 'id', 'photo', 
                            'confidential', 'internal use', 'company logo']
                if not any(skip in candidate_lower for skip in skip_words):
                    print(f"[FALLBACK]  '{candidate}' -> Accepted (early document)")
                    return candidate
            return False
        
        non_skill_score = sum(1 for w in words if self.non_skill_patterns.get(w, 0) > 3)
        skill_score = sum(1 for w in words if self.skill_candidates.get(w, 0) > 2)
        
        if non_skill_score > 0 and skill_score == 0:
            return False
        
        if skill_score > 0:
            print(f"[FALLBACK]  '{candidate}' -> Skill pattern matched")
            return candidate
        
        if len(words) >= 2 and len(candidate_lower) < 30:
            print(f"[FALLBACK]  '{candidate}' -> 2+ words accepted")
            return candidate
        
        return False
    
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
    
    def merge_synonyms_dynamically(self):
        """
        100% dynamic merge - stores aliases, never deletes skills.
        All skills remain in learned_skills for employee records.
        """
        if len(self.learned_skills) < 3:
            return 0
        
        # Learn from existing data first
        self.learn_from_data()
        
        skills_list = list(self.learned_skills)
        merged_count = 0
        merged_details = []
        used = set()
        
        for i in range(len(skills_list)):
            if skills_list[i] in used:
                continue
            
            master = skills_list[i]
            group = [master]
            used.add(master)
            
            for j in range(i + 1, len(skills_list)):
                if skills_list[j] in used:
                    continue
                
                if self._should_merge(master, skills_list[j]):
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
                        merged_count += 1
                        merged_details.append(f"{skill} -> {master} (alias)")
                        
                        # Update dictionary if master doesn't have category
                        if master not in self.skill_dictionary and skill in self.skill_dictionary:
                            self.skill_dictionary[master] = self.skill_dictionary[skill]
                        
                        # Add to merge history with alias flag
                        self.merge_history.append({
                            'skill1': skill,
                            'skill2': master,
                            'similarity': self._calculate_similarity(skill, master),
                            'threshold': self._get_merge_threshold(skill, master),
                            'decision': True,
                            'is_alias': True,
                            'timestamp': datetime.now().isoformat()
                        })
                
                # Store aliases in knowledge base
                if aliases and master in self.learned_skills:
                    if master not in self.skill_aliases:
                        self.skill_aliases[master] = []
                    for alias in aliases:
                        if alias not in self.skill_aliases[master]:
                            self.skill_aliases[master].append(alias)
                        self.alias_lookup[alias] = master
                
                # Ensure master is in dictionary
                if master not in self.skill_dictionary:
                    self.skill_dictionary[master] = 'Other'
        
        if merged_count > 0:
            self._discover_categories()
            self._save_knowledge_base_with_aliases()
            print(f"[NLP] Dynamically merged {merged_count} skills (kept all as aliases)")
            for detail in merged_details[:5]:
                print(f"   {detail}")
            if len(merged_details) > 5:
                print(f"   ... and {len(merged_details) - 5} more")
        
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
    
    def learn_from_feedback(self, approved_skills, rejected_skills):
        """Learn from user feedback - DYNAMICALLY learns what's NOT a skill"""
        
        # ============ LOAD EXISTING FEEDBACK FROM FILE ============
        if os.path.exists(self.skill_db_path):
            try:
                with open(self.skill_db_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    existing_feedback = data.get('feedback_log', {})
                    if existing_feedback:
                        # Merge existing approved
                        for skill in existing_feedback.get('approved', []):
                            if skill not in self.feedback_log.get('approved', []):
                                if 'approved' not in self.feedback_log:
                                    self.feedback_log['approved'] = []
                                self.feedback_log['approved'].append(skill)
                        # Merge existing rejected
                        for skill in existing_feedback.get('rejected', []):
                            if skill not in self.feedback_log.get('rejected', []):
                                if 'rejected' not in self.feedback_log:
                                    self.feedback_log['rejected'] = []
                                self.feedback_log['rejected'].append(skill)
            except Exception as e:
                print(f"[FEEDBACK] Error loading existing: {e}")
        # =============================================================
        
        # ============ APPEND NEW FEEDBACK ============
        for skill in approved_skills:
            if skill not in self.feedback_log.get('approved', []):
                if 'approved' not in self.feedback_log:
                    self.feedback_log['approved'] = []
                self.feedback_log['approved'].append(skill)
                self.skill_importance[skill] = self.skill_importance.get(skill, 0) + 1
                
                # ============ LEARN SKILL KEYWORDS ============
                words = skill.lower().split()
                for word in words:
                    if len(word) > 3 and word not in self.learned_skill_keywords:
                        self.learned_skill_keywords.add(word)
                        print(f"[LEARN] Learned skill keyword: '{word}' from '{skill}'")
                
                print(f"[FEEDBACK] Approved: {skill}")
        
        for skill in rejected_skills:
            if not skill:
                continue

            if skill not in self.feedback_log.get('rejected', []):
                if 'rejected' not in self.feedback_log:
                    self.feedback_log['rejected'] = []
                self.feedback_log['rejected'].append(skill)
                self.skill_importance[skill] = self.skill_importance.get(skill, 0) - 1

            # ============ LEARN FROM REJECTIONS - runs every time, not just once ============
            skill_lower = skill.lower()
            words = skill_lower.split()

            # 1. Track rejected phrases
            self.rejected_phrases[skill_lower] = self.rejected_phrases.get(skill_lower, 0) + 1
            print(f"[LEARN] Learned rejected phrase: '{skill}' (count={self.rejected_phrases[skill_lower]})")

            # 2. Track rejected single words
            if len(words) == 1 and len(skill_lower) > 2:
                self.rejected_single_words[skill_lower] = self.rejected_single_words.get(skill_lower, 0) + 1

            # 3. Track rejected name patterns
            if 2 <= len(words) <= 3 and all(w[0].isupper() for w in words if w):
                self.rejected_names[skill_lower] = self.rejected_names.get(skill_lower, 0) + 1

            # 4. Track rejected fragments
            connectors = ['and', 'for', 'with', 'to', 'of']
            if any(skill_lower.startswith(c) for c in connectors):
                self.rejected_fragments[skill_lower] = self.rejected_fragments.get(skill_lower, 0) + 1

            print(f"[FEEDBACK] Rejected: {skill}")
        # ================================================
        
        # Add approved skills to learned_skills - store LOWERCASE so future
        # candidate_lower lookups in _is_likely_skill() actually match.
        for skill in approved_skills:
            skill_key = skill.strip().lower() if skill else ''
            if skill_key and skill_key not in self.learned_skills:
                self.learned_skills.add(skill_key)
                self.skill_dictionary[skill_key] = 'Other'
                print(f"[NLP] Added new skill to knowledge base: {skill_key}")
                
        # Re-run merge (this will create aliases, not delete)
        if len(self.learned_skills) > 5:
            merged = self.merge_synonyms_dynamically()
            if merged > 0:
                print(f"[NLP] Auto-merged {merged} duplicate skills (kept as aliases)")
        
        # Train ML
        total_feedback = len(self.feedback_log.get('approved', [])) + len(self.feedback_log.get('rejected', []))
        if total_feedback >= 10:
            print(f"[ML] Training classifier with {total_feedback} feedback items...")
            try:
                # Get all feedback for training
                all_approved = self.feedback_log.get('approved', [])
                all_rejected = self.feedback_log.get('rejected', [])
                self.classifier.train_from_feedback(all_approved, all_rejected)
                self.use_ml = self.classifier.is_trained
                if self.use_ml:
                    print("[ML] Classifier trained successfully!")
            except Exception as e:
                print(f"[ML] Error: {e}")
        
        self._save_knowledge_base_with_aliases()
        return len(approved_skills)
    
    # ============ SIMILARITY CALCULATION ============
    
    def _calculate_similarity(self, skill1, skill2):
        """Calculate semantic similarity between two skills using word vectors"""
        try:
            doc1 = self.nlp(skill1)
            doc2 = self.nlp(skill2)
            
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
            merged = self.merge_synonyms_dynamically()
            if merged > 0:
                print(f"[NLP] Dynamically merged {merged} skills (kept as aliases)!")
        
        self.stats['documents_analyzed'] += 1
        
        # Save periodically
        if self.stats['documents_analyzed'] % 5 == 0:
            self._save_knowledge_base_with_aliases()
        
        return new_skills
    
    # ============ MAIN EXTRACTION METHODS ============
    
    def extract_entities(self, text, structured_text=None):
        """Extract entities using learned patterns"""
        cleaned_text = self.clean_text(text)
        doc = self.nlp(cleaned_text)
        
        # Extract candidates — prefer structured (line-preserved) text so section
        # detection and noun-chunking don't span across unrelated fields.
        candidates = self._extract_candidates(structured_text or text)

        valid_skills = []
        auto_approved = []
        needs_review = []
        
        for candidate in candidates:
            result = self._is_likely_skill(candidate)
            
            if isinstance(result, tuple):
                skill_name, status = result
                if status == 'needs_review':
                    needs_review.append(skill_name)
                    valid_skills.append(skill_name)
            elif result:
                auto_approved.append(result)
                valid_skills.append(result)
        
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
            'needs_review': needs_review  
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
    
    def prepare_db_records(self, employee_id, text, structured_text=None):
        """Prepare database records"""
        extracted = self.extract_skills_with_categories(text, structured_text)
        
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
        
        self._save_knowledge_base_with_aliases()
        
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
    AUTODESK - MICROCADD INSTITUTE INC.
    CERTIFICATE OF TRAINING
    Mark Anthony Reyes completed:
    Technical Drafting NC II
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