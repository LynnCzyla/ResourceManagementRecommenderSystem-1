"""
🔗 Module 3: Integration & Workflow Orchestration
Combines OCR and NLP modules for complete document processing
"""
import json
import os
from datetime import datetime
from pathlib import Path

# Fix imports - use relative imports
from modules.module1_ocr import OCRProcessor
from modules.module2_nlp import NLPProcessor

class DocumentProcessor:
    """Complete document processing workflow"""
    
    def __init__(self, config=None):
        self.config = config or {}
        self.ocr = OCRProcessor(config)
        self.nlp = NLPProcessor(
            model_name=self.config.get('spacy_model', 'en_core_web_md')
        )
        self.process_log = []
    
    def process_document_complete(self, image_path, employee_id, document_type):
        """Complete document processing pipeline"""
        doc_id = f"DOC-{datetime.now().strftime('%Y%m%d')}-{employee_id}"
        
        log_entry = {
            'document_id': doc_id,
            'employee_id': employee_id,
            'document_type': document_type,
            'start_time': datetime.now().isoformat()
        }
        
        try:
            # Step 1: Module 1 - OCR Processing
            print(f"📦 Module 1: Processing document {doc_id}")
            ocr_result = self.ocr.process_document(
                image_path, doc_id, employee_id, document_type
            )
            
            if not ocr_result['success']:
                raise Exception("OCR processing failed")
            
            log_entry['ocr_complete'] = datetime.now().isoformat()
            log_entry['ocr_confidence'] = ocr_result['ocr_data']['ocr_confidence']
            log_entry['ocr_word_count'] = ocr_result['ocr_data']['word_count']
            
            # Step 2: Module 2 - NLP Processing
            print(f"🤖 Module 2: NLP processing for {doc_id}")
            nlp_result = self.nlp.prepare_db_records(
                employee_id, 
                ocr_result['ocr_data']['cleaned_ocr_text']
            )
            
            log_entry['nlp_complete'] = datetime.now().isoformat()
            log_entry['skills_found'] = nlp_result['summary']['total_skills_found']
            log_entry['licenses_found'] = nlp_result['summary']['licenses_found']
            
            # Combine results
            result = {
                'success': True,
                'document_id': doc_id,
                'employee_id': employee_id,
                'document_type': document_type,
                'processing_timestamp': datetime.now().isoformat(),
                'ocr': {
                    'raw_text': ocr_result['ocr_data']['raw_ocr_text'],
                    'cleaned_text': ocr_result['ocr_data']['cleaned_ocr_text'],
                    'confidence': ocr_result['ocr_data']['ocr_confidence'],
                    'word_count': ocr_result['ocr_data']['word_count'],
                    'char_count': ocr_result['ocr_data']['char_count'],
                    'processing_time': ocr_result['ocr_data']['processing_time_seconds']
                },
                'nlp': {
                    'skills': nlp_result['skills_master'],
                    'categorized_skills': nlp_result['employee_update']['skills_extracted'],
                    'prc_license': nlp_result['employee_update']['prc_license_num'],
                    'prc_verified': nlp_result['employee_update']['prc_verified']
                },
                'db_records': {
                    'documents_table': ocr_result['ocr_data'],
                    'employees_update': nlp_result['employee_update'],
                    'skills_master': nlp_result['skills_master'],
                    'employee_skills': nlp_result['employee_skills']
                },
                'summary': {
                    'total_skills_extracted': nlp_result['summary']['total_skills_found'],
                    'licenses_found': nlp_result['summary']['licenses_found'],
                    'processing_success': True
                }
            }
            
            log_entry['status'] = 'success'
            log_entry['end_time'] = datetime.now().isoformat()
            
        except Exception as e:
            log_entry['status'] = 'failed'
            log_entry['error'] = str(e)
            log_entry['end_time'] = datetime.now().isoformat()
            
            result = {
                'success': False,
                'document_id': doc_id,
                'employee_id': employee_id,
                'error': str(e),
                'log_entry': log_entry
            }
        
        self.process_log.append(log_entry)
        self._save_log(log_entry)
        
        return result
    
    def _save_log(self, log_entry):
        """Save processing log to file"""
        log_dir = Path(__file__).parent.parent.parent / 'shared-data' / 'logs'
        log_dir.mkdir(parents=True, exist_ok=True)
        
        log_file = log_dir / f"processing_{datetime.now().strftime('%Y%m%d')}.json"
        
        if log_file.exists():
            with open(log_file, 'r') as f:
                existing = json.load(f)
        else:
            existing = []
        
        existing.append(log_entry)
        
        with open(log_file, 'w') as f:
            json.dump(existing, f, indent=2)
    
    def get_stats(self):
        """Get overall processing statistics"""
        # Get stats from both processors
        ocr_stats = self.ocr.get_stats()
        nlp_stats = self.nlp.get_stats()
        
        return {
            'ocr': ocr_stats,
            'nlp': nlp_stats,
            'total_documents_processed': len(self.process_log),
            'successful_documents': sum(1 for log in self.process_log if log.get('status') == 'success'),
            'failed_documents': sum(1 for log in self.process_log if log.get('status') == 'failed')
        }