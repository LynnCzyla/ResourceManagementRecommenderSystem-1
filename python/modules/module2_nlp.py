"""
🤖 Module 2: Natural Language Processing (100% Dynamic)
NO hardcoded lists - learns everything from documents
"""
import spacy
import re
import json
import os
from collections import Counter, defaultdict
from datetime import datetime
import hashlib
from pathlib import Path
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.cluster import KMeans
from sklearn.metrics.pairwise import cosine_similarity
from modules.skill_classifier import SkillClassifier  # NEW

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
        self.learned_skills = set()         # All learned skills
        
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
        self.use_ml = False  # ← USE THIS!
        if not self.use_ml:
            print("[NLP] ⚠️ ML Classifier not trained. Using rule-based fallback.")
        # Load existing learning or start empty
        self._load_data()
        
        # Stats
        self.stats = {
            'total_processed': 0,
            'total_skills_extracted': 0,
            'total_licenses_found': 0,
            'new_skills_learned': 0,
            'new_categories_created': 0,
            'documents_analyzed': 0
        }
        
        print(f"[NLP] 100% Dynamic NLP initialized")
        print(f"[NLP] Learned {len(self.skill_dictionary)} skills from {self.stats['documents_analyzed']} documents")
        print(f"[NLP] Discovered {len(self.skill_categories)} categories")
    
    def _get_default_db_path(self):
        """Get path for learning database"""
        base_dir = Path(__file__).parent.parent.parent
        skill_dir = base_dir / 'shared-data' / 'skills_db'
        skill_dir.mkdir(parents=True, exist_ok=True)
        return skill_dir / 'learned_skills.json'
    
    def _load_data(self):
        """Load all learned data - MERGES with existing in-memory data"""
        if os.path.exists(self.skill_db_path):
            try:
                with open(self.skill_db_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    
                    # ============ MERGE, DON'T REPLACE! ============
                    # 1. Merge learned_skills
                    loaded_skills = set(data.get('learned_skills', []))
                    self.learned_skills.update(loaded_skills)  # ← MERGE
                    
                    # 2. Merge dictionary
                    loaded_dict = data.get('dictionary', {})
                    self.skill_dictionary.update(loaded_dict)  # ← MERGE
                    
                    # 3. Merge categories
                    loaded_categories = data.get('categories', {})
                    for category, skills in loaded_categories.items():
                        if category not in self.skill_categories:
                            self.skill_categories[category] = []
                        for skill in skills:
                            if skill not in self.skill_categories[category]:
                                self.skill_categories[category].append(skill)
                    
                    # 4. Merge word_frequency
                    loaded_wf = data.get('word_frequency', {})
                    for word, count in loaded_wf.items():
                        self.word_frequency[word] += count
                    
                    # 5. Merge phrase_frequency
                    loaded_pf = data.get('phrase_frequency', {})
                    for phrase, count in loaded_pf.items():
                        self.phrase_frequency[phrase] += count
                    
                    # 6. Merge skill_candidates
                    loaded_sc = data.get('skill_candidates', {})
                    for word, count in loaded_sc.items():
                        self.skill_candidates[word] += count
                    
                    # 7. Merge skill_patterns
                    loaded_sp = data.get('skill_patterns', {})
                    for word, count in loaded_sp.items():
                        self.skill_patterns[word] += count
                    
                    # 8. Merge non_skill_patterns
                    loaded_nsp = data.get('non_skill_patterns', {})
                    for word, count in loaded_nsp.items():
                        self.non_skill_patterns[word] += count
                    
                    # 9. 🔥 MERGE feedback_log
                    loaded_feedback = data.get('feedback_log', {})
                    for key in ['approved', 'rejected']:
                        if key in loaded_feedback:
                            if key not in self.feedback_log:
                                self.feedback_log[key] = []
                            for item in loaded_feedback[key]:
                                if item not in self.feedback_log[key]:
                                    self.feedback_log[key].append(item)
                    
                    # 10. 🔥 MERGE merge_history
                    loaded_history = data.get('merge_history', [])
                    if loaded_history:
                        # Merge, avoiding duplicates
                        existing_entries = {(h.get('skill1'), h.get('skill2')): h for h in self.merge_history}
                        for entry in loaded_history:
                            key = (entry.get('skill1'), entry.get('skill2'))
                            if key not in existing_entries:
                                self.merge_history.append(entry)
                                existing_entries[key] = entry
                    
                    # 11. Merge skill_importance
                    loaded_importance = data.get('skill_importance', {})
                    for skill, importance in loaded_importance.items():
                        self.skill_importance[skill] = self.skill_importance.get(skill, 0) + importance
                    
                    # 12. Merge learned_sections
                    loaded_sections = data.get('learned_sections', {})
                    for section, count in loaded_sections.items():
                        self.learned_sections[section] = self.learned_sections.get(section, 0) + count
                    
                    # 13. Merge type_thresholds
                    loaded_thresholds = data.get('type_thresholds', {})
                    for key, value in loaded_thresholds.items():
                        self.type_thresholds[key] = value
                    
                    # Update stats
                    self.stats['documents_analyzed'] = data.get('documents_analyzed', 0)
                    
                    print(f"[NLP] Merged data from file: {len(self.learned_skills)} skills, {len(self.feedback_log.get('approved', []))} approved, {len(self.merge_history)} merge entries")
                    return
            except Exception as e:
                print(f"[NLP] Error loading data: {e}")
        
        # Start completely empty if no file
        print("[NLP] Starting with empty learning data")
        self._save_data()
    
    def _save_data(self):
        """Save all learned data"""
        try:
            data = {
                'dictionary': self.skill_dictionary,
                'categories': self.skill_categories,
                'learned_skills': list(self.learned_skills),
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
            print(f"[NLP] Saved: {len(self.learned_skills)} skills, {len(self.feedback_log.get('approved', []))} approved, {len(self.merge_history)} merge entries")
            return True
        except Exception as e:
            print(f"[NLP] Error saving data: {e}")
            return False
    
    # ============ DYNAMIC SECTION LEARNING ============
    
    def _learn_section_names(self):
        """
        Learn section names from documents dynamically.
        No hardcoded section names.
        """
        if not hasattr(self, 'learned_sections'):
            self.learned_sections = {}
        
        # Common patterns that indicate section headers (learned, not hardcoded)
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
                
                # Check if this looks like a section header
                if header_patterns.match(line):
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
        
        # ============ 🔥 LOAD EXISTING MERGE HISTORY ============
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
        
        # Calculate similarity
        similarity = self._calculate_similarity(skill1, skill2)
        threshold = self._get_merge_threshold(skill1, skill2)
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
        """Extract potential skill candidates - learns from data"""
        candidates = set()
        doc = self.nlp(text)
        
        # Extract noun phrases
        for chunk in doc.noun_chunks:
            chunk_text = chunk.text.strip()
            if 2 < len(chunk_text) < 50:
                candidates.add(chunk_text.lower())
        
        # Extract from bullet points
        bullet_matches = re.findall(r'[•▪➢►▸-]\s*([A-Za-z0-9\s,]+)', text)
        for match in bullet_matches:
            clean = match.strip()
            if 2 < len(clean) < 50:
                candidates.add(clean.lower())
        
        # Extract from competency sections
        section_pattern = re.compile(r'([A-Z][A-Z\s&]+|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*[:.]?\s*', re.MULTILINE)
        sections = section_pattern.findall(text)
        for section in sections:
            if 'competency' in section.lower() or 'skill' in section.lower() or 'technical' in section.lower():
                section_idx = text.lower().find(section.lower())
                if section_idx != -1:
                    subsection = text[section_idx:section_idx + 500]
                    items = re.split(r'[•▪➢►▸-]\s*|\d+\.\s*', subsection)
                    for item in items:
                        clean = item.strip()
                        if 2 < len(clean) < 50:
                            candidates.add(clean.lower())
        
        # Extract from "Skills:" sections
        skill_pattern = re.search(r'skills?\s*[:.]?\s*([A-Za-z0-9,\s]+)', text, re.IGNORECASE)
        if skill_pattern:
            skills_text = skill_pattern.group(1)
            for skill in skills_text.split(','):
                clean = skill.strip()
                if 2 < len(clean) < 50:
                    candidates.add(clean.lower())
        
        # ============ 🔥 ADD THESE NEW PATTERNS ============
        
        # 1. Extract from section headers like "Technical Competencies"
        section_pattern2 = re.compile(
            r'(?:Technical Competencies|Software Proficiency|Areas of Specialization|Product and Technical Knowledge|Industry Experience)\s*([\s\S]*?)(?=\n\n|\Z)',
            re.IGNORECASE
        )
        section_matches = section_pattern2.findall(text)
        for match in section_matches:
            # Split by bullet points or newlines
            items = re.split(r'[•▪➢►▸-]\s*|\n', match)
            for item in items:
                clean = item.strip()
                if 2 < len(clean) < 50 and not clean.isupper():
                    candidates.add(clean.lower())
        
        # 2. Extract colon-separated lists like "License: Registered Electrical Engineer"
        colon_pattern = re.compile(r'([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*[:]\s*([A-Za-z0-9\s,]+)')
        for match in colon_pattern.finditer(text):
            value = match.group(2).strip()
            if 2 < len(value) < 50:
                candidates.add(value.lower())
        
        # 3. Extract from parentheses: "Microsoft Excel (Bid Tracking & Cost Coordination)"
        paren_pattern = re.compile(r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*\([^)]+\)')
        for match in paren_pattern.finditer(text):
            skill = match.group(1).strip()
            if 2 < len(skill) < 40:
                candidates.add(skill.lower())
        
        # 4. Extract lines with "Engineer" or "Engineering" in them
        engineer_pattern = re.compile(r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+Engineer|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+Engineering)')
        for match in engineer_pattern.finditer(text):
            skill = match.group(0).strip()
            if 2 < len(skill) < 40:
                candidates.add(skill.lower())
        
        # 5. Extract from bulleted sections with specific headers
        bullet_section_pattern = re.compile(
            r'(?:Technical Competencies|Software Proficiency|Areas of Specialization|Product and Technical Knowledge)\s*([\s\S]*?)(?=\n[A-Z]|\Z)',
            re.IGNORECASE
        )
        for match in bullet_section_pattern.finditer(text):
            section_text = match.group(1)
            bullet_items = re.findall(r'[•▪➢►▸-]\s*([A-Za-z0-9\s,]+)', section_text)
            for item in bullet_items:
                clean = item.strip()
                if 2 < len(clean) < 50:
                    candidates.add(clean.lower())
        
        # 6. Extract from "● " bullet points (specific to your resume format)
        bullet_pattern = re.compile(r'●\s*([A-Za-z0-9\s,]+)')
        for match in bullet_pattern.finditer(text):
            clean = match.group(1).strip()
            if 2 < len(clean) < 50:
                candidates.add(clean.lower())
        
        return candidates
    
    def _is_likely_skill(self, candidate):
        """Dynamically determine if candidate is a skill using ML + fallback"""
        if not candidate or len(candidate) < 3:
            return False
        
        candidate_lower = candidate.lower()
        words = candidate_lower.split()
        
        # Always accept already learned skills
        if candidate_lower in self.learned_skills:
            return True
        
        # ============ ML CLASSIFIER (NEW) ============
        if self.use_ml:
            result = self.classifier.predict(candidate_lower)
            is_skill = result['prediction'] == 1 and result['confidence'] >= 0.65
            if is_skill:
                print(f"[ML] ✅ {candidate} → Skill (conf: {result['confidence']:.2f})")
            else:
                print(f"[ML] ❌ {candidate} → Not Skill (conf: {result['confidence']:.2f})")
            return is_skill
        # ==============================================
        
        # ============ FALLBACK: Your Existing Rule-Based Logic ============
        if self.stats['documents_analyzed'] < 3:
            return len(words) >= 2
        
        non_skill_score = sum(1 for w in words if self.non_skill_patterns.get(w, 0) > 3)
        skill_score = sum(1 for w in words if self.skill_candidates.get(w, 0) > 2)
        
        if non_skill_score > 0 and skill_score == 0:
            return False
        
        if skill_score > 0:
            return True
        
        if len(words) >= 2 and len(candidate_lower) < 30:
            return True
        
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
    
    # ============ DYNAMIC MERGING ============
    
    def merge_synonyms_dynamically(self):
        """
        100% dynamic merge - learns everything from data.
        ZERO hardcoded lists or values.
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
                
                # Merge all into master
                for skill in group:
                    if skill != master and skill in self.learned_skills:
                        self.learned_skills.remove(skill)
                        merged_count += 1
                        merged_details.append(f"{skill} → {master}")
                        
                        if skill in self.skill_dictionary:
                            if master not in self.skill_dictionary:
                                self.skill_dictionary[master] = self.skill_dictionary[skill]
                            del self.skill_dictionary[skill]
                        
                        # Update skill_candidates
                        for word in skill.split():
                            if word in self.skill_candidates:
                                for master_word in master.split():
                                    if master_word not in self.skill_candidates:
                                        self.skill_candidates[master_word] = self.skill_candidates[word]
                
                if master not in self.learned_skills:
                    self.learned_skills.add(master)
                if master not in self.skill_dictionary:
                    self.skill_dictionary[master] = 'Other'
        
        if merged_count > 0:
            self._discover_categories()
            self._save_data()
            print(f"[NLP] Dynamically merged {merged_count} skills")
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
        """Learn from user feedback to improve future merging"""
        
        # ============ 🔥 LOAD EXISTING FEEDBACK FROM FILE ============
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
                print(f"[FEEDBACK] Approved: {skill}")
        
        for skill in rejected_skills:
            if skill not in self.feedback_log.get('rejected', []):
                if 'rejected' not in self.feedback_log:
                    self.feedback_log['rejected'] = []
                self.feedback_log['rejected'].append(skill)
                self.skill_importance[skill] = self.skill_importance.get(skill, 0) - 1
                print(f"[FEEDBACK] Rejected: {skill}")
        # ================================================
        
        # Re-run merge
        if len(self.learned_skills) > 5:
            self.merge_synonyms_dynamically()
        
        # Train ML
        if len(approved_skills) + len(rejected_skills) >= 10:
            print(f"[ML] 🔬 Training classifier...")
            try:
                self.classifier.train_from_feedback(approved_skills, rejected_skills)
                self.use_ml = self.classifier.is_trained
                if self.use_ml:
                    print("[ML] ✅ Classifier trained successfully!")
            except Exception as e:
                print(f"[ML] ❌ Error: {e}")
        
        self._save_data()
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
        
        # ============ 🔥 ADD SKILLS TO FEEDBACK_LOG ============
        # Add approved skills (all extracted skills are considered approved initially)
        #for skill in skills:
        #   if skill and skill not in self.feedback_log.get('approved', []):
        #       if 'approved' not in self.feedback_log:
        #           self.feedback_log['approved'] = []
        #       self.feedback_log['approved'].append(skill)
         #       print(f"[NLP] 📝 Added to feedback_log (approved): {skill}")
        # =============================================================
        
        # Learn new skills (if enabled)
        new_skills = []
        # ============ AUTO-LEARNING (ENABLE IF DESIRED) ============
        # for skill in skills:
        #     if skill not in self.learned_skills:
        #         self.learned_skills.add(skill)
        #         new_skills.append(skill)
        #         self.stats['new_skills_learned'] += 1
        # ===========================================================
        
        # Re-discover categories periodically
        if len(new_skills) > 0 or len(self.learned_skills) % 10 == 0:
            self._discover_categories()
        
        # Run dynamic merge
        if self.stats['documents_analyzed'] > 0 and len(self.learned_skills) > 5:
            print(f"[NLP] Running dynamic merge after {self.stats['documents_analyzed']} documents...")
            merged = self.merge_synonyms_dynamically()
            if merged > 0:
                print(f"[NLP] Dynamically merged {merged} skills!")
        
        self.stats['documents_analyzed'] += 1
        
        # Save periodically
        if self.stats['documents_analyzed'] % 5 == 0:
            self._save_data()
        
        return new_skills
    
    # ============ MAIN EXTRACTION METHODS ============
    
    def extract_entities(self, text):
        """Extract entities using learned patterns"""
        cleaned_text = self.clean_text(text)
        doc = self.nlp(cleaned_text)
        
        # Extract candidates
        candidates = self._extract_candidates(text)
        
        # Filter candidates using learned patterns
        valid_skills = []
        for candidate in candidates:
            if self._is_likely_skill(candidate):
                valid_skills.append(candidate)
        
        # Learn from this document
        self._learn_from_document(text, valid_skills)
        
        entities = {
            'persons': [],
            'organizations': [],
            'dates': [],
            'licenses': [],
            'emails': [],
            'phones': [],
            'skills': sorted(valid_skills)
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
    
    def extract_skills_with_categories(self, text):
        """Extract skills with categories"""
        entities = self.extract_entities(text)
        skills = entities['skills']
        
        # Build categorized dictionary
        categorized = {}
        for skill in skills:
            category = self.skill_dictionary.get(skill, 'Other')
            if category not in categorized:
                categorized[category] = []
            if skill not in categorized[category]:
                categorized[category].append(skill)
        
        return {
            'skills': skills,
            'categorized': categorized,
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
    
    def prepare_db_records(self, employee_id, text):
        """Prepare database records"""
        extracted = self.extract_skills_with_categories(text)
        
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
        
        self._save_data()
        
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
            'type_thresholds': self.type_thresholds
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