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
        """Load all learned data"""
        if os.path.exists(self.skill_db_path):
            try:
                with open(self.skill_db_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    self.skill_dictionary = data.get('dictionary', {})
                    self.skill_categories = data.get('categories', {})
                    self.learned_skills = set(data.get('learned_skills', []))
                    self.word_frequency = Counter(data.get('word_frequency', {}))
                    self.phrase_frequency = Counter(data.get('phrase_frequency', {}))
                    self.skill_candidates = Counter(data.get('skill_candidates', {}))
                    self.skill_patterns = Counter(data.get('skill_patterns', {}))
                    self.non_skill_patterns = Counter(data.get('non_skill_patterns', {}))
                    self.stats['documents_analyzed'] = data.get('documents_analyzed', 0)
                    print(f"[NLP] Loaded: {len(self.skill_dictionary)} skills, {len(self.skill_categories)} categories")
                    return
            except Exception as e:
                print(f"[NLP] Error loading data: {e}")
        
        # Start completely empty
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
                'last_updated': datetime.now().isoformat()
            }
            with open(self.skill_db_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            return True
        except Exception as e:
            print(f"[NLP] Error saving data: {e}")
            return False
    
    def _extract_candidates(self, text):
        """Extract potential skill candidates - learns from data"""
        candidates = set()
        doc = self.nlp(text)
        
        # Extract noun phrases
        for chunk in doc.noun_chunks:
            chunk_text = chunk.text.strip()
            # Only consider reasonable length
            if 2 < len(chunk_text) < 50:
                candidates.add(chunk_text.lower())
        
        # Extract from bullet points
        bullet_matches = re.findall(r'[•▪➢►▸-]\s*([A-Za-z0-9\s,]+)', text)
        for match in bullet_matches:
            clean = match.strip()
            if 2 < len(clean) < 50:
                candidates.add(clean.lower())
        
        # Extract from competency sections
        competency_pattern = re.compile(r'(?:BASIC|COMMON|CORE|ELECTIVE)\s+COMPETENCIES\s*(.*?)(?=\n\n|\Z)', re.DOTALL | re.IGNORECASE)
        competency_matches = competency_pattern.findall(text)
        for match in competency_matches:
            items = re.split(r'[•▪➢►▸-]\s*|\d+\.\s*', match)
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
        
        return candidates
    
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
    
    def _is_likely_skill(self, candidate):
        """Dynamically determine if candidate is a skill"""
        if not candidate or len(candidate) < 3:
            return False
        
        candidate_lower = candidate.lower()
        words = candidate_lower.split()
        
        # If it's already a learned skill, accept it
        if candidate_lower in self.learned_skills:
            return True
        
        # If we have no data yet, accept longer phrases
        if self.stats['documents_analyzed'] < 3:
            return len(words) >= 2
        
        # Check if it's a known non-skill pattern
        non_skill_score = sum(1 for w in words if self.non_skill_patterns.get(w, 0) > 3)
        skill_score = sum(1 for w in words if self.skill_candidates.get(w, 0) > 2)
        
        # If it has high non-skill score and low skill score, reject
        if non_skill_score > 0 and skill_score == 0:
            return False
        
        # If it has skill score, accept
        if skill_score > 0:
            return True
        
        # If it contains a word that frequently appears near skills
        pattern_score = sum(1 for w in words if self.skill_patterns.get(w, 0) > 2)
        if pattern_score > 0:
            return True
        
        # If it's a phrase with good length, accept (it will be learned)
        if len(words) >= 2 and len(candidate_lower) < 30:
            return True
        
        return False
    
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
        
        # Learn new skills
        new_skills = []
        for skill in skills:
            if skill not in self.learned_skills:
                self.learned_skills.add(skill)
                new_skills.append(skill)
                self.stats['new_skills_learned'] += 1
        
        # Re-discover categories periodically
        if len(new_skills) > 0 or len(self.learned_skills) % 10 == 0:
            self._discover_categories()
        
        self.stats['documents_analyzed'] += 1
        
        # Save periodically
        if self.stats['documents_analyzed'] % 5 == 0:
            self._save_data()
        
        return new_skills
    
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
            'documents_analyzed': self.stats['documents_analyzed']
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