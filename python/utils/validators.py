"""
📊 Accuracy Validation Utilities
Calculates CER (Character Error Rate) and WER (Word Error Rate)
"""
import re
import json
from typing import Dict, List, Tuple

# Import Levenshtein (both packages are installed)
import Levenshtein

class AccuracyValidator:
    """Validate OCR accuracy with CER and WER metrics"""
    
    def __init__(self):
        """Initialize validator"""
        pass
    
    def calculate_cer(self, ground_truth: str, ocr_output: str) -> float:
        """Calculate Character Error Rate (CER)"""
        gt = self._clean_text(ground_truth)
        ocr = self._clean_text(ocr_output)
        
        distance = Levenshtein.distance(gt, ocr)
        
        if len(gt) == 0:
            return 1.0 if len(ocr) > 0 else 0.0
        
        cer = distance / len(gt)
        return min(cer, 1.0)
    
    def calculate_wer(self, ground_truth: str, ocr_output: str) -> float:
        """Calculate Word Error Rate (WER)"""
        gt_words = self._tokenize_words(ground_truth)
        ocr_words = self._tokenize_words(ocr_output)
        
        # For word-level comparison
        gt_string = ' '.join(gt_words)
        ocr_string = ' '.join(ocr_words)
        
        distance = Levenshtein.distance(gt_string, ocr_string)
        
        if len(gt_words) == 0:
            return 1.0 if len(ocr_words) > 0 else 0.0
        
        wer = distance / len(gt_words)
        return min(wer, 1.0)
    
    def calculate_accuracy(self, ground_truth: str, ocr_output: str) -> Dict:
        """Calculate comprehensive accuracy metrics"""
        cer = self.calculate_cer(ground_truth, ocr_output)
        wer = self.calculate_wer(ground_truth, ocr_output)
        
        cer_accuracy = max(0, (1 - cer) * 100)
        wer_accuracy = max(0, (1 - wer) * 100)
        
        gt_chars = len(self._clean_text(ground_truth))
        ocr_chars = len(self._clean_text(ocr_output))
        gt_words = len(self._tokenize_words(ground_truth))
        ocr_words = len(self._tokenize_words(ocr_output))
        
        distance_chars = Levenshtein.distance(
            self._clean_text(ground_truth),
            self._clean_text(ocr_output)
        )
        
        return {
            'cer': round(cer, 4),
            'wer': round(wer, 4),
            'cer_accuracy': round(cer_accuracy, 2),
            'wer_accuracy': round(wer_accuracy, 2),
            'ground_truth_chars': gt_chars,
            'ocr_chars': ocr_chars,
            'ground_truth_words': gt_words,
            'ocr_words': ocr_words,
            'char_difference': gt_chars - ocr_chars,
            'word_difference': gt_words - ocr_words,
            'char_distance': distance_chars,
            'word_distance': abs(gt_words - ocr_words)
        }
    
    def validate_batch(self, validation_pairs: List[Tuple[str, str]]) -> Dict:
        """Validate a batch of document pairs"""
        results = []
        total_cer = 0
        total_wer = 0
        
        for idx, (gt, ocr) in enumerate(validation_pairs):
            metrics = self.calculate_accuracy(gt, ocr)
            metrics['document_id'] = idx + 1
            results.append(metrics)
            
            total_cer += metrics['cer']
            total_wer += metrics['wer']
        
        n = len(validation_pairs)
        avg_cer = total_cer / n if n > 0 else 0
        avg_wer = total_wer / n if n > 0 else 0
        
        return {
            'total_documents': n,
            'average_cer': round(avg_cer, 4),
            'average_wer': round(avg_wer, 4),
            'average_cer_accuracy': round(max(0, (1 - avg_cer) * 100), 2),
            'average_wer_accuracy': round(max(0, (1 - avg_wer) * 100), 2),
            'individual_results': results,
            'summary': {
                'documents_with_cer_below_0.5': sum(1 for r in results if r['cer'] < 0.5),
                'documents_with_wer_below_0.5': sum(1 for r in results if r['wer'] < 0.5),
                'best_cer': min([r['cer'] for r in results]) if results else 0,
                'best_wer': min([r['wer'] for r in results]) if results else 0,
                'worst_cer': max([r['cer'] for r in results]) if results else 0,
                'worst_wer': max([r['wer'] for r in results]) if results else 0
            }
        }
    
    def _clean_text(self, text: str) -> str:
        """Clean text for comparison"""
        text = ' '.join(text.split())
        text = re.sub(r'[^a-zA-Z0-9\s.,!?]', '', text)
        return text
    
    def _tokenize_words(self, text: str) -> List[str]:
        """Split text into word tokens"""
        words = re.findall(r'\b\w+\b', text.lower())
        return words


# Example usage
if __name__ == "__main__":
    validator = AccuracyValidator()
    
    # Sample validation pair
    ground_truth = "Experienced Electrical Engineer with 5+ years in AutoCAD design"
    ocr_output = "Experienced Electrical Engineer with 5+ years in Auto CAD design"
    
    result = validator.calculate_accuracy(ground_truth, ocr_output)
    print("=" * 60)
    print("📊 OCR Accuracy Validation")
    print("=" * 60)
    print(json.dumps(result, indent=2))
    
    # Test batch validation
    print("\n📊 Batch Validation Test")
    validation_set = [
        ("Hello World", "Hello World"),
        ("Hello World", "Hello Worid"),
        ("Testing OCR", "Testing 0CR")
    ]
    batch_result = validator.validate_batch(validation_set)
    print(json.dumps(batch_result, indent=2))